const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    displayName: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "tenant"], default: "tenant" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
