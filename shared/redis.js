const { createRequire } = require("module");

const serviceRequire = createRequire(`${process.cwd()}/`);
const { createClient } = serviceRequire("redis");

function createRedisConnection() {
  const client = createClient({
    url: `redis://${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || 6379}`
  });

  client.on("error", (err) => {
    console.error("Redis error:", err.message);
  });

  return client;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRedis(client, options = {}) {
  const {
    retries = 10,
    label = "Redis"
  } = options;

  for (let i = 1; i <= retries; i += 1) {
    try {
      console.log(`${label} connection attempt ${i}...`);
      await client.connect();
      console.log(`${label} ready`);
      return;
    } catch (err) {
      console.log(`${label} not ready yet: ${err.message}`);

      if (i === retries) {
        throw err;
      }

      await wait(3000);
    }
  }
}

module.exports = {
  createRedisConnection,
  waitForRedis
};
