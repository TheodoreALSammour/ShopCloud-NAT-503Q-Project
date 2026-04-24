const express = require("express");
const { authenticate } = require("../../../shared/authMiddleware");
const { createRedisConnection, waitForRedis } = require("../../../shared/redis");

const app = express();
app.use(express.json());

const redisClient = createRedisConnection();

app.get("/health", (req, res) => {
  res.json({ service: "cart", status: "ok" });
});

app.post("/cart/add", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
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

app.get("/cart", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartKey = `cart:${userId}`;

    const cart = await redisClient.get(cartKey);

    res.json(cart ? JSON.parse(cart) : []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/cart", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const cartKey = `cart:${userId}`;

    await redisClient.del(cartKey);

    res.json({ message: "Cart cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  try {
    await waitForRedis(redisClient, { label: "Cart Redis" });

    const port = Number(process.env.CART_PORT || 3002);
    app.listen(port, () => {
      console.log(`Cart running on ${port}`);
    });
  } catch (err) {
    console.error("Failed to connect to Redis:", err.message);
    process.exit(1);
  }
}

startServer();
