const jwt = require("jsonwebtoken");

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "12h" });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requireAuth(role) {
  return (req, res, next) => {
    const token = req.cookies && req.cookies.token;
    if (!token) return res.redirect("/admin/login");
    try {
      const user = verifyToken(token);
      if (role && user.role !== role && user.role !== "superadmin") {
        return res.status(403).send("Forbidden");
      }
      req.user = user;
      next();
    } catch {
      res.clearCookie("token");
      return res.redirect("/admin/login");
    }
  };
}

function requireSuperAdmin(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.redirect("/superadmin/login");
  try {
    const user = verifyToken(token);
    if (user.role !== "superadmin") return res.redirect("/superadmin/login");
    req.user = user;
    next();
  } catch {
    res.clearCookie("token");
    return res.redirect("/superadmin/login");
  }
}

module.exports = { signToken, verifyToken, requireAuth, requireSuperAdmin };
