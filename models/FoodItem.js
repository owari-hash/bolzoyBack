const mongoose = require("mongoose");

const foodItemSchema = new mongoose.Schema(
  {
    tenantSlug: { type: String, required: true, index: true },
    name: { type: String, required: true },
    emoji: { type: String, default: "🍽️" },
    type: { type: String, enum: ["outdoor", "home"], required: true },
    price: { type: Number, default: 0 },
    category: { type: String, default: "General" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FoodItem", foodItemSchema);
