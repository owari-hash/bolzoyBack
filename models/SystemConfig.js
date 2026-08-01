const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    terminalId: { type: String, default: "95000059" },
    merchantId: { type: String, default: "05646a89-8641-4853-812e-7d36676b18e9" },
    bankCode: { type: String, default: "050000" },
    accountNumber: { type: String, default: "5039842709" },
    accountName: { type: String, default: "Отгонбилэг" },
    planAmount: { type: Number, default: 100 },
    mccCode: { type: String, default: "5812" },
    qpayUsername: { type: String, default: "" },
    qpayPassword: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SystemConfig", systemConfigSchema);
