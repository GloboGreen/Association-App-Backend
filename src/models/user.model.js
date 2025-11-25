// server/models/user.model.js
const mongoose = require("mongoose");

/**
 * Generate unique Registration Number
 * Format: TNMA-YYYY-XXXXXX  (e.g. TNMA-2025-123456)
 */
async function generateUniqueRegistrationNumber() {
  const year = new Date().getFullYear();

  let regNo;
  let exists;

  do {
    const randomPart = Math.floor(100000 + Math.random() * 900000); // 6 digits
    regNo = `TNMA-${year}-${randomPart}`;

    const UserModel = mongoose.model("User");
    exists = await UserModel.findOne({ RegistrationNumber: regNo }).lean();
  } while (exists);

  return regNo;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 2,
      maxlength: 250,
    },

    password: {
      type: String,
      select: false,
      default: "",
      required: function () {
        // ✅ EMPLOYEE uses mobile + PIN only → password NOT required
        if (this.role === "EMPLOYEE") {
          return false;
        }
        // ✅ OWNER / ADMIN: password required for local provider
        return !this.provider || this.provider === "local";
      },
    },

    mobile: { type: String, default: "", trim: true },
    whatsappNumber: { type: String, default: "" },

    avatar: { type: String, default: "" },
    refresh_token: { type: String, default: "" },
    verify_email: { type: Boolean, default: false },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    association: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Association",
      default: null,
    },

    address: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      district: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    // ---- shop basics ----
    shopName: { type: String, default: "" },

    shopAddress: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      district: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    shopFront: { type: String, default: "" },
    shopBanner: { type: String, default: "" },

    // ✅ GeoJSON point – NO defaults, so Mongo doesn’t get invalid Point
    shopLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },

    BusinessType: {
      type: String,
      enum: ["RETAIL", "WHOLESALE"],
      default: "RETAIL",
    },

    BusinessCategory: { type: String, default: "" },

    RegistrationNumber: {
      type: String,
      default: "",
      unique: true,
      sparse: true,
    },

    qrCodeUrl: {
      type: String,
      default: "",
    },

    last_login_date: { type: Date },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    // 🔑 roles
    role: {
      type: String,
      enum: ["OWNER", "ADMIN", "EMPLOYEE"],
      default: "OWNER",
    },

    // 🔐 for employees: PIN login (hashed)
    employeePin: {
      type: String,
      select: false,
      default: "",
    },

    // 👥 which OWNER this employee belongs to
    parentOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isEmployeeActive: {
      type: Boolean,
      default: true,
    },

    // ---- profile status ----
    profilePercent: { type: Number, default: 0 }, // 0–100
    isProfileVerified: { type: Boolean, default: false }, // ✅ admin verification
    shopCompleted: { type: Boolean, default: false },

    last_otp_verified_at: { type: Date },
    addressUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

// 2dsphere index for shopLocation
userSchema.index({ shopLocation: "2dsphere" });

/**
 * Pre-save: generate RegistrationNumber on new docs
 */
userSchema.pre("save", async function (next) {
  try {
    if (!this.isNew) return next();

    if (this.RegistrationNumber && this.RegistrationNumber.trim() !== "") {
      return next();
    }

    const regNo = await generateUniqueRegistrationNumber();
    this.RegistrationNumber = regNo;

    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Pre-save: ensure shopLocation is valid GeoJSON or removed
 * Prevents: "Point must be an array or object" geo error
 */
userSchema.pre("save", function (next) {
  if (
    this.shopLocation &&
    (
      !Array.isArray(this.shopLocation.coordinates) ||
      this.shopLocation.coordinates.length !== 2
    )
  ) {
    this.shopLocation = undefined;
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
