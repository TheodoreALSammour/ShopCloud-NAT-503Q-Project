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
  const productId = Number(req.body.productId ?? req.body.id);
  const quantity = Number(req.body.quantity || 1);

  if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      message: "productId and positive integer quantity are required"
    });
  }

  try {
    const userId = req.user.id;
    const item = { productId, quantity };

    const cartKey = `cart:${userId}`;

    const existingCart = await redisClient.get(cartKey);
    let cart = existingCart ? JSON.parse(existingCart) : [];

    const existingItem = cart.find((cartItem) => Number(cartItem.productId ?? cartItem.id) === productId);

    if (existingItem) {
      existingItem.productId = productId;
      existingItem.quantity = Number(existingItem.quantity || 0) + quantity;
      delete existingItem.id;
    } else {
      cart.push(item);
    }

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
