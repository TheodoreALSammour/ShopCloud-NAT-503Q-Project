const { createRequire } = require("module");

const serviceRequire = createRequire(`${process.cwd()}/`);
const { Pool } = serviceRequire("pg");

function createPool() {
  const useSsl = String(process.env.POSTGRES_SSL || "").toLowerCase() === "true";

  return new Pool({
    user: process.env.POSTGRES_USER || "shopcloud",
    host: process.env.POSTGRES_HOST || "postgres",
    database: process.env.POSTGRES_DB || "shopcloud",
    password: process.env.POSTGRES_PASSWORD || "shopcloud123",
    port: Number(process.env.POSTGRES_PORT || 5432),
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabase(pool, options = {}) {
  const {
    retries = 10,
    label = "DB",
    onReady
  } = options;

  for (let i = 1; i <= retries; i += 1) {
    try {
      console.log(`${label} init attempt ${i}...`);

      if (onReady) {
        await onReady(pool);
      } else {
        await pool.query("SELECT 1");
      }

      console.log(`${label} ready`);
      return;
    } catch (err) {
      console.log(`${label} not ready yet: ${err.message}`);

      if (i === retries) {
        throw err;
      }

      await wait(5000);
    }
  }
}

module.exports = {
  createPool,
  waitForDatabase
};
