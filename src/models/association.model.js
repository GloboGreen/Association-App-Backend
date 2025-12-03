const mongoose = require("mongoose");

const associationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // Cloudinary URL for logo
    logo: { type: String, default: "" },

    district: { type: String, required: true, trim: true },
    area: { type: String, required: true, trim: true },

    address: {
      street: { type: String, default: "" },
      area: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Association = mongoose.model("Association", associationSchema);
module.exports = Association;
