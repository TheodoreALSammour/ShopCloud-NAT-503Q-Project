const express = require("express");
const { createPool, waitForDatabase } = require("../../../shared/db");

const app = express();
app.use(express.json());

const pool = createPool();

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
    const { name, description, price, stock } = req.body;

    const result = await pool.query(
      `
        INSERT INTO products (name, description, price, stock)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [name, description || null, price, Number(stock ?? 0)]
    );

    res.json({
      message: "Product added",
      product: result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await waitForDatabase(pool, {
      label: "Catalog DB",
      onReady: async (db) => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            description TEXT,
            price NUMERIC(10,2) NOT NULL,
            stock INT NOT NULL DEFAULT 0
          )
        `);

        await db.query(`
          ALTER TABLE products
          ADD COLUMN IF NOT EXISTS description TEXT
        `);

        await db.query(`
          ALTER TABLE products
          ADD COLUMN IF NOT EXISTS stock INT NOT NULL DEFAULT 0
        `);

        await db.query(`
          ALTER TABLE products
          ALTER COLUMN price TYPE NUMERIC(10,2)
          USING price::numeric
        `);

        const check = await db.query("SELECT COUNT(*) FROM products");

        if (parseInt(check.rows[0].count, 10) === 0) {
          await db.query(`
            INSERT INTO products (name, description, price, stock)
            VALUES
              ('Laptop', 'High performance laptop', 1200.00, 10),
              ('Phone', 'Latest smartphone', 800.00, 20),
              ('Headphones', 'Wireless headphones', 150.00, 30)
          `);
        }
      }
    });
    app.listen(3001, () => {
      console.log("Catalog running on 3001");
    });
  } catch (err) {
    console.error("Failed to initialize DB:", err.message);
    process.exit(1);
  }
}

startServer();
