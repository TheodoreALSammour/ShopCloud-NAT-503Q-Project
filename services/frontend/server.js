const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const publicDir = path.resolve(__dirname, "public");
const port = Number(process.env.FRONTEND_PORT || 5173);

const apiTargets = {
  auth: process.env.AUTH_API_BASE_URL || "http://auth:3000",
  catalog: process.env.CATALOG_API_BASE_URL || "http://catalog:3001",
  cart: process.env.CART_API_BASE_URL || "http://cart:3002",
  checkout: process.env.CHECKOUT_API_BASE_URL || "http://checkout:3003",
  admin: process.env.ADMIN_API_BASE_URL || "http://admin:3004"
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function proxyApi(req, res, service, upstreamPath) {
  const target = apiTargets[service];

  if (!target) {
    res.writeHead(404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Unknown API service" }));
  }

  const targetUrl = new URL(upstreamPath || "/", target);
  const proxyReq = http.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host
    }
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "API proxy failed", error: err.message }));
  });

  req.pipe(proxyReq);
  return proxyReq;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ service: "frontend", status: "ok" }));
  }

  const apiMatch = req.url.match(/^\/api\/([^/?#]+)(\/[^?#]*)?([?#].*)?$/);

  if (apiMatch) {
    const [, service, upstreamPath = "/", suffix = ""] = apiMatch;
    return proxyApi(req, res, service, `${upstreamPath}${suffix}`);
  }

  const requestedPath = req.url === "/" ? "index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestedPath).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(publicDir, safePath);

  if (path.relative(publicDir, filePath).startsWith("..")) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    return res.end(data);
  });
});

server.listen(port, () => {
  console.log(`ShopCloud frontend running on ${port}`);
});
