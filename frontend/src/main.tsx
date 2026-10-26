import { useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import './style.css'

const API_URL = 'http://localhost:8080/api'

interface Product {
  id: number
  name: string
  description: string
  price: number
  stock: number
  image?: string
  image_url?: string
}

interface CartItem extends Product {
  quantity: number
}

interface OrderItem {
  product_id: number
  product_name: string
  price: number
  quantity: number
  subtotal: number
}

interface Order {
  id: number
  customer_name: string
  customer_address: string
  total: number
  created_at: string
  items: OrderItem[]
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)

  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  const [checkoutSaving, setCheckoutSaving] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showOrderHistory, setShowOrderHistory] = useState(false)

  const [orders, setOrders] = useState<Order[]>([])

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [loading, setLoading] = useState(false)

  async function fetchJSON<T>(
    url: string,
    options?: RequestInit,
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(
        responseText || `Request failed: ${response.status}`,
      )
    }

    return response.json() as Promise<T>
  }

  async function loadProducts() {
    setLoading(true)
    setError('')

    try {
      const data = await fetchJSON<Product[]>(
        `${API_URL}/products`,
      )

      setProducts(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Products load nahi ho paaye.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadOrderHistory() {
    setHistoryLoading(true)

    try {
      const data = await fetchJSON<Order[]>(
        `${API_URL}/orders/history`,
      )

      setOrders(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(
        err instanceof Error
          ? `Order history load nahi hui: ${err.message}`
          : 'Order history load nahi hui.',
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    void loadProducts()
    void loadOrderHistory()
  }, [])

  function resetProductForm() {
    setName('')
    setDescription('')
    setPrice('')
    setStock('')
    setEditingId(null)
  }

  async function handleProductSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setError('')
    setMessage('')

    const productData = {
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      stock: Number(stock),
    }

    if (
      !productData.name ||
      !Number.isFinite(productData.price) ||
      productData.price <= 0 ||
      !Number.isInteger(productData.stock) ||
      productData.stock < 0
    ) {
      setError(
        'Product name, valid price aur stock enter karo.',
      )
      return
    }

    try {
      const url = editingId !== null
        ? `${API_URL}/products/${editingId}`
        : `${API_URL}/products`

      await fetchJSON<unknown>(url, {
        method: editingId !== null ? 'PUT' : 'POST',
        body: JSON.stringify(productData),
      })

      setMessage(
        editingId !== null
          ? 'Product successfully update ho gaya!'
          : 'Product successfully add ho gaya!',
      )

      resetProductForm()
      await loadProducts()
    } catch (err) {
      setError(
        err instanceof Error
          ? `Product save nahi hua: ${err.message}`
          : 'Product save nahi hua.',
      )
    }
  }

  function handleEdit(product: Product) {
    setEditingId(product.id)
    setName(product.name)
    setDescription(product.description || '')
    setPrice(String(product.price))
    setStock(String(product.stock))

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Do you want to delete this product?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await fetchJSON<unknown>(
        `${API_URL}/products/${id}`,
        { method: 'DELETE' },
      )

      setMessage('Product delete ho gaya!')
      setCart((previous) =>
        previous.filter((item) => item.id !== id),
      )

      await loadProducts()
    } catch (err) {
      setError(
        err instanceof Error
          ? `Delete failed: ${err.message}`
          : 'Product delete nahi hua.',
      )
    }
  }

  function addToCart(product: Product) {
    setError('')
    setMessage('')

    const existingItem = cart.find(
      (item) => item.id === product.id,
    )

    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        setError('Available stock se zyada quantity add nahi kar sakte.')
        return
      }

      setCart((previous) =>
        previous.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      )
    } else {
      if (product.stock < 1) {
        setError('Ye product abhi out of stock hai.')
        return
      }

      setCart((previous) => [
        ...previous,
        { ...product, quantity: 1 },
      ])
    }

    setMessage(`${product.name} has been added to your cart!`)
  }

  function changeQuantity(id: number, change: number) {
    setCart((previous) =>
      previous
        .map((item) => {
          if (item.id !== id) return item

          const product = products.find((p) => p.id === id)
          const maxStock = product?.stock ?? item.stock
          const quantity = item.quantity + change

          if (quantity > maxStock) return item

          return { ...item, quantity }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  const cartTotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  )

  async function handleCheckout(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError('')
    setMessage('')

    if (cart.length === 0) {
      setError('Order place karne se pehle cart mein product add karo.')
      return
    }

    if (!customerName.trim() || !customerAddress.trim()) {
      setError('Customer name aur address enter karo.')
      return
    }

    setCheckoutSaving(true)

    try {
      await fetchJSON<unknown>(`${API_URL}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim(),
          items: cart.map((item) => ({
            product_id: item.id,
            quantity: item.quantity,
          })),
        }),
      })

      setMessage('Order successfully place ho gaya! 🎉')
      setCart([])
      setCustomerName('')
      setCustomerAddress('')

      await Promise.all([
        loadProducts(),
        loadOrderHistory(),
      ])

      setShowOrderHistory(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? `Order place nahi hua: ${err.message}`
          : 'Order place karte waqt error aaya.',
      )
    } finally {
      setCheckoutSaving(false)
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(
      dateString.includes('Z')
        ? dateString
        : `${dateString.replace(' ', 'T')}Z`,
    )

    if (Number.isNaN(date.getTime())) {
      return dateString
    }

    return date.toLocaleString()
  }

  return (
    <main className="store">
      <header className="store-header">
        <div>
          <h1>My E-Commerce Store</h1>
          <p>Find your favourite products</p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            onClick={() => void loadProducts()}
          >
            Refresh Products
          </button>

          <button
            type="button"
            onClick={() => {
              setShowOrderHistory((previous) => !previous)

              if (!showOrderHistory) {
                void loadOrderHistory()
              }
            }}
          >
            📦 Order History
          </button>

          <button
            type="button"
            onClick={() =>
              document
                .getElementById('shopping-cart')
                ?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            🛒 Cart ({cartCount})
          </button>
        </div>
      </header>

      {message && (
        <div className="success" role="status">
          {message}
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {showOrderHistory && (
        <section className="order-history-section">
          <div className="products-heading">
            <h2>📦 Order History</h2>

            <button
              type="button"
              onClick={() => void loadOrderHistory()}
              disabled={historyLoading}
            >
              {historyLoading ? 'Loading...' : 'Refresh History'}
            </button>
          </div>

          {historyLoading ? (
            <p>Orders load ho rahe hain...</p>
          ) : orders.length === 0 ? (
            <p>
              Abhi koi saved order nahi mila. Product add karke
              checkout complete karne ke baad yahan order dikhega.
            </p>
          ) : (
            <div className="order-list">
              {orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <h3>Order #{order.id}</h3>

                  <p>
                    <strong>Customer:</strong>{' '}
                    {order.customer_name}
                  </p>

                  <p>
                    <strong>Address:</strong>{' '}
                    {order.customer_address}
                  </p>

                  <p>
                    <strong>Date:</strong>{' '}
                    {formatDate(order.created_at)}
                  </p>

                  <h4>Purchased Items</h4>

                  {order.items?.length ? (
                    <ul>
                      {order.items.map((item, index) => (
                        <li
                          key={`${order.id}-${item.product_id}-${index}`}
                        >
                          {item.product_name} — ₹
                          {Number(item.price).toFixed(2)} ×{' '}
                          {item.quantity} = ₹
                          {Number(item.subtotal).toFixed(2)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Order item details available nahi hain.</p>
                  )}

                  <h3>
                    Total: ₹{Number(order.total).toFixed(2)}
                  </h3>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="form-section">
        <h2>
          {editingId !== null ? 'Edit Product' : 'Add New Product'}
        </h2>

        <form
          className="product-form"
          onSubmit={handleProductSubmit}
        >
          <label>
            Product Name
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Enter product name"
              required
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Enter product description"
            />
          </label>

          <label>
            Price (₹)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </label>

          <label>
            Stock Quantity
            <input
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(event) => setStock(event.target.value)}
              required
            />
          </label>

          <div className="form-actions">
            <button type="submit">
              {editingId !== null ? 'Update Product' : 'Add Product'}
            </button>

            {editingId !== null && (
              <button
                type="button"
                onClick={resetProductForm}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="products-section">
        <div className="products-heading">
          <h2>Our Products</h2>
          <span>{products.length} products</span>
        </div>

        {loading ? (
          <p>Products load ho rahe hain...</p>
        ) : products.length === 0 ? (
          <p>Abhi koi product available nahi hai.</p>
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <article
                className="product-card"
                key={product.id}
              >
                {(product.image_url || product.image) && (
                  <img
                    className="product-image"
                    src={product.image_url || product.image}
                    alt={product.name}
                  />
                )}

                <h3>{product.name}</h3>

                <p>
                  {product.description || 'No description available'}
                </p>

                <h3>₹{Number(product.price).toFixed(2)}</h3>

                <p>Stock: {product.stock}</p>

                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  disabled={product.stock < 1}
                >
                  {product.stock < 1 ? 'Out of Stock' : 'Add to Cart'}
                </button>

                <div className="product-actions">
                  <button
                    type="button"
                    onClick={() => handleEdit(product)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="delete-button"
                    onClick={() => void handleDelete(product.id)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="cart-section" id="shopping-cart">
        <h2>🛒 Shopping Cart ({cartCount})</h2>

        {cart.length === 0 ? (
          <p>
            Your cart is empty. Click "Add to Cart" to
            Cart dabao.
          </p>
        ) : (
          <>
            {cart.map((item) => (
              <div className="cart-item" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>₹{Number(item.price).toFixed(2)} each</p>
                  <p>
                    Subtotal: ₹
                    {(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>

                <div className="quantity-controls">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, -1)}
                  >
                    −
                  </button>

                  <span>{item.quantity}</span>

                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, 1)}
                    disabled={item.quantity >= item.stock}
                  >
                    +
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCart((previous) =>
                        previous.filter((p) => p.id !== item.id),
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}

            <h2 className="cart-total">
              Total: ₹{cartTotal.toFixed(2)}
            </h2>

            <form
              className="checkout-form"
              onSubmit={handleCheckout}
            >
              <h3>Checkout Details</h3>

              <label>
                Customer Name
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(event.target.value)
                  }
                  required
                />
              </label>

              <label>
                Delivery Address
                <textarea
                  value={customerAddress}
                  onChange={(event) =>
                    setCustomerAddress(event.target.value)
                  }
                  required
                />
              </label>

              <button
                type="submit"
                disabled={checkoutSaving || cart.length === 0}
              >
                {checkoutSaving ? 'Placing Order...' : 'Place Order'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
