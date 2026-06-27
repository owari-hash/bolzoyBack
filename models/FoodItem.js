const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    emoji: { type: String, default: "🍽️" },
    type: { type: String, enum: ["outdoor", "home"], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FoodItem", foodItemSchema);
