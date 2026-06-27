const mongoose = require("mongoose");

const datePlanSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    date: { type: String, default: null },
    time: { type: String, default: null },
    foods: { type: [String], default: [] },
    music: { type: String, default: null },
    watchMovie: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DatePlan", datePlanSchema);
