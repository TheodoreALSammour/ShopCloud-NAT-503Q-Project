const express = require("express");
const bcrypt = require("bcryptjs");
const { authenticate, signToken } = require("../../../shared/authMiddleware");
const { applyCors } = require("../../../shared/cors");
const { createPool, waitForDatabase } = require("../../../shared/db");

const app = express();
app.use(applyCors);
app.use(express.json());

const pool = createPool();

function issueToken(user) {
  return signToken({
    id: user.id,
    email: user.email,
    role: user.role
  });
}

app.get("/health", (req,res)=>{
  res.json({service:"auth",status:"ok"});
});

app.post("/register", async (req, res) => {
  const { name, email, password, role, adminSecret } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({
      message: "name, email, and password are required"
    });
  }

  if (role === "admin") {
    const expectedAdminSecret = process.env.ADMIN_REGISTRATION_SECRET;

    if (!expectedAdminSecret) {
      return res.status(403).json({
        message: "Admin registration is not configured"
      });
    }

    if (adminSecret !== expectedAdminSecret) {
      return res.status(403).json({
        message: "Invalid admin registration secret"
      });
    }
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 10);
    const userRole = role === "admin" ? "admin" : "customer";

    const result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, role
      `,
      [name, normalizedEmail, passwordHash, userRole]
    );

    const user = result.rows[0];

    return res.status(201).json({
      message: "User registered",
      user,
      token: issueToken(user)
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Email already registered" });
    }

    return res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "email and password are required" });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const result = await pool.query(
      `
        SELECT id, name, email, password_hash, role
        FROM users
        WHERE email = $1
      `,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.json({
      token: issueToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/me", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name, email, role
        FROM users
        WHERE id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await waitForDatabase(pool, {
      label: "Auth DB",
      onReady: async (db) => {
        await db.query(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(150) UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'customer'
          )
        `);
      }
    });

    const port = Number(process.env.AUTH_PORT || 3000);
    app.listen(port, () => {
      console.log(`Auth running on ${port}`);
    });
  } catch (err) {
    console.error("Failed to start auth service:", err.message);
    process.exit(1);
  }
}

startServer();
