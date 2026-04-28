function applyCors(req, res, next) {
  const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
}

module.exports = { applyCors };
