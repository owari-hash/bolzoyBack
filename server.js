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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
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

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

app.post("/api/plans", async (req, res) => {
  try {
    const { tenantSlug, ...rest } = req.body;
    if (!tenantSlug) return res.status(400).json({ success: false, error: "tenantSlug required" });
    const plan = new DatePlan({ tenantSlug, ...rest, status: "new" });
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
    const filter = { tenantSlug, isActive: true, ...(type ? { type } : {}) };
    const foods = await FoodItem.find(filter).sort({ createdAt: -1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AUTH APIs ───────────────────────────────────────────────────────────────

app.post("/admin/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || user.role === "superadmin") {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, error: "Энэ хэрэглэгчийн эрх хаагдсан байна" });
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
      user: { id: user._id, username: user.username, slug: user.slug, role: user.role, displayName: user.displayName },
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

// ─── TENANT ADMIN APIs ────────────────────────────────────────────────────────

app.get("/admin/api/plans", requireAuth("tenant"), async (req, res) => {
  try {
    const plans = await DatePlan.find({ tenantSlug: req.user.slug }).sort({ createdAt: -1 });
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.patch("/admin/api/plans/:id", requireAuth("tenant"), async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status) update.status = status;
    if (notes !== undefined) update.notes = notes;

    const plan = await DatePlan.findOneAndUpdate(
      { _id: req.params.id, tenantSlug: req.user.slug },
      { $set: update },
      { new: true }
    );
    if (!plan) return res.status(404).json({ success: false, error: "Plan not found" });
    res.json({ success: true, plan });
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

app.get("/admin/api/foods", requireAuth("tenant"), async (req, res) => {
  try {
    const foods = await FoodItem.find({ tenantSlug: req.user.slug }).sort({ createdAt: -1 });
    res.json({ success: true, foods });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

app.put("/admin/api/foods/:id", requireAuth("tenant"), async (req, res) => {
  try {
    const item = await FoodItem.findOneAndUpdate(
      { _id: req.params.id, tenantSlug: req.user.slug },
      { $set: req.body },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, error: "Item not found" });
    res.json({ success: true, item });
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

// Analytics endpoint for tenant admin dashboard
app.get("/admin/api/analytics", requireAuth("tenant"), async (req, res) => {
  try {
    const slug = req.user.slug;
    const [plans, foods] = await Promise.all([
      DatePlan.find({ tenantSlug: slug }),
      FoodItem.find({ tenantSlug: slug }),
    ]);

    const totalPlans = plans.length;
    const statusCounts = {
      new: plans.filter((p) => (p.status || "new") === "new").length,
      confirmed: plans.filter((p) => p.status === "confirmed").length,
      completed: plans.filter((p) => p.status === "completed").length,
      cancelled: plans.filter((p) => p.status === "cancelled").length,
    };

    const venueRatio = {
      outdoorFood: plans.filter((p) => p.foodVenue === "outdoor").length,
      homeFood: plans.filter((p) => p.foodVenue === "home").length,
      outdoorMovie: plans.filter((p) => p.movieVenue === "outdoor").length,
      homeMovie: plans.filter((p) => p.movieVenue === "home").length,
    };

    const timeDistribution = {
      morning: plans.filter((p) => p.time === "morning").length,
      afternoon: plans.filter((p) => p.time === "afternoon").length,
      evening: plans.filter((p) => p.time === "evening").length,
      night: plans.filter((p) => p.time === "night").length,
    };

    // Calculate food frequencies
    const foodFrequencies = {};
    plans.forEach((p) => {
      if (Array.isArray(p.foods)) {
        p.foods.forEach((fid) => {
          foodFrequencies[fid] = (foodFrequencies[fid] || 0) + 1;
        });
      }
    });

    const topFoods = foods
      .map((f) => ({
        id: f._id,
        emoji: f.emoji,
        name: f.name,
        count: foodFrequencies[f._id.toString()] || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      success: true,
      totalPlans,
      totalFoods: foods.length,
      statusCounts,
      venueRatio,
      timeDistribution,
      topFoods,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── SUPERADMIN APIs ─────────────────────────────────────────────────────────

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
    const { username, slug, password, displayName } = req.body;
    if (!username || !slug || !password) return res.status(400).json({ error: "Бүх талбарыг бөглөнө үү" });
    const existing = await User.findOne({ $or: [{ username }, { slug }] });
    if (existing) return res.status(400).json({ error: "Username эсвэл slug аль хэдийн байна" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, slug, passwordHash, displayName: displayName || "", role: "tenant" });
    await user.save();
    res.status(201).json({ success: true, slug: user.slug, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/superadmin/api/tenants/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { status, password } = req.body;
    const update = {};
    if (status) update.status = status;
    if (password) {
      update.passwordHash = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!user) return res.status(404).json({ success: false, error: "Tenant not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

app.get("/superadmin/api/analytics", requireSuperAdmin, async (req, res) => {
  try {
    const [tenantsCount, activeTenantsCount, plansCount, foodsCount] = await Promise.all([
      User.countDocuments({ role: "tenant" }),
      User.countDocuments({ role: "tenant", status: "active" }),
      DatePlan.countDocuments(),
      FoodItem.countDocuments(),
    ]);

    res.json({
      success: true,
      totalTenants: tenantsCount,
      activeTenants: activeTenantsCount,
      totalPlans: plansCount,
      totalFoods: foodsCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── ROOT ─────────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Bolzoy API Backend (v2 Enhanced)" });
});

app.listen(PORT, () => {
  console.log(`🚀 Bolzoy API Backend running on http://localhost:${PORT}`);
});
