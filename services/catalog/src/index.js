const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  user: "shopcloud",
  host: "postgres",
  database: "shopcloud",
  password: "shopcloud123",
  port: 5432,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL
      )
    `);

    const check = await pool.query("SELECT COUNT(*) FROM products");
    if (parseInt(check.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO products (name, price)
        VALUES 
          ('Laptop', 1200),
          ('Phone', 800),
          ('Headphones', 150)
      `);
    }

    console.log("Catalog DB ready");
  } catch (err) {
    console.error("DB init error:", err.message);
  }
}

app.get("/health", (req, res) => {
  res.json({ service: "catalog", status: "ok" });
});

app.get("/products", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/products", async (req, res) => {
  try {
    const { name, price } = req.body;

    const result = await pool.query(
      "INSERT INTO products (name, price) VALUES ($1, $2) RETURNING *",
      [name, price]
    );

    res.json({
      message: "Product added",
      product: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

initDB().then(() => {
  app.listen(3001, () => {
    console.log("Catalog running on 3001");
  });
});