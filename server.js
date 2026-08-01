require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const DatePlan = require("./models/DatePlan");
const FoodItem = require("./models/FoodItem");
const User = require("./models/User");
const { signToken, requireAuth, requireSuperAdmin } = require("./middleware/auth");

const app = express();
const PORT = process.env.PORT || 9000;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ─── PUBLIC API (tenant-scoped by tenantSlug in body/query) ──────────────────

app.post("/api/plans", async (req, res) => {
  try {
    const { tenantSlug, ...rest } = req.body;
    if (!tenantSlug) return res.status(400).json({ success: false, error: "tenantSlug required" });
    const plan = new DatePlan({ tenantSlug, ...rest });
    await plan.save();
    res.status(201).json({ success: true, id: plan._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/foods", async (req, res) => {
  try {
    const { type, tenantSlug } = req.query;
    if (!tenantSlug) return res.status(400).json({ error: "tenantSlug required" });
    const filter = { tenantSlug, ...(type ? { type } : {}) };
    const foods = await FoodItem.find(filter).sort({ createdAt: -1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── JSON API FOR FRONTEND (bolzoyAdmin) ───────────────────────────────────────

app.post("/admin/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.role === "superadmin") {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: user.role });
    res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, slug: user.slug, role: user.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/superadmin/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, role: "superadmin" });
    if (!user) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: "superadmin" });
    res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, slug: user.slug, role: "superadmin" },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/api/me", requireAuth(), (req, res) => {
  res.json({ success: true, user: req.user });
});

app.get("/admin/api/plans", requireAuth("tenant"), async (req, res) => {
  try {
    const plans = await DatePlan.find({ tenantSlug: req.user.slug }).sort({ createdAt: -1 });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/api/foods", requireAuth("tenant"), async (req, res) => {
  try {
    const foods = await FoodItem.find({ tenantSlug: req.user.slug }).sort({ type: 1, createdAt: -1 });
    res.json({ success: true, foods });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/admin/api/plans/:id", requireAuth("tenant"), async (req, res) => {
  try {
    await DatePlan.findOneAndDelete({ _id: req.params.id, tenantSlug: req.user.slug });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/admin/api/foods", requireAuth("tenant"), async (req, res) => {
  try {
    const item = new FoodItem({ ...req.body, tenantSlug: req.user.slug });
    await item.save();
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/admin/api/foods/:id", requireAuth("tenant"), async (req, res) => {
  try {
    await FoodItem.findOneAndDelete({ _id: req.params.id, tenantSlug: req.user.slug });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SUPERADMIN JSON API ──────────────────────────────────────────────────────

app.get("/superadmin/api/tenants", requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await User.find({ role: "tenant" }).sort({ createdAt: -1 });
    res.json({ success: true, tenants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/superadmin/api/tenants", requireSuperAdmin, async (req, res) => {
  try {
    const { username, slug, password } = req.body;
    if (!username || !slug || !password) return res.status(400).json({ error: "Бүх талбарыг бөглөнө үү" });
    const existing = await User.findOne({ $or: [{ username }, { slug }] });
    if (existing) return res.status(400).json({ error: "Username эсвэл slug аль хэдийн байна" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, slug, passwordHash, role: "tenant" });
    await user.save();
    res.status(201).json({ success: true, slug: user.slug, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/superadmin/api/tenants/:id", requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === "superadmin") return res.status(400).json({ error: "Invalid tenant" });
    await Promise.all([
      DatePlan.deleteMany({ tenantSlug: user.slug }),
      FoodItem.deleteMany({ tenantSlug: user.slug }),
      User.findByIdAndDelete(req.params.id),
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SEED SUPERADMIN (run once) ───────────────────────────────────────────────

async function seedSuperAdmin() {
  const exists = await User.findOne({ role: "superadmin" });
  if (!exists) {
    const passwordHash = await bcrypt.hash("bolzoy_admin_2024", 10);
    await User.create({ username: "superadmin", slug: "superadmin", passwordHash, role: "superadmin" });
    console.log("✅ SuperAdmin created: username=superadmin password=bolzoy_admin_2024");
  }
}

mongoose.connection.once("open", seedSuperAdmin);

// ─── ROOT ─────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Bolzoy API Backend" });
});

app.listen(PORT, () => {
  console.log(`🚀 Bolzoy API Backend running on http://localhost:${PORT}`);
});
