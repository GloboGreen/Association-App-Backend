const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email:    { type: String, required: true, index: true },
  code:     { type: String, required: true },
  purpose:  { type: String, enum: ["verify_email", "login"], required: true },
  isUsed:   { type: Boolean, default: false },
  expiresAt:{ type: Date, required: true }
}, { timestamps: true });

otpSchema.index({ email: 1, purpose: 1, isUsed: 1, expiresAt: 1 });

module.exports = mongoose.model("Otp", otpSchema);
