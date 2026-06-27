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

app.use(cors({ credentials: true }));
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

// ─── SHARED HTML HELPERS ──────────────────────────────────────────────────────

const timeLabels = {
  morning: "🌞 Өглөө (09:00)",
  afternoon: "☀️ Өдөр (13:00)",
  evening: "🌅 Орой (18:00)",
  night: "🌙 Шөнө (20:00)",
};

const baseStyles = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); min-height: 100vh; color: #e0d6f7; padding: 32px 16px; }
  h1 { text-align: center; font-size: 2rem; background: linear-gradient(90deg, #f9a8d4, #c084fc, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
  h2 { font-size: 1.2rem; color: #c084fc; margin-bottom: 16px; }
  .subtitle { text-align: center; color: #a78bfa; margin-bottom: 32px; font-size: 0.9rem; }
  .stats { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 32px; }
  .stat-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(167,139,250,0.3); border-radius: 16px; padding: 20px 32px; text-align: center; backdrop-filter: blur(10px); }
  .stat-card .number { font-size: 2.5rem; font-weight: 700; background: linear-gradient(90deg, #f9a8d4, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .stat-card .label { color: #c4b5fd; font-size: 0.85rem; margin-top: 4px; }
  .section { margin-bottom: 48px; }
  .table-wrap { overflow-x: auto; border-radius: 16px; border: 1px solid rgba(167,139,250,0.2); backdrop-filter: blur(10px); }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: rgba(167,139,250,0.15); }
  th { padding: 14px 16px; font-size: 0.78rem; letter-spacing: .05em; text-transform: uppercase; color: #c084fc; text-align: left; white-space: nowrap; }
  tbody tr { border-top: 1px solid rgba(167,139,250,0.1); transition: background .15s; }
  tbody tr:hover { background: rgba(255,255,255,0.04); }
  td { padding: 12px 16px; font-size: 0.88rem; vertical-align: middle; }
  td.num { color: #7c3aed; font-weight: 700; } td.center { text-align: center; } td.muted { color: #9ca3af; } td.small { font-size: 0.78rem; }
  .del-btn { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 6px 10px; cursor: pointer; color: #fca5a5; font-size: 1rem; transition: all .2s; }
  .del-btn:hover { background: rgba(239,68,68,0.35); }
  .empty { text-align: center; padding: 40px; color: #7c3aed; font-size: 1rem; }
  .btn { border: none; border-radius: 12px; padding: 10px 24px; color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: opacity .2s; }
  .btn:hover { opacity: 0.85; }
  .btn-purple { background: linear-gradient(135deg, #7c3aed, #db2777); }
  .btn-green { background: linear-gradient(135deg, #059669, #0d9488); }
  .btn-red { background: linear-gradient(135deg, #dc2626, #b91c1c); }
  .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .refresh-row { display: flex; justify-content: flex-end; margin-bottom: 12px; gap: 8px; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 12px; font-size: 0.9rem; display: none; box-shadow: 0 4px 24px rgba(124,58,237,0.5); z-index: 99; }
  .form-card { background: rgba(255,255,255,0.05); padding: 16px; border-radius: 14px; border: 1px solid rgba(167,139,250,0.2); display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
  .form-card input, .form-card select { background: rgba(255,255,255,0.08); border: 1px solid rgba(167,139,250,0.3); border-radius: 10px; padding: 10px 14px; color: #e0d6f7; font-size: 0.9rem; outline: none; flex: 1; min-width: 120px; }
  .form-card input::placeholder { color: #7c6fad; }
  .form-card select option { background: #1a1535; }
  .badge { padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
  .badge.outdoor { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
  .badge.home { background: rgba(52,211,153,0.2); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  .badge.tenant { background: rgba(129,140,248,0.2); color: #818cf8; border: 1px solid rgba(129,140,248,0.3); }
  .login-wrap { max-width: 400px; margin: 80px auto; }
  .login-card { background: rgba(255,255,255,0.07); border: 1px solid rgba(167,139,250,0.3); border-radius: 20px; padding: 40px; backdrop-filter: blur(10px); }
  .login-card input { width: 100%; background: rgba(255,255,255,0.08); border: 1px solid rgba(167,139,250,0.3); border-radius: 10px; padding: 12px 16px; color: #e0d6f7; font-size: 1rem; outline: none; margin-bottom: 14px; }
  .login-card input::placeholder { color: #7c6fad; }
  .login-card .btn { width: 100%; padding: 14px; font-size: 1rem; margin-top: 4px; }
  .error { color: #fca5a5; text-align: center; margin-top: 12px; font-size: 0.9rem; }
  .slug-tag { font-size: 0.75rem; background: rgba(129,140,248,0.15); color: #a5b4fc; border: 1px solid rgba(129,140,248,0.3); border-radius: 20px; padding: 2px 10px; margin-left: 8px; }
`;

const toastScript = `
  function showToast(msg, ok=true) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.background = ok ? '#7c3aed' : '#dc2626';
    t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500);
  }
`;

// ─── ADMIN LOGIN ───────────────────────────────────────────────────────────────

app.get("/admin/login", (req, res) => {
  const err = req.query.error ? '<p class="error">❌ Нэвтрэх мэдээлэл буруу байна</p>' : '';
  res.send(`<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin Login</title><style>${baseStyles}</style></head><body>
  <div class="login-wrap">
    <h1>💖 Болзоо</h1>
    <p class="subtitle">Admin нэвтрэх</p>
    <div class="login-card">
      <form method="POST" action="/admin/login">
        <input name="username" placeholder="Нэвтрэх нэр" required autofocus />
        <input name="password" type="password" placeholder="Нууц үг" required />
        <button type="submit" class="btn btn-purple">Нэвтрэх →</button>
      </form>
      ${err}
    </div>
  </div>
</body></html>`);
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || user.role === "superadmin") return res.redirect("/admin/login?error=1");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.redirect("/admin/login?error=1");
  const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: user.role });
  res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
  res.redirect("/admin");
});

app.get("/admin/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/admin/login");
});

// ─── ADMIN DASHBOARD (tenant-scoped, auth-gated) ──────────────────────────────

app.get("/admin", requireAuth("tenant"), async (req, res) => {
  const slug = req.user.slug;
  try {
    const [plans, foods] = await Promise.all([
      DatePlan.find({ tenantSlug: slug }).sort({ createdAt: -1 }),
      FoodItem.find({ tenantSlug: slug }).sort({ type: 1, createdAt: -1 }),
    ]);
    const foodMap = {};
    foods.forEach((f) => { foodMap[f._id.toString()] = `${f.emoji} ${f.name}`; });
    const rows = plans.map((p, i) => {
      const foodNames = p.foods.map((id) => foodMap[id] || id).join(", ") || "—";
      const time = timeLabels[p.time] || p.time || "—";
      const fv = p.foodVenue === "outdoor" ? "🏙️ Гадуур" : p.foodVenue === "home" ? "🏠 Гэртээ" : "—";
      const mv = p.movieVenue === "outdoor" ? "🎭 Кино театр" : p.movieVenue === "home" ? "🛋️ Гэрийн театр" : "—";
      const dt = new Date(p.createdAt).toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" });
      return `<tr data-id="${p._id}"><td class="num">${i+1}</td><td><strong>${p.name||"—"}</strong></td><td>${p.date||"—"}</td><td>${time}</td><td>${fv}</td><td>${foodNames}</td><td>${mv}</td><td class="muted small">${dt}</td><td class="center"><button class="del-btn" onclick="delPlan('${p._id}')">🗑️</button></td></tr>`;
    }).join("");
    const foodRows = foods.map((f) =>
      `<tr data-fid="${f._id}"><td>${f.emoji}</td><td>${f.name}</td><td><span class="badge ${f.type}">${f.type==="outdoor"?"🏙️ Гадуур":"🏠 Гэртээ"}</span></td><td class="center"><button class="del-btn" onclick="delFood('${f._id}')">🗑️</button></td></tr>`
    ).join("");
    res.send(`<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Admin — ${slug}</title><style>${baseStyles}</style></head><body>
  <div class="topbar">
    <h1 style="font-size:1.4rem">💖 Admin <span class="slug-tag">${slug}</span></h1>
    <a href="/admin/logout"><button class="btn btn-red">Гарах</button></a>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="number">${plans.length}</div><div class="label">Нийт хүсэлт</div></div>
    <div class="stat-card"><div class="number">${plans.filter(p=>p.movieVenue).length}</div><div class="label">Кино үзнэ 🎬</div></div>
    <div class="stat-card"><div class="number">${foods.length}</div><div class="label">Хоолны сонголт 🍜</div></div>
  </div>
  <div class="section">
    <h2>🍜 Хоолны жагсаалт</h2>
    <div class="form-card">
      <input id="f-emoji" placeholder="Emoji (🍕)" maxlength="4" style="max-width:90px"/>
      <input id="f-name" placeholder="Хоолны нэр"/>
      <select id="f-type"><option value="outdoor">🏙️ Гадуур</option><option value="home">🏠 Гэртээ</option></select>
      <button class="btn btn-green" onclick="addFood()">+ Нэмэх</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Emoji</th><th>Нэр</th><th>Төрөл</th><th>Устгах</th></tr></thead>
      <tbody id="ftbody">${foodRows||'<tr><td colspan="4" class="empty">Хоол нэмэгдээгүй байна</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="section">
    <h2>📋 Ирсэн хүсэлтүүд</h2>
    <div class="refresh-row"><button class="btn btn-purple" onclick="location.reload()">🔄 Шинэчлэх</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>🌸 Нэр</th><th>📅 Огноо</th><th>⏰ Цаг</th><th>🏙️ Хоолны газар</th><th>🍜 Хоол</th><th>🎬 Кино газар</th><th>🕐 Илгээсэн</th><th>Устгах</th></tr></thead>
      <tbody id="ptbody">${rows||'<tr><td colspan="9" class="empty">Одоогоор хүсэлт ирээгүй байна 💤</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    ${toastScript}
    async function delPlan(id){if(!confirm('Устгах уу?'))return;const r=await fetch('/admin/api/plans/'+id,{method:'DELETE'});if(r.ok){document.querySelector('[data-id="'+id+'"]').remove();showToast('✅ Устгалаа!');}}
    async function addFood(){const emoji=document.getElementById('f-emoji').value.trim()||'🍽️';const name=document.getElementById('f-name').value.trim();const type=document.getElementById('f-type').value;if(!name)return alert('Нэр оруулна уу');const r=await fetch('/admin/api/foods',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji,name,type})});if(r.ok){showToast('✅ Хоол нэмэгдлээ!');setTimeout(()=>location.reload(),800);}}
    async function delFood(id){if(!confirm('Устгах уу?'))return;const r=await fetch('/admin/api/foods/'+id,{method:'DELETE'});if(r.ok){document.querySelector('[data-fid="'+id+'"]').remove();showToast('🗑️ Устгалаа!');}}
  </script>
</body></html>`);
  } catch (err) { res.status(500).send("Server error: " + err.message); }
});

// ─── ADMIN API (auth-gated, tenant-scoped) ────────────────────────────────────

app.delete("/admin/api/plans/:id", requireAuth("tenant"), async (req, res) => {
  try {
    await DatePlan.findOneAndDelete({ _id: req.params.id, tenantSlug: req.user.slug });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/admin/api/foods", requireAuth("tenant"), async (req, res) => {
  try {
    const item = new FoodItem({ ...req.body, tenantSlug: req.user.slug });
    await item.save();
    res.status(201).json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/admin/api/foods/:id", requireAuth("tenant"), async (req, res) => {
  try {
    await FoodItem.findOneAndDelete({ _id: req.params.id, tenantSlug: req.user.slug });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── SUPERADMIN LOGIN ─────────────────────────────────────────────────────────

app.get("/superadmin/login", (req, res) => {
  const err = req.query.error ? '<p class="error">❌ Нэвтрэх мэдээлэл буруу байна</p>' : '';
  res.send(`<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>SuperAdmin Login</title><style>${baseStyles}</style></head><body>
  <div class="login-wrap">
    <h1>👑 SuperAdmin</h1>
    <p class="subtitle">Системийн эрхтэн нэвтрэх</p>
    <div class="login-card">
      <form method="POST" action="/superadmin/login">
        <input name="username" placeholder="Нэвтрэх нэр" required autofocus/>
        <input name="password" type="password" placeholder="Нууц үг" required/>
        <button type="submit" class="btn btn-purple">Нэвтрэх →</button>
      </form>
      ${err}
    </div>
  </div>
</body></html>`);
});

app.post("/superadmin/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username, role: "superadmin" });
  if (!user) return res.redirect("/superadmin/login?error=1");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.redirect("/superadmin/login?error=1");
  const token = signToken({ id: user._id, username: user.username, slug: user.slug, role: "superadmin" });
  res.cookie("token", token, { httpOnly: true, maxAge: 12 * 60 * 60 * 1000 });
  res.redirect("/superadmin");
});

app.get("/superadmin/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/superadmin/login");
});

// ─── SUPERADMIN DASHBOARD ─────────────────────────────────────────────────────

app.get("/superadmin", requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await User.find({ role: "tenant" }).sort({ createdAt: -1 });
    const rows = tenants.map((u, i) => `
      <tr data-uid="${u._id}">
        <td class="num">${i+1}</td>
        <td><strong>${u.username}</strong></td>
        <td><span class="badge tenant">${u.slug}</span></td>
        <td class="muted small">${new Date(u.createdAt).toLocaleString("mn-MN",{timeZone:"Asia/Ulaanbaatar"})}</td>
        <td class="center"><button class="del-btn" onclick="delTenant('${u._id}')">🗑️</button></td>
      </tr>`).join("");
    res.send(`<!DOCTYPE html><html lang="mn"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>SuperAdmin</title><style>${baseStyles}</style></head><body>
  <div class="topbar">
    <h1 style="font-size:1.4rem">👑 SuperAdmin Dashboard</h1>
    <a href="/superadmin/logout"><button class="btn btn-red">Гарах</button></a>
  </div>
  <div class="stats">
    <div class="stat-card"><div class="number">${tenants.length}</div><div class="label">Нийт tenant</div></div>
  </div>
  <div class="section">
    <h2>➕ Шинэ tenant үүсгэх</h2>
    <div class="form-card">
      <input id="t-username" placeholder="Username (нэвтрэх нэр)"/>
      <input id="t-slug" placeholder="Slug (URL-д хэрэглэгдэнэ, жнь: sara)"/>
      <input id="t-password" type="password" placeholder="Нууц үг"/>
      <button class="btn btn-green" onclick="createTenant()">+ Үүсгэх</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Username</th><th>Slug</th><th>Үүсгэсэн</th><th>Устгах</th></tr></thead>
      <tbody id="ttbody">${rows||'<tr><td colspan="5" class="empty">Tenant байхгүй байна</td></tr>'}</tbody>
    </table></div>
  </div>
  <div class="toast" id="toast"></div>
  <script>
    ${toastScript}
    async function createTenant(){
      const username=document.getElementById('t-username').value.trim();
      const slug=document.getElementById('t-slug').value.trim().toLowerCase();
      const password=document.getElementById('t-password').value.trim();
      if(!username||!slug||!password)return alert('Бүх талбарыг бөглөнө үү');
      const r=await fetch('/superadmin/api/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,slug,password})});
      const d=await r.json();
      if(r.ok){showToast('✅ Tenant үүсгэлээ!');setTimeout(()=>location.reload(),800);}
      else showToast('❌ '+d.error,false);
    }
    async function delTenant(id){
      if(!confirm('Энэ tenant болон түүний бүх дата устгагдана. Устгах уу?'))return;
      const r=await fetch('/superadmin/api/tenants/'+id,{method:'DELETE'});
      if(r.ok){document.querySelector('[data-uid="'+id+'"]').remove();showToast('🗑️ Устгалаа!');}
    }
  </script>
</body></html>`);
  } catch (err) { res.status(500).send("Server error: " + err.message); }
});

// ─── SUPERADMIN API ───────────────────────────────────────────────────────────

app.post("/superadmin/api/tenants", requireSuperAdmin, async (req, res) => {
  try {
    const { username, slug, password } = req.body;
    if (!username || !slug || !password) return res.status(400).json({ error: "Бүх талбарыг бөглөнө үү" });
    const existing = await User.findOne({ $or: [{ username }, { slug }] });
    if (existing) return res.status(400).json({ error: "Username эсвэл slug аль хэдийн байна" });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({ username, slug, passwordHash, role: "tenant" });
    await user.save();
    res.status(201).json({ success: true, slug: user.slug });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/superadmin/api/tenants/:id", requireSuperAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role === "superadmin") return res.status(400).json({ error: "Invalid" });
    await Promise.all([
      DatePlan.deleteMany({ tenantSlug: user.slug }),
      FoodItem.deleteMany({ tenantSlug: user.slug }),
      User.findByIdAndDelete(req.params.id),
    ]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  res.json({ status: "ok", message: "Bolzoy API", admin: "/admin", superadmin: "/superadmin" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin: http://localhost:${PORT}/admin`);
  console.log(`👑 SuperAdmin: http://localhost:${PORT}/superadmin`);
});
