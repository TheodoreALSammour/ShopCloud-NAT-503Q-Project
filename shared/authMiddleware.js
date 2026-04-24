const { createRequire } = require("module");

const serviceRequire = createRequire(`${process.cwd()}/`);
const jwt = serviceRequire("jsonwebtoken");

function getSecret() {
  return process.env.JWT_SECRET || "supersecretkey";
}

function signToken(payload, options = {}) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: "1h",
    ...options
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Missing or invalid authorization header" });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  requireRole,
  signToken,
  verifyToken
};
