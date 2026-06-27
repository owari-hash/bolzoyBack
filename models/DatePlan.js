const mongoose = require("mongoose");

const datePlanSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    date: { type: String, default: null },
    time: { type: String, default: null },
    foodVenue: { type: String, enum: ["outdoor", "home"], default: null },
    foods: { type: [String], default: [] },
    movieVenue: { type: String, enum: ["outdoor", "home"], default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DatePlan", datePlanSchema);
