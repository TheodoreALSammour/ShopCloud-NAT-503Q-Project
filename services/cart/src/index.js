const express = require("express");
const { createClient } = require("redis");

const app = express();
app.use(express.json());

const redisClient = createClient({
  url: "redis://redis:6379"
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRedisWithRetry(retries = 10) {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`Redis connection attempt ${i}...`);
      await redisClient.connect();
      console.log("Connected to Redis");
      return;
    } catch (err) {
      console.log(`Redis not ready yet: ${err.message}`);

      if (i === retries) {
        throw err;
      }

      await wait(3000);
    }
  }
}

app.get("/health", (req, res) => {
  res.json({ service: "cart", status: "ok" });
});

app.post("/cart/:userId/add", async (req, res) => {
  try {
    const { userId } = req.params;
    const item = req.body;

    const cartKey = `cart:${userId}`;

    const existingCart = await redisClient.get(cartKey);
    let cart = existingCart ? JSON.parse(existingCart) : [];

    cart.push(item);

    await redisClient.set(cartKey, JSON.stringify(cart));

    res.json({
      message: "Added to cart",
      cart
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/cart/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const cartKey = `cart:${userId}`;

    const cart = await redisClient.get(cartKey);

    res.json(cart ? JSON.parse(cart) : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/cart/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const cartKey = `cart:${userId}`;

    await redisClient.del(cartKey);

    res.json({ message: "Cart cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await connectRedisWithRetry();
    app.listen(3002, () => {
      console.log("Cart running on 3002");
    });
  } catch (err) {
    console.error("Failed to connect to Redis:", err.message);
    process.exit(1);
  }
}

startServer();