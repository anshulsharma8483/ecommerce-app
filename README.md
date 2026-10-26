# E-commerce Application

A full-stack e-commerce application built with React and Go. The application supports product management, shopping cart operations, checkout, order processing, stock management, and order history.

## Features

- View available products.
- Create, update, and delete products.
- Add products to the shopping cart.
- Update cart quantities and remove products.
- Place orders using customer details and delivery address.
- Validate product availability and order quantities.
- Update stock after successful orders.
- View order history.

## Tech Stack

### Frontend
- React
- TypeScript
- Vite
- CSS

### Backend
- Go
- SQLite

## Project Structure

```text
ecommerce-app/
├── backend/
│   ├── main.go
│   ├── go.mod
│   └── go.sum
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Prerequisites

- Go installed and available in PATH.
- Node.js and npm installed.
- Git installed.

## Run the Backend

Open a terminal in the backend directory:

```bash
cd backend
go run .
```

The server runs at `http://localhost:8080` when port 8080 is available.

## Run the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in your browser.

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check backend health |
| GET | `/api/products` | List products |
| POST | `/api/products` | Create a product |
| GET | `/api/products/{id}` | Retrieve a product |
| PUT | `/api/products/{id}` | Update a product |
| DELETE | `/api/products/{id}` | Delete a product |
| POST | `/api/orders` | Place an order |
| GET | `/api/orders/history` | Retrieve order history |

## Product Request Example

```json
{
  "name": "Wireless Mouse",
  "description": "Wireless computer mouse",
  "price": 599,
  "stock": 10
}
```

## Order Request Example

```json
{
  "customer_name": "Test Customer",
  "customer_address": "Test Address",
  "items": [
    {
      "product_id": 1,
      "quantity": 1
    }
  ]
}
```

Use a product ID that exists in the database when testing the order endpoint.

## Testing

Run backend tests:

```bash
cd backend
go test ./...
```

Build the frontend:

```bash
cd frontend
npm install
npm run build
```

## Notes

- Ensure the backend is running before testing frontend operations that require API access.
- Port 8080 must be available for the backend.
- Product IDs and stock depend on the current database contents.
- Any known limitations should be documented before submission.