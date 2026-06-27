const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "tenant"], default: "tenant" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
