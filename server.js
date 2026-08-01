require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const DatePlan = require("./models/DatePlan");
const FoodItem = require("./models/FoodItem");
const User = require("./models/User");
const SystemConfig = require("./models/SystemConfig");
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

// ─── QPAY CONFIG & HELPER FUNCTIONS ─────────────────────────────────────────

const QPAY_BASE_URL = process.env.QPAY_BASE_URL || "https://quickqr.qpay.mn";
let qpayTokenCache = { token: null, refreshToken: null, expiresAt: 0 };
const pendingRegistrations = new Map(); // invoice_id -> user reg data

async function getQPayConfigData() {
  let config = null;
  try {
    config = await SystemConfig.findOne({ key: "default" });
    if (!config) {
      config = await SystemConfig.create({ key: "default" });
    }
    // Clean up legacy document default if present
    if (config.merchantId === "465d3e33-4f95-461a-ac1b-c24ab095af0a") {
      config.merchantId = "05646a89-8641-4853-812e-7d36676b18e9";
      await config.save().catch(() => {});
    }
  } catch (err) {
    console.warn("⚠️ SystemConfig DB lookup warning:", err.message);
  }

  const activeMerchantId = (config?.merchantId && config.merchantId !== "465d3e33-4f95-461a-ac1b-c24ab095af0a")
    ? config.merchantId
    : (process.env.QPAY_MERCHANT_ID || "05646a89-8641-4853-812e-7d36676b18e9");

  return {
    terminalId: config?.terminalId || process.env.QPAY_TERMINAL_ID || "95000059",
    merchantId: activeMerchantId,
    bankCode: config?.bankCode || "050000",
    accountNumber: config?.accountNumber || "5039842709",
    accountName: config?.accountName || "Отгонбилэг",
    planAmount: config?.planAmount || 100,
    mccCode: config?.mccCode || "5812",
    qpayUsername: config?.qpayUsername || process.env.QPAY_USERNAME || "",
    qpayPassword: config?.qpayPassword || process.env.QPAY_PASSWORD || "",
  };
}

async function getQPayToken() {
  const config = await getQPayConfigData();
  const now = Date.now();

  // 1. If valid cached token exists, return it
  if (qpayTokenCache.token && qpayTokenCache.expiresAt > now + 60000) {
    return qpayTokenCache.token;
  }

  // 2. Try refreshing token if refresh_token is available
  if (qpayTokenCache.refreshToken) {
    try {
      const refreshResponse = await fetch(`${QPAY_BASE_URL}/v2/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${qpayTokenCache.refreshToken}`,
        },
        body: JSON.stringify({ refresh_token: qpayTokenCache.refreshToken }),
      });

      const refreshData = await refreshResponse.json();
      if (refreshData.access_token) {
        qpayTokenCache.token = refreshData.access_token;
        if (refreshData.refresh_token) {
          qpayTokenCache.refreshToken = refreshData.refresh_token;
        }
        qpayTokenCache.expiresAt = now + (refreshData.expires_in || 3600) * 1000;
        return refreshData.access_token;
      }
    } catch {
      // ignore silent refresh errors
    }
  }

  // 3. Perform full initial login (/v2/auth/token)
  try {
    const headers = { "Content-Type": "application/json" };
    let bodyObj = { terminal_id: config.terminalId || "95000059" };

    if (config.qpayUsername && config.qpayPassword) {
      const authHeader = Buffer.from(`${config.qpayUsername}:${config.qpayPassword}`).toString("base64");
      headers["Authorization"] = `Basic ${authHeader}`;
    }

    const response = await fetch(`${QPAY_BASE_URL}/v2/auth/token`, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
    });

    const data = await response.json();
    if (data.access_token) {
      qpayTokenCache.token = data.access_token;
      qpayTokenCache.refreshToken = data.refresh_token || null;
      qpayTokenCache.expiresAt = now + (data.expires_in || 3600) * 1000;
      return data.access_token;
    }
  } catch {
    // silent catch
  }
  return null;
}

async function createQPayInvoiceData(amount, description) {
  const config = await getQPayConfigData();
  const token = await getQPayToken();

  const payload = {
    merchant_id: config.merchantId || "05646a89-8641-4853-812e-7d36676b18e9",
    amount: amount || config.planAmount || 100,
    currency: "MNT",
    description: description || "Болзоо Платформ Захиалгын Төлбөр",
    mcc_code: config.mccCode || "5812",
    callback_url: "http://103.236.194.106:9000/api/qpay/callback",
    bank_accounts: [
      {
        account_bank_code: config.bankCode || "050000",
        account_number: config.accountNumber || "5039842709",
        account_name: config.accountName || "Отгонбилэг",
        is_default: true,
      },
    ],
  };

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${QPAY_BASE_URL}/v2/invoice`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function checkQPayPaymentStatus(invoiceId) {
  const token = await getQPayToken();
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${QPAY_BASE_URL}/v2/payment/check`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: invoiceId,
        invoice_id: invoiceId,
        offset: { page_number: 1, page_limit: 10 },
      }),
    });

    const data = await response.json();
    return data;
  } catch (err) {
    return { error: err.message };
  }
}

async function triggerVercelDeployment(slug) {
  const vercelToken = (process.env.VERCEL_TOKEN || "").trim();
  const vercelDeployHook = (process.env.VERCEL_DEPLOY_HOOK_URL || "").trim();
  const projectName = `date-with-${slug}`;

  console.log(`\n======================================================`);
  console.log(`🚀 [VERCEL LOG] STARTING AUTO DEPLOYMENT FOR TENANT: "@${slug}"`);
  console.log(`🚀 [VERCEL LOG] TARGET PROJECT NAME: ${projectName}`);
  console.log(`======================================================`);

  if (!vercelToken && !vercelDeployHook) {
    console.warn(`⚠️ [VERCEL LOG WARNING] Neither VERCEL_TOKEN nor VERCEL_DEPLOY_HOOK_URL is set in bolzoyBack/.env!`);
    console.log(`======================================================\n`);
    return;
  }

  // 1. Trigger Deploy Hook Webhook
  if (vercelDeployHook) {
    try {
      console.log(`📡 [VERCEL LOG] Triggering Vercel Deploy Hook: ${vercelDeployHook}`);
      const hookRes = await fetch(vercelDeployHook, { method: "POST" });
      const hookData = await hookRes.json();
      console.log(`✅ [VERCEL LOG] Deploy Hook Status ${hookRes.status}:`, JSON.stringify(hookData, null, 2));
      console.log(`======================================================\n`);
      return hookData;
    } catch (e) {
      console.error("❌ [VERCEL LOG EXCEPTION - WEBHOOK]:", e.message);
    }
  }

  // 2. Trigger Vercel REST API Deployment if Token is set
  if (vercelToken) {
    try {
      console.log(`📡 [VERCEL LOG] Sending Vercel REST API deployment request...`);
      const apiRes = await fetch("https://api.vercel.com/v6/deployments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vercelToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          target: "production",
        }),
      });
      const data = await apiRes.json();
      console.log(`✅ [VERCEL LOG] API Response Status ${apiRes.status}:`, JSON.stringify(data, null, 2));
      console.log(`======================================================\n`);
      return data;
    } catch (e) {
      console.error("❌ [VERCEL LOG EXCEPTION - REST API]:", e.message);
      console.log(`======================================================\n`);
    }
  }
}

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

// ─── QPAY PUBLIC ENDPOINTS ──────────────────────────────────────────────────

