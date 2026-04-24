const express = require("express");
const { authenticate, requireRole } = require("../../../shared/authMiddleware");
const { createPool, waitForDatabase } = require("../../../shared/db");

const app = express();
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

async function startServer() {
  try {
    await waitForDatabase(pool, { label: "Admin DB" });

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
