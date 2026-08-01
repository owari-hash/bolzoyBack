const jwt = require("jsonwebtoken");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function extractToken(req) {
  let token = req.cookies && req.cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(" ");
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      token = parts[1];
    }
  }
  return token;
}

function requireAuth(role) {
  return (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      if (req.path.startsWith("/api") || req.path.includes("/api/")) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      return res.redirect("/admin/login");
    }
    try {
      const user = verifyToken(token);
      if (role && user.role !== role && user.role !== "superadmin") {
        if (req.path.startsWith("/api") || req.path.includes("/api/")) {
          return res.status(403).json({ success: false, error: "Forbidden" });
        }
        return res.status(403).send("Forbidden");
      }
      req.user = user;
      next();
    } catch (err) {
      res.clearCookie("token");
      if (req.path.startsWith("/api") || req.path.includes("/api/")) {
        return res.status(401).json({ success: false, error: "Invalid token" });
      }
      return res.redirect("/admin/login");
    }
  };
}

function requireSuperAdmin(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    if (req.path.startsWith("/api") || req.path.includes("/api/")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    return res.redirect("/superadmin/login");
  }
  try {
    const user = verifyToken(token);
    if (user.role !== "superadmin") {
      if (req.path.startsWith("/api") || req.path.includes("/api/")) {
        return res.status(403).json({ success: false, error: "Forbidden" });
      }
      return res.redirect("/superadmin/login");
    }
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie("token");
    if (req.path.startsWith("/api") || req.path.includes("/api/")) {
      return res.status(401).json({ success: false, error: "Invalid token" });
    }
    return res.redirect("/superadmin/login");
  }
}

module.exports = { signToken, verifyToken, requireAuth, requireSuperAdmin };