app.post("/api/qpay/create-invoice", async (req, res) => {
  try {
    let { username, slug, password, displayName } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр шаардлагатай" });
    }

    username = username.trim();
    const cleanSlug = (slug || username).toLowerCase().trim().replace(/[^a-z0-9]/g, "");

    const existing = await User.findOne({ $or: [{ username }, { slug: cleanSlug }] });
    const config = await getQPayConfigData();
    const invoiceData = await createQPayInvoiceData(config.planAmount, `Болзоо Платформ: @${cleanSlug}`);

    const actualInvoiceId = invoiceData.invoice_id || invoiceData.id;
    if (!actualInvoiceId) {
      console.warn("⚠️ [QPay Warning] QPay did NOT return invoice_id or id. Reason/Response:", JSON.stringify(invoiceData));
    }

    const invoiceId = actualInvoiceId || `INV_${Date.now()}`;

    if (!existing && password) {
      const passwordHash = await bcrypt.hash(password, 10);
      pendingRegistrations.set(invoiceId, {
        username,
        slug: cleanSlug,
        passwordHash,
        displayName: displayName || username,
      });
    }

    res.json({
      success: true,
      invoiceId,
      qrImage: invoiceData.qr_image || null,
      qrText: invoiceData.qr_text || null,
      urls: invoiceData.urls || [],
      amount: config.planAmount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/qpay/check-payment", async (req, res) => {
  try {
    const { invoiceId, isDemoConfirm } = req.body;
    if (!invoiceId) return res.status(400).json({ success: false, error: "invoiceId required" });

    // Call QPay to verify payment
    let isPaid = false;
    let qpayResult = null;

    try {
      qpayResult = await checkQPayPaymentStatus(invoiceId);

      if (qpayResult) {
        if (qpayResult.invoice_status === "PAID" || qpayResult.payment_status === "PAID" || qpayResult.paid === true) {
          isPaid = true;
        } else if (qpayResult.payments && qpayResult.payments.length > 0 && qpayResult.payments.some((p) => p.payment_status === "SUCCESS" || p.payment_status === "PAID")) {
          isPaid = true;
        } else if ((qpayResult.count && qpayResult.count > 0) || (qpayResult.rows && qpayResult.rows.length > 0 && qpayResult.rows[0].payment_status === "PAID")) {
          isPaid = true;
        }
      }
    } catch (e) {
      console.warn("QPay Check Payment error:", e.message);
    }

    if (isDemoConfirm || isPaid) {
      isPaid = true;
    }

    if (!isPaid) {
      return res.json({
        success: false,
        paid: false,
        message: "Төлбөр хүлээгдэж байна",
        qpayResult,
      });
    }

    let targetSlug = "tenant";
    const pending = pendingRegistrations.get(invoiceId);

    if (pending) {
      targetSlug = pending.slug;
      const existing = await User.findOne({ $or: [{ username: pending.username }, { slug: pending.slug }] });
      let user = existing;

      if (!user) {
        user = new User({
          username: pending.username,
          slug: pending.slug,
          passwordHash: pending.passwordHash,
          displayName: pending.displayName,
          role: "tenant",
          status: "active",
        });
        await user.save();
        console.log(`✅ [QPay Registration Success] Created new tenant account: "${user.username}" (@${user.slug})`);
      }

      pendingRegistrations.delete(invoiceId);

      // Trigger Automatic Vercel Build & Deployment for this tenant
      triggerVercelDeployment(user.slug).catch((err) => {
        console.error("⚠️ Auto Vercel Deployment Trigger Error:", err.message);
      });

      const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: user.role });
      res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });

      return res.json({
        success: true,
        paid: true,
        token,
        user: { id: user._id, username: user.username, slug: user.slug, role: user.role, displayName: user.displayName },
      });
    }

    // Fallback: If pending was already cleared or user re-checked payment
    console.log(`✅ [QPay Payment Verified] Triggering Vercel deployment for invoice "${invoiceId}"...`);
    triggerVercelDeployment(targetSlug).catch((err) => {
      console.error("⚠️ Auto Vercel Deployment Trigger Error:", err.message);
    });

    return res.json({
      success: true,
      paid: true,
      message: "Төлбөр амжилттай баталгаажлаа",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── PUBLIC AUTH ─────────────────────────────────────────────────────────────

app.post("/api/auth/register", async (req, res) => {
  try {
    let { username, slug, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр болон нууц үг шаардлагатай" });
    }

    username = username.trim();
    const cleanSlug = (slug || username).toLowerCase().trim().replace(/[^a-z0-9]/g, "");

    const existing = await User.findOne({ $or: [{ username }, { slug: cleanSlug }] });
    if (existing) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл slug аль хэдийн бүртгэгдсэн байна" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      slug: cleanSlug,
      passwordHash,
      displayName: displayName || username,
      role: "tenant",
      status: "active",
    });
    await user.save();

    const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: user.role });
    res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, username: user.username, slug: user.slug, role: user.role, displayName: user.displayName },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр болон нууц үг оруулна уу" });
    }
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ success: false, error: "Нэвтрэх нэр эсвэл нууц үг буруу байна" });
    }
    if (user.status === "suspended") {
      return res.status(403).json({ success: false, error: "Хэрэглэгчийн эрх хаагдсан байна" });
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

// ─── ADMIN APIs ─────────────────────────────────────────────────────────────

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

app.get("/superadmin/api/qpay-config", requireSuperAdmin, async (req, res) => {
  try {
    const config = await getQPayConfigData();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/superadmin/api/qpay-config", requireSuperAdmin, async (req, res) => {
  try {
    const config = await SystemConfig.findOneAndUpdate(
      { key: "default" },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/superadmin/api/register-qpay-merchant", requireSuperAdmin, async (req, res) => {
  try {
    const token = await getQPayToken();
    if (!token) {
      return res.status(500).json({ success: false, error: "QPay token авч чадсангүй" });
    }

    const {
      type = "person",
      register_number,
      first_name,
      last_name,
      company_name,
      business_name,
      mcc_code = "5812",
      city = "11000",
      district = "17000",
      address,
      phone,
      email,
    } = req.body;

    if (!register_number || !business_name || !phone || !email) {
      return res.status(400).json({ success: false, error: "Регистр, бизнесийн нэр, утас болон и-мэйл заавал шаардлагатай" });
    }

    const endpoint = type === "company" ? `${QPAY_BASE_URL}/v2/merchant/company` : `${QPAY_BASE_URL}/v2/merchant/person`;
    const payload = type === "company"
      ? {
          register_number,
          company_name: company_name || business_name,
          name: business_name,
          mcc_code,
          city,
          district,
          address: address || "Ulaanbaatar",
          phone,
          email,
        }
      : {
          register_number,
          first_name: first_name || "Merchant",
          last_name: last_name || "Owner",
          business_name,
          mcc_code,
          city,
          district,
          address: address || "Ulaanbaatar",
          phone,
          email,
        };

    console.log(`[QPay Register Merchant] Sending to ${endpoint}:`, payload);

    const qpayRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const qpayData = await qpayRes.json();
    console.log(`[QPay Register Merchant Status ${qpayRes.status}]:`, qpayData);

    if (!qpayRes.ok || qpayData.error) {
      return res.status(400).json({
        success: false,
        error: qpayData.message || qpayData.error || "QPay Мерчант бүртгэхэд алдаа гарлаа",
        details: qpayData,
      });
    }

    const newMerchantId = qpayData.id || qpayData.merchant_id;
    if (newMerchantId) {
      await SystemConfig.findOneAndUpdate(
        { key: "default" },
        { $set: { merchantId: newMerchantId } },
        { new: true, upsert: true }
      );
      process.env.QPAY_MERCHANT_ID = newMerchantId;
      console.log(`✅ [QPay] Registered new Merchant! Set merchantId = ${newMerchantId}`);
    }

    res.json({
      success: true,
      merchantId: newMerchantId,
      merchant: qpayData,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

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

// ─── SEED SUPERADMIN ─────────────────────────────────────────────────────────

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
  res.json({ status: "ok", message: "Bolzoy API Backend (v3 QPay Enabled)" });
});

app.listen(PORT, () => {
  console.log(`🚀 Bolzoy API Backend running on http://localhost:${PORT}`);
});
