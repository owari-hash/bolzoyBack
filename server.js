require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const DatePlan = require("./models/DatePlan");

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

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────

const timeLabels = {
  morning: "🌞 Өглөө (09:00)",
  afternoon: "☀️ Өдөр (13:00)",
  evening: "🌅 Орой (18:00)",
  night: "🌙 Шөнө (20:00)",
};

const foodLabels = {
  pizza: "🍕 Пицца",
  burger: "🍔 Бургер",
  sushi: "🍣 Суши",
  bbq: "🥩 BBQ",
  huushuur: "🍜 Хуушуур",
  dessert: "🍰 Амттан",
  coffee: "☕ Кофе",
  "bubble-tea": "🧋 Bubble Tea",
};

const musicLabels = {
  pop: "Поп",
  kpop: "KPOP",
  rock: "Рок",
  lofi: "ЛоФай",
  rap: "Реп",
};

app.get("/admin", async (req, res) => {
  try {
    const plans = await DatePlan.find().sort({ createdAt: -1 });

    const rows = plans
      .map((p, i) => {
        const foods = p.foods.map((f) => foodLabels[f] || f).join(", ") || "—";
        const time = timeLabels[p.time] || p.time || "—";
        const music = musicLabels[p.music] || p.music || "—";
        const movie = p.watchMovie ? "✅ Тийм" : "❌ Үгүй";
        const date = new Date(p.createdAt).toLocaleString("mn-MN", {
          timeZone: "Asia/Ulaanbaatar",
        });

        return `
        <tr class="row" data-id="${p._id}">
          <td class="num">${i + 1}</td>
          <td>${p.date || "—"}</td>
          <td>${time}</td>
          <td>${foods}</td>
          <td>${music}</td>
          <td class="center">${movie}</td>
          <td class="muted small">${date}</td>
          <td class="center">
            <button class="del-btn" onclick="deletePlan('${p._id}')">🗑️</button>
          </td>
        </tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="mn">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Болзоо — Admin Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      color: #e0d6f7;
      padding: 32px 16px;
    }
    h1 {
      text-align: center;
      font-size: 2rem;
      background: linear-gradient(90deg, #f9a8d4, #c084fc, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .subtitle {
      text-align: center;
      color: #a78bfa;
      margin-bottom: 32px;
      font-size: 0.9rem;
    }
    .stats {
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 32px;
    }
    .stat-card {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(167,139,250,0.3);
      border-radius: 16px;
      padding: 20px 32px;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    .stat-card .number {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(90deg, #f9a8d4, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .stat-card .label { color: #c4b5fd; font-size: 0.85rem; margin-top: 4px; }
    .table-wrap {
      overflow-x: auto;
      border-radius: 16px;
      border: 1px solid rgba(167,139,250,0.2);
      backdrop-filter: blur(10px);
    }
    table { width: 100%; border-collapse: collapse; }
    thead tr {
      background: rgba(167,139,250,0.15);
    }
    th {
      padding: 14px 16px;
      font-size: 0.78rem;
      letter-spacing: .05em;
      text-transform: uppercase;
      color: #c084fc;
      text-align: left;
      white-space: nowrap;
    }
    tbody tr {
      border-top: 1px solid rgba(167,139,250,0.1);
      transition: background .15s;
    }
    tbody tr:hover { background: rgba(255,255,255,0.04); }
    td {
      padding: 14px 16px;
      font-size: 0.88rem;
      vertical-align: middle;
    }
    td.num { color: #7c3aed; font-weight: 700; }
    td.center { text-align: center; }
    td.muted { color: #9ca3af; }
    td.small { font-size: 0.78rem; }
    .del-btn {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      color: #fca5a5;
      font-size: 1rem;
      transition: all .2s;
    }
    .del-btn:hover { background: rgba(239,68,68,0.35); }
    .empty {
      text-align: center;
      padding: 60px;
      color: #7c3aed;
      font-size: 1.1rem;
    }
    .refresh-btn {
      display: block;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #7c3aed, #db2777);
      border: none;
      border-radius: 12px;
      padding: 12px 32px;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .2s;
    }
    .refresh-btn:hover { opacity: 0.85; }
    .toast {
      position: fixed; bottom: 24px; right: 24px;
      background: #7c3aed; color: white;
      padding: 12px 24px; border-radius: 12px;
      font-size: 0.9rem; display: none;
      box-shadow: 0 4px 24px rgba(124,58,237,0.5);
    }
  </style>
</head>
<body>
  <h1>💖 Болзоо Admin Dashboard</h1>
  <p class="subtitle">Ирсэн болзооны төлөвлөгөөнүүд</p>

  <div class="stats">
    <div class="stat-card">
      <div class="number">${plans.length}</div>
      <div class="label">Нийт хүсэлт</div>
    </div>
    <div class="stat-card">
      <div class="number">${plans.filter((p) => p.watchMovie).length}</div>
      <div class="label">Кино үзнэ 🎬</div>
    </div>
    <div class="stat-card">
      <div class="number">${plans.length > 0 ? plans[0].date || "—" : "—"}</div>
      <div class="label">Сүүлийн болзоо</div>
    </div>
  </div>

  <button class="refresh-btn" onclick="location.reload()">🔄 Шинэчлэх</button>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>📅 Огноо</th>
          <th>⏰ Цаг</th>
          <th>🍜 Хоол</th>
          <th>🎵 Хөгжим</th>
          <th>🎬 Кино</th>
          <th>🕐 Илгээсэн</th>
          <th>Устгах</th>
        </tr>
      </thead>
      <tbody id="tbody">
        ${rows || '<tr><td colspan="8" class="empty">Одоогоор хүсэлт ирээгүй байна 💤</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="toast" id="toast">✅ Амжилттай устгалаа!</div>

  <script>
    async function deletePlan(id) {
      if (!confirm('Энэ бичлэгийг устгах уу?')) return;
      const res = await fetch('/api/plans/' + id, { method: 'DELETE' });
      if (res.ok) {
        document.querySelector('[data-id="' + id + '"]').remove();
        const toast = document.getElementById('toast');
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 2500);
      }
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
