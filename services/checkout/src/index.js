const express = require("express");
const { authenticate } = require("../../../shared/authMiddleware");
const { createPool, waitForDatabase } = require("../../../shared/db");
const { createRedisConnection, waitForRedis } = require("../../../shared/redis");

const app = express();
app.use(express.json());

const pool = createPool();
const redisClient = createRedisConnection();

function normalizeCartItems(items) {
  return items.map((item) => ({
    productId: Number(item.productId ?? item.id),
    quantity: Number(item.quantity || 1)
  }));
}

app.get("/health", (req, res) => {
  res.json({ service: "checkout", status: "ok" });
});

app.post("/checkout", authenticate, async (req, res) => {
  const userId = Number(req.user.id);

  const cartKey = `cart:${userId}`;
  const client = await pool.connect();

  try {
    const cartRaw = await redisClient.get(cartKey);
    const cart = cartRaw ? JSON.parse(cartRaw) : [];

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const normalizedItems = normalizeCartItems(cart);

    if (
      normalizedItems.some(
        (item) => !Number.isInteger(item.productId) || item.productId <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0
      )
    ) {
      return res.status(400).json({
        message: "Cart items must include a valid productId and quantity"
      });
    }

    await client.query("BEGIN");

    const productIds = normalizedItems.map((item) => item.productId);
    const productsResult = await client.query(
      `
        SELECT id, name, price, stock
        FROM products
        WHERE id = ANY($1::int[])
        FOR UPDATE
      `,
      [productIds]
    );

    const products = new Map(
      productsResult.rows.map((product) => [product.id, product])
    );

    const missingProductIds = productIds.filter((productId) => !products.has(productId));
    if (missingProductIds.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Some products in the cart no longer exist",
        missingProductIds
      });
    }

    let totalPrice = 0;
    const orderItems = [];

    for (const item of normalizedItems) {
      const product = products.get(item.productId);

      if (typeof product.stock === "number" && product.stock < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Insufficient stock for product ${product.name}`,
          productId: product.id,
          availableStock: product.stock
        });
      }

      const itemPrice = Number(product.price);
      totalPrice += itemPrice * item.quantity;
      orderItems.push({
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        price: itemPrice
      });
    }

    const orderResult = await client.query(
      `
        INSERT INTO orders (user_id, total_price, status)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, total_price, status, created_at
      `,
      [userId, totalPrice.toFixed(2), "PLACED"]
    );

    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `
          INSERT INTO order_items (order_id, product_id, quantity, price)
          VALUES ($1, $2, $3, $4)
        `,
        [order.id, item.productId, item.quantity, item.price]
      );

      await client.query(
        `
          UPDATE products
          SET stock = stock - $1
          WHERE id = $2
        `,
        [item.quantity, item.productId]
      );
    }

    await client.query("COMMIT");
    await redisClient.del(cartKey);

    return res.json({
      message: "Order placed",
      order: {
        id: order.id,
        userId: order.user_id,
        totalPrice: Number(order.total_price),
        status: order.status,
        createdAt: order.created_at,
        items: orderItems
      }
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
      label: "Checkout DB",
      onReady: async (db) => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL,
            total_price NUMERIC(10,2) NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await db.query(`
          CREATE TABLE IF NOT EXISTS order_items (
            id SERIAL PRIMARY KEY,
            order_id INT REFERENCES orders(id) ON DELETE CASCADE,
            product_id INT NOT NULL,
            quantity INT NOT NULL,
            price NUMERIC(10,2) NOT NULL
          )
        `);
      }
    });
    await waitForRedis(redisClient, { label: "Checkout Redis" });

    const port = Number(process.env.CHECKOUT_PORT || 3003);
    app.listen(port, () => {
      console.log(`Checkout running on ${port}`);
    });
  } catch (err) {
    console.error("Failed to start checkout service:", err.message);
    process.exit(1);
  }
}

startServer();
