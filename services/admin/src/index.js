const express = require("express");
const { authenticate, requireRole } = require("../../../shared/authMiddleware");
const { applyCors } = require("../../../shared/cors");
const { createPool, waitForDatabase } = require("../../../shared/db");

const app = express();
app.use(applyCors);
app.use(express.json());

const pool = createPool();

app.get("/health", (req, res) => {
  res.json({ service: "admin", status: "ok" });
});

app.get("/dashboard", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const [usersResult, ordersResult, revenueResult, lowStockResult, recentOrdersResult] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS count FROM users"),
      pool.query("SELECT COUNT(*)::int AS count FROM orders"),
      pool.query("SELECT COALESCE(SUM(total_price), 0)::numeric(10,2) AS total FROM orders"),
      pool.query(`
        SELECT id, name, stock
        FROM products
        WHERE stock <= 5
        ORDER BY stock ASC, id ASC
        LIMIT 5
      `),
      pool.query(`
        SELECT id, user_id, total_price, status, created_at
        FROM orders
        ORDER BY created_at DESC, id DESC
        LIMIT 5
      `)
    ]);

    return res.json({
      users: usersResult.rows[0].count,
      orders: ordersResult.rows[0].count,
      revenue: Number(revenueResult.rows[0].total),
      lowStockProducts: lowStockResult.rows.map((product) => ({
        id: product.id,
        name: product.name,
        stock: product.stock
      })),
      recentOrders: recentOrdersResult.rows.map((order) => ({
        id: order.id,
        userId: order.user_id,
        totalPrice: Number(order.total_price),
        status: order.status,
        createdAt: order.created_at
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/products", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, price, stock
      FROM products
      ORDER BY id
    `);

    return res.json(result.rows.map((product) => ({
      ...product,
      price: Number(product.price)
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/products", authenticate, requireRole("admin"), async (req, res) => {
  const { name, description, price, stock } = req.body;
  const normalizedPrice = Number(price);
  const normalizedStock = Number(stock ?? 0);

  if (!name || !Number.isFinite(normalizedPrice) || normalizedPrice < 0 || !Number.isInteger(normalizedStock) || normalizedStock < 0) {
    return res.status(400).json({
      message: "name, non-negative price, and non-negative integer stock are required"
    });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO products (name, description, price, stock)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, description, price, stock
      `,
      [name, description || null, normalizedPrice.toFixed(2), normalizedStock]
    );

    const product = result.rows[0];

    return res.status(201).json({
      message: "Product created",
      product: {
        ...product,
        price: Number(product.price)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.patch("/products/:id", authenticate, requireRole("admin"), async (req, res) => {
  const productId = Number(req.params.id);
  const { name, description, price, stock } = req.body;

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Valid product id is required" });
  }

  const updates = [];
  const values = [];

  function addUpdate(column, value) {
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }

  if (name !== undefined) {
    if (!name) {
      return res.status(400).json({ message: "name cannot be empty" });
    }

    addUpdate("name", name);
  }

  if (description !== undefined) {
    addUpdate("description", description || null);
  }

  if (price !== undefined) {
    const normalizedPrice = Number(price);

    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
      return res.status(400).json({ message: "price must be non-negative" });
    }

    addUpdate("price", normalizedPrice.toFixed(2));
  }

  if (stock !== undefined) {
    const normalizedStock = Number(stock);

    if (!Number.isInteger(normalizedStock) || normalizedStock < 0) {
      return res.status(400).json({ message: "stock must be a non-negative integer" });
    }

    addUpdate("stock", normalizedStock);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: "At least one field is required" });
  }

  values.push(productId);

  try {
    const result = await pool.query(
      `
        UPDATE products
        SET ${updates.join(", ")}
        WHERE id = $${values.length}
        RETURNING id, name, description, price, stock
      `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    const product = result.rows[0];

    return res.json({
      message: "Product updated",
      product: {
        ...product,
        price: Number(product.price)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/returns", authenticate, requireRole("admin"), async (req, res) => {
  const { orderId, productId, quantity, reason } = req.body;
  const normalizedOrderId = Number(orderId);
  const normalizedProductId = Number(productId);
  const normalizedQuantity = Number(quantity);
  const client = await pool.connect();

  if (
    !Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0 ||
    !Number.isInteger(normalizedProductId) || normalizedProductId <= 0 ||
    !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0
  ) {
    client.release();
    return res.status(400).json({
      message: "Valid orderId, productId, and positive quantity are required"
    });
  }

  try {
    await client.query("BEGIN");

    const orderItemResult = await client.query(
      `
        SELECT quantity
        FROM order_items
        WHERE order_id = $1 AND product_id = $2
      `,
      [normalizedOrderId, normalizedProductId]
    );

    if (orderItemResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order item not found" });
    }

    if (normalizedQuantity > orderItemResult.rows[0].quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Return quantity exceeds ordered quantity" });
    }

    const returnResult = await client.query(
      `
        INSERT INTO returns (order_id, product_id, quantity, reason, processed_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, order_id, product_id, quantity, reason, status, created_at
      `,
      [normalizedOrderId, normalizedProductId, normalizedQuantity, reason || null, req.user.id]
    );

    await client.query(
      `
        UPDATE products
        SET stock = stock + $1
        WHERE id = $2
      `,
      [normalizedQuantity, normalizedProductId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Return processed",
      return: returnResult.rows[0]
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("Rollback failed:", rollbackErr.message);
    }

    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

async function startServer() {
  try {
    await waitForDatabase(pool, {
      label: "Admin DB",
      onReady: async (db) => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS returns (
            id SERIAL PRIMARY KEY,
            order_id INT NOT NULL,
            product_id INT NOT NULL,
            quantity INT NOT NULL,
            reason TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'PROCESSED',
            processed_by INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      }
    });

    const port = Number(process.env.ADMIN_PORT || 3004);
    app.listen(port, () => {
      console.log(`Admin running on ${port}`);
    });
  } catch (err) {
    console.error("Failed to start admin service:", err.message);
    process.exit(1);
  }
}

startServer();
