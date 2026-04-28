const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.resolve(__dirname, "public");
const port = Number(process.env.FRONTEND_PORT || 5173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer((req, res) => {
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
