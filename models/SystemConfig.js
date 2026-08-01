const mongoose = require("mongoose");

const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    terminalId: { type: String, default: "95000059" },
    merchantId: { type: String, default: "465d3e33-4f95-461a-ac1b-c24ab095af0a" },
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
