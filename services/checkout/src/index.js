const express = require("express");
const { authenticate } = require("../../../shared/authMiddleware");
const { applyCors } = require("../../../shared/cors");
const { createPool, waitForDatabase } = require("../../../shared/db");
const { createRedisConnection, waitForRedis } = require("../../../shared/redis");

const app = express();
app.use(applyCors);
app.use(express.json());

const pool = createPool();
const redisClient = createRedisConnection();

function escapePdfText(value) {
  return String(value).replace(/[\\()]/g, "\\$&").replace(/\r?\n/g, " ");
}

function buildInvoicePdf(order, customer, items) {
  const lines = [
    "ShopCloud Invoice",
    `Order #${order.id}`,
    `Customer: ${customer.name} <${customer.email}>`,
    `Status: ${order.status}`,
    `Total: $${Number(order.total_price).toFixed(2)}`,
    "",
    "Items:",
    ...items.map((item) => `${item.quantity} x ${item.name} @ $${Number(item.price).toFixed(2)}`)
  ];

  const textCommands = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${740 - index * 18} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(textCommands)} >> stream\n${textCommands}\nendstream endobj`
  ];

  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects.map((object) => {
    const entry = object + "\n";
    xref.push(String(offset).padStart(10, "0") + " 00000 n ");
    offset += Buffer.byteLength(entry);
    return entry;
  }).join("");

  const xrefOffset = offset;
  const trailer = [
    `xref\n0 ${xref.length}`,
    ...xref,
    `trailer << /Size ${xref.length} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF"
  ].join("\n");

  return Buffer.from(`%PDF-1.4\n${body}${trailer}\n`);
}

function sendInvoiceEmail(customer, invoice) {
  console.log(`Invoice ${invoice.invoice_number} emailed to ${customer.email}`);
}

async function generateInvoiceAsync(orderId) {
  try {
    const orderResult = await pool.query(
      `
        SELECT o.id, o.user_id, o.total_price, o.status, o.created_at, u.name, u.email
        FROM orders o
        JOIN users u ON u.id = o.user_id
        WHERE o.id = $1
      `,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }

    const order = orderResult.rows[0];
    const itemsResult = await pool.query(
      `
        SELECT oi.product_id, p.name, oi.quantity, oi.price
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `,
      [orderId]
    );

    const invoiceNumber = `INV-${String(order.id).padStart(6, "0")}`;
    const customer = {
      name: order.name,
      email: order.email
    };
    const pdf = buildInvoicePdf(order, customer, itemsResult.rows);

    const invoiceResult = await pool.query(
      `
        INSERT INTO invoices (order_id, invoice_number, customer_email, pdf_data, email_status)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (order_id)
        DO UPDATE SET
          invoice_number = EXCLUDED.invoice_number,
          customer_email = EXCLUDED.customer_email,
          pdf_data = EXCLUDED.pdf_data,
          email_status = EXCLUDED.email_status,
          generated_at = CURRENT_TIMESTAMP
        RETURNING id, invoice_number
      `,
      [order.id, invoiceNumber, customer.email, pdf, "SENT"]
    );

    sendInvoiceEmail(customer, invoiceResult.rows[0]);
  } catch (err) {
    console.error("Invoice generation failed:", err.message);
  }
}

function queueInvoice(orderId) {
  setImmediate(() => {
    generateInvoiceAsync(orderId);
  });
}

function normalizeCartItems(items) {
  const itemsByProduct = new Map();

  for (const item of items) {
    const productId = Number(item.productId ?? item.id);
    const quantity = Number(item.quantity || 1);
    const existingQuantity = itemsByProduct.get(productId) || 0;

    itemsByProduct.set(productId, existingQuantity + quantity);
  }

  return Array.from(itemsByProduct.entries()).map(([productId, quantity]) => ({
    productId,
    quantity
  }));
}

app.get("/health", (req, res) => {
  res.json({ service: "checkout", status: "ok" });
});

app.get("/orders/:orderId/invoice", authenticate, async (req, res) => {
  const orderId = Number(req.params.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Valid order id is required" });
  }

  try {
    const result = await pool.query(
      `
        SELECT i.invoice_number, i.customer_email, i.email_status, i.generated_at
        FROM invoices i
        JOIN orders o ON o.id = i.order_id
        WHERE i.order_id = $1
          AND (o.user_id = $2 OR $3 = 'admin')
      `,
      [orderId, req.user.id, req.user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Invoice not found or still being generated" });
    }

    const invoice = result.rows[0];

    return res.json({
      invoiceNumber: invoice.invoice_number,
      customerEmail: invoice.customer_email,
      emailStatus: invoice.email_status,
      generatedAt: invoice.generated_at
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/orders/:orderId/invoice.pdf", authenticate, async (req, res) => {
  const orderId = Number(req.params.orderId);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res.status(400).json({ message: "Valid order id is required" });
  }

  try {
    const result = await pool.query(
      `
        SELECT i.invoice_number, i.pdf_data
        FROM invoices i
        JOIN orders o ON o.id = i.order_id
        WHERE i.order_id = $1
          AND (o.user_id = $2 OR $3 = 'admin')
      `,
      [orderId, req.user.id, req.user.role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Invoice not found or still being generated" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${result.rows[0].invoice_number}.pdf"`);
    return res.send(result.rows[0].pdf_data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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
    queueInvoice(order.id);

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

        await db.query(`
          CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            order_id INT UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
            invoice_number VARCHAR(50) UNIQUE NOT NULL,
            customer_email VARCHAR(150) NOT NULL,
            pdf_data BYTEA NOT NULL,
            email_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
