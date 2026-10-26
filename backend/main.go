package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

type Product struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
	Stock       int     `json:"stock"`
}

type OrderItemRequest struct {
	ProductID int `json:"product_id"`
	Quantity  int `json:"quantity"`
}

type OrderRequest struct {
	CustomerName    string             `json:"customer_name"`
	CustomerAddress string             `json:"customer_address"`
	Items           []OrderItemRequest `json:"items"`
}

var db *sql.DB

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "E-commerce API is running",
	})
}

func productsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(
			"SELECT id, name, description, price, stock FROM products ORDER BY id DESC",
		)
		if err != nil {
			http.Error(w, "Could not fetch products", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		products := []Product{}
		for rows.Next() {
			var p Product
			if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock); err != nil {
				http.Error(w, "Could not read products", http.StatusInternalServerError)
				return
			}
			products = append(products, p)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, "Could not read products", http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusOK, products)

	case http.MethodPost:
		var p Product
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		p.Name = strings.TrimSpace(p.Name)
		if p.Name == "" || p.Price < 0 || p.Stock < 0 {
			http.Error(w, "Name is required; price and stock cannot be negative", http.StatusBadRequest)
			return
		}

		result, err := db.Exec(
			"INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)",
			p.Name, p.Description, p.Price, p.Stock,
		)
		if err != nil {
			http.Error(w, "Could not create product", http.StatusInternalServerError)
			return
		}

		id, err := result.LastInsertId()
		if err != nil {
			http.Error(w, "Could not get product ID", http.StatusInternalServerError)
			return
		}
		p.ID = int(id)
		respondJSON(w, http.StatusCreated, p)

	default:
		w.Header().Set("Allow", "GET, POST")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func productHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id < 1 {
		http.Error(w, "Invalid product ID", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		var p Product
		err := db.QueryRow(
			"SELECT id, name, description, price, stock FROM products WHERE id = ?",
			id,
		).Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock)

		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Product not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Could not fetch product", http.StatusInternalServerError)
			return
		}
		respondJSON(w, http.StatusOK, p)

	case http.MethodPut:
		var p Product
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "Invalid JSON body", http.StatusBadRequest)
			return
		}

		p.Name = strings.TrimSpace(p.Name)
		if p.Name == "" || p.Price < 0 || p.Stock < 0 {
			http.Error(w, "Name is required; price and stock cannot be negative", http.StatusBadRequest)
			return
		}

		result, err := db.Exec(
			"UPDATE products SET name = ?, description = ?, price = ?, stock = ? WHERE id = ?",
			p.Name, p.Description, p.Price, p.Stock, id,
		)
		if err != nil {
			http.Error(w, "Could not update product", http.StatusInternalServerError)
			return
		}

		affected, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Could not confirm update", http.StatusInternalServerError)
			return
		}
		if affected == 0 {
			http.Error(w, "Product not found", http.StatusNotFound)
			return
		}

		p.ID = id
		respondJSON(w, http.StatusOK, p)

	case http.MethodDelete:
		result, err := db.Exec("DELETE FROM products WHERE id = ?", id)
		if err != nil {
			http.Error(w, "Could not delete product", http.StatusInternalServerError)
			return
		}

		affected, err := result.RowsAffected()
		if err != nil {
			http.Error(w, "Could not confirm deletion", http.StatusInternalServerError)
			return
		}
		if affected == 0 {
			http.Error(w, "Product not found", http.StatusNotFound)
			return
		}

		w.WriteHeader(http.StatusNoContent)

	default:
		w.Header().Set("Allow", "GET, PUT, DELETE")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func ordersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid order data", http.StatusBadRequest)
		return
	}

	req.CustomerName = strings.TrimSpace(req.CustomerName)
	req.CustomerAddress = strings.TrimSpace(req.CustomerAddress)

	if req.CustomerName == "" || req.CustomerAddress == "" {
		http.Error(w, "Customer name and address are required", http.StatusBadRequest)
		return
	}

	if len(req.Items) == 0 {
		http.Error(w, "Cart is empty", http.StatusBadRequest)
		return
	}

	type OrderLine struct {
		ProductID int
		Name      string
		Price     float64
		Quantity  int
	}

	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Could not start order", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	lines := make([]OrderLine, 0, len(req.Items))
	total := 0.0

	// Validate products and calculate prices on the server.
	for _, item := range req.Items {
		if item.ProductID < 1 || item.Quantity < 1 {
			http.Error(w, "Invalid product or quantity", http.StatusBadRequest)
			return
		}

		var line OrderLine
		var stock int

		err := tx.QueryRow(
			`SELECT id, name, price, stock
             FROM products WHERE id = ?`,
			item.ProductID,
		).Scan(&line.ProductID, &line.Name, &line.Price, &stock)

		if errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Product not found", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Could not check product", http.StatusInternalServerError)
			return
		}

		if item.Quantity > stock {
			http.Error(
				w,
				"Insufficient stock for "+line.Name,
				http.StatusConflict,
			)
			return
		}

		line.Quantity = item.Quantity
		lines = append(lines, line)
		total += line.Price * float64(line.Quantity)
	}

	result, err := tx.Exec(
		`INSERT INTO orders
         (customer_name, customer_address, total)
         VALUES (?, ?, ?)`,
		req.CustomerName, req.CustomerAddress, total,
	)
	if err != nil {
		http.Error(w, "Could not save order", http.StatusInternalServerError)
		return
	}

	orderID, err := result.LastInsertId()
	if err != nil {
		http.Error(w, "Could not get order ID", http.StatusInternalServerError)
		return
	}

	for _, line := range lines {
		// Reduce stock only if enough stock is still available.
		update, err := tx.Exec(
			`UPDATE products
             SET stock = stock - ?
             WHERE id = ? AND stock >= ?`,
			line.Quantity, line.ProductID, line.Quantity,
		)
		if err != nil {
			http.Error(w, "Could not update stock", http.StatusInternalServerError)
			return
		}

		affected, err := update.RowsAffected()
		if err != nil || affected != 1 {
			http.Error(w, "Stock changed. Please try again.", http.StatusConflict)
			return
		}

		subtotal := line.Price * float64(line.Quantity)

		_, err = tx.Exec(
			`INSERT INTO order_items
             (order_id, product_id, product_name, price, quantity, subtotal)
             VALUES (?, ?, ?, ?, ?, ?)`,
			orderID, line.ProductID, line.Name,
			line.Price, line.Quantity, subtotal,
		)
		if err != nil {
			http.Error(w, "Could not save order items", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Could not complete order", http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusCreated, map[string]any{
		"message":  "Order placed successfully!",
		"order_id": orderID,
		"total":    total,
	})
}

func orderHistoryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query(`
		SELECT
			o.id,
			o.customer_name,
			o.customer_address,
			o.total,
			o.created_at,
			oi.product_id,
			oi.product_name,
			oi.price,
			oi.quantity,
			oi.subtotal
		FROM orders o
		LEFT JOIN order_items oi ON o.id = oi.order_id
		ORDER BY o.id DESC, oi.id ASC
	`)
	if err != nil {
		http.Error(w, "Could not fetch order history", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type OrderItem struct {
		ProductID   int     `json:"product_id"`
		ProductName string  `json:"product_name"`
		Price       float64 `json:"price"`
		Quantity    int     `json:"quantity"`
		Subtotal    float64 `json:"subtotal"`
	}

	type Order struct {
		ID              int         `json:"id"`
		CustomerName    string      `json:"customer_name"`
		CustomerAddress string      `json:"customer_address"`
		Total           float64     `json:"total"`
		CreatedAt       string      `json:"created_at"`
		Items           []OrderItem `json:"items"`
	}

	orders := make([]Order, 0)
	orderIndexes := make(map[int]int)

	for rows.Next() {
		var id int
		var customerName, customerAddress, createdAt string
		var total float64

		var productID sql.NullInt64
		var productName sql.NullString
		var price, subtotal sql.NullFloat64
		var quantity sql.NullInt64

		err := rows.Scan(
			&id,
			&customerName,
			&customerAddress,
			&total,
			&createdAt,
			&productID,
			&productName,
			&price,
			&quantity,
			&subtotal,
		)
		if err != nil {
			http.Error(w, "Could not read order history", http.StatusInternalServerError)
			return
		}

		index, exists := orderIndexes[id]
		if !exists {
			index = len(orders)
			orderIndexes[id] = index

			orders = append(orders, Order{
				ID:              id,
				CustomerName:    customerName,
				CustomerAddress: customerAddress,
				Total:           total,
				CreatedAt:       createdAt,
				Items:           make([]OrderItem, 0),
			})
		}

		if productID.Valid {
			orders[index].Items = append(orders[index].Items, OrderItem{
				ProductID:   int(productID.Int64),
				ProductName: productName.String,
				Price:       price.Float64,
				Quantity:    int(quantity.Int64),
				Subtotal:    subtotal.Float64,
			})
		}
	}

	if err := rows.Err(); err != nil {
		http.Error(w, "Could not read order history", http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, orders)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	var err error
	db, err = sql.Open("sqlite", "./ecommerce.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			price REAL NOT NULL CHECK(price >= 0),
			stock INTEGER NOT NULL CHECK(stock >= 0)
		)
	`)
	if err != nil {
		log.Fatal(err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			customer_name TEXT NOT NULL,
			customer_address TEXT NOT NULL,
			total REAL NOT NULL CHECK(total >= 0),
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS order_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			order_id INTEGER NOT NULL,
			product_id INTEGER NOT NULL,
			product_name TEXT NOT NULL,
			price REAL NOT NULL,
			quantity INTEGER NOT NULL CHECK(quantity > 0),
			subtotal REAL NOT NULL
		);
	`)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", healthHandler)
	mux.HandleFunc("/api/products", productsHandler)
	mux.HandleFunc("/api/products/{id}", productHandler)
	mux.HandleFunc("/api/orders", ordersHandler)
	mux.HandleFunc("/api/orders/history", orderHistoryHandler)

	log.Println("Go server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", cors(mux)))
}
