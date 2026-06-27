require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const DatePlan = require("./models/DatePlan");
const FoodItem = require("./models/FoodItem");

const app = express();
const PORT = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// ─── API ROUTES ────────────────────────────────────────────────────────────────

app.post("/api/plans", async (req, res) => {
  try {
    const plan = new DatePlan(req.body);
    await plan.save();
    res.status(201).json({ success: true, id: plan._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/plans", async (req, res) => {
  try {
    const plans = await DatePlan.find().sort({ createdAt: -1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/plans/:id", async (req, res) => {
  try {
    await DatePlan.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FOOD ITEMS API ───────────────────────────────────────────────────────────

app.get("/api/foods", async (req, res) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const foods = await FoodItem.find(filter).sort({ createdAt: -1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/foods", async (req, res) => {
  try {
    const item = new FoodItem(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/foods/:id", async (req, res) => {
  try {
    await FoodItem.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

const timeLabels = {
  morning: "🌞 Өглөө (09:00)",
  afternoon: "☀️ Өдөр (13:00)",
  evening: "🌅 Орой (18:00)",
  night: "🌙 Шөнө (20:00)",
};

app.get("/admin", async (req, res) => {
  try {
    const [plans, foods] = await Promise.all([
      DatePlan.find().sort({ createdAt: -1 }),
      FoodItem.find().sort({ type: 1, createdAt: -1 }),
    ]);

    const foodMap = {};
    foods.forEach((f) => { foodMap[f._id.toString()] = `${f.emoji} ${f.name}`; });

    const rows = plans
      .map((p, i) => {
        const foodNames = p.foods.map((id) => foodMap[id] || id).join(", ") || "—";
        const time = timeLabels[p.time] || p.time || "—";
        const foodVenue = p.foodVenue === "outdoor" ? "🏙️ Гадуур" : p.foodVenue === "home" ? "🏠 Гэртээ" : "—";
        const movieVenue = p.movieVenue === "outdoor" ? "🎭 Кино театр" : p.movieVenue === "home" ? "🛋️ Гэрийн театр" : "—";
        const date = new Date(p.createdAt).toLocaleString("mn-MN", {
          timeZone: "Asia/Ulaanbaatar",
        });

        return `
        <tr class="row" data-id="${p._id}">
          <td class="num">${i + 1}</td>
          <td><strong>${p.name || "—"}</strong></td>
          <td>${p.date || "—"}</td>
          <td>${time}</td>
          <td>${foodVenue}</td>
          <td>${foodNames}</td>
          <td>${movieVenue}</td>
          <td class="muted small">${date}</td>
          <td class="center">
            <button class="del-btn" onclick="deletePlan('${p._id}')">🗑️</button>
          </td>
        </tr>`;
      })
      .join("");

    const foodRows = foods.map((f) => `
      <tr data-food-id="${f._id}">
        <td>${f.emoji}</td>
        <td>${f.name}</td>
        <td><span class="badge ${f.type}">${f.type === "outdoor" ? "🏙️ Гадуур" : "🏠 Гэртээ"}</span></td>
        <td class="center"><button class="del-btn" onclick="deleteFood('${f._id}')">🗑️</button></td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Болзоо — Admin Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); min-height: 100vh; color: #e0d6f7; padding: 32px 16px; }
    h1 { text-align: center; font-size: 2rem; background: linear-gradient(90deg, #f9a8d4, #c084fc, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #a78bfa; margin-bottom: 32px; font-size: 0.9rem; }
    h2 { font-size: 1.2rem; color: #c084fc; margin-bottom: 16px; }
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
    td.num { color: #7c3aed; font-weight: 700; }
    td.center { text-align: center; }
    td.muted { color: #9ca3af; }
    td.small { font-size: 0.78rem; }
    .del-btn { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 6px 10px; cursor: pointer; color: #fca5a5; font-size: 1rem; transition: all .2s; }
    .del-btn:hover { background: rgba(239,68,68,0.35); }
    .empty { text-align: center; padding: 40px; color: #7c3aed; font-size: 1rem; }
    .btn { border: none; border-radius: 12px; padding: 10px 24px; color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: opacity .2s; }
    .btn:hover { opacity: 0.85; }
    .btn-purple { background: linear-gradient(135deg, #7c3aed, #db2777); }
    .btn-green { background: linear-gradient(135deg, #059669, #0d9488); }
    .refresh-row { display: flex; justify-content: flex-end; margin-bottom: 12px; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 12px; font-size: 0.9rem; display: none; box-shadow: 0 4px 24px rgba(124,58,237,0.5); z-index: 99; }
    .food-form { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; background: rgba(255,255,255,0.05); padding: 16px; border-radius: 14px; border: 1px solid rgba(167,139,250,0.2); }
    .food-form input, .food-form select { background: rgba(255,255,255,0.08); border: 1px solid rgba(167,139,250,0.3); border-radius: 10px; padding: 10px 14px; color: #e0d6f7; font-size: 0.9rem; outline: none; flex: 1; min-width: 120px; }
    .food-form input::placeholder { color: #7c6fad; }
    .food-form select option { background: #1a1535; }
    .badge { padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
    .badge.outdoor { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
    .badge.home { background: rgba(52,211,153,0.2); color: #34d399; border: 1px solid rgba(52,211,153,0.3); }
  </style>
</head>
<body>
  <h1>💖 Болзоо Admin Dashboard</h1>
  <p class="subtitle">Ирсэн болзооны төлөвлөгөөнүүд</p>

  <div class="stats">
    <div class="stat-card"><div class="number">${plans.length}</div><div class="label">Нийт хүсэлт</div></div>
    <div class="stat-card"><div class="number">${plans.filter(p => p.movieVenue).length}</div><div class="label">Кино үзнэ 🎬</div></div>
    <div class="stat-card"><div class="number">${foods.length}</div><div class="label">Хоолны сонголт 🍜</div></div>
    <div class="stat-card"><div class="number">${plans.length > 0 ? plans[0].date || "—" : "—"}</div><div class="label">Сүүлийн болзоо</div></div>
  </div>

  <!-- Food Management -->
  <div class="section">
    <h2>🍜 Хоолны жагсаалт удирдах</h2>
    <div class="food-form">
      <input id="f-emoji" placeholder="Emoji (🍕)" maxlength="4" style="max-width:90px" />
      <input id="f-name" placeholder="Хоолны нэр" />
      <select id="f-type">
        <option value="outdoor">🏙️ Гадуур</option>
        <option value="home">🏠 Гэртээ</option>
      </select>
      <button class="btn btn-green" onclick="addFood()">+ Нэмэх</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Emoji</th><th>Нэр</th><th>Төрөл</th><th>Устгах</th></tr></thead>
        <tbody id="food-tbody">
          ${foodRows || '<tr><td colspan="4" class="empty">Хоол нэмэгдээгүй байна</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Submissions -->
  <div class="section">
    <h2>📋 Ирсэн хүсэлтүүд</h2>
    <div class="refresh-row"><button class="btn btn-purple" onclick="location.reload()">🔄 Шинэчлэх</button></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>🌸 Нэр</th><th>📅 Огноо</th><th>⏰ Цаг</th>
            <th>�️ Хоолны газар</th><th>� Хоол</th><th>🎬 Кино газар</th>
            <th>🕐 Илгээсэн</th><th>Устгах</th>
          </tr>
        </thead>
        <tbody id="tbody">
          ${rows || '<tr><td colspan="9" class="empty">Одоогоор хүсэлт ирээгүй байна 💤</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg; t.style.display = 'block';
      setTimeout(() => t.style.display = 'none', 2500);
    }
    async function deletePlan(id) {
      if (!confirm('Энэ бичлэгийг устгах уу?')) return;
      const res = await fetch('/api/plans/' + id, { method: 'DELETE' });
      if (res.ok) { document.querySelector('[data-id="' + id + '"]').remove(); showToast('✅ Хүсэлт устгалаа!'); }
    }
    async function addFood() {
      const emoji = document.getElementById('f-emoji').value.trim() || '🍽️';
      const name = document.getElementById('f-name').value.trim();
      const type = document.getElementById('f-type').value;
      if (!name) return alert('Нэр оруулна уу');
      const res = await fetch('/api/foods', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({emoji, name, type}) });
      if (res.ok) { showToast('✅ Хоол нэмэгдлээ!'); setTimeout(() => location.reload(), 800); }
    }
    async function deleteFood(id) {
      if (!confirm('Устгах уу?')) return;
      const res = await fetch('/api/foods/' + id, { method: 'DELETE' });
      if (res.ok) { document.querySelector('[data-food-id="' + id + '"]').remove(); showToast('🗑️ Хоол устгалаа!'); }
    }
  </script>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send("Server error: " + err.message);
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Bolzoy API running", adminUrl: "/admin" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin`);
});
