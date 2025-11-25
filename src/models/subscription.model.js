const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // e.g. "2025-11" (YYYY-MM)
    monthKey: {
      type: String,
      required: true,
    },

    subscriptionAmount: {
      type: Number,
      required: true,
      default: 0,
    },

    // optional – missing meeting amount (if member didn’t attend)
    meetingAmount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["PAID", "FAILED"],
      default: "PAID",
    },

    paidDate: {
      type: Date,
      default: Date.now,
    },

    // optional: who created it (admin)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // optional: file upload (receipt, etc.)
    attachmentUrl: {
      type: String,
      default: "",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Ensures only one subscription record per member+month
SubscriptionSchema.index({ member: 1, monthKey: 1 }, { unique: true });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
