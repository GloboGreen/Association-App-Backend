// server/models/employee.model.js
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    mobile: { type: String, required: true, trim: true },

    avatar: { type: String, default: "" },

    shopName: { type: String, required: true },

    shopAddress: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      district: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    // 4–6 digit PIN hash (used for login)
    pinHash: { type: String, required: true, select: false },

    qrCodeUrl: { type: String, default: "" },

    // ✅ lowercase "owner" (this is what we populate)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    role: {
      type: String,
      enum: ["EMPLOYEE"],
      default: "EMPLOYEE",
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    refreshToken: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
