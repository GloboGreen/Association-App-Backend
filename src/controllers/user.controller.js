// server/controllers/user.controller.js
const Jimp = require("jimp");
const QrCodeReader = require("qrcode-reader");
const QRCode = require("qrcode");
const cloudinary = require("../config/cloudinary");
const User = require("../models/user.model");
const { computeProfilePercent } = require("../utils/profileScore");

// ✅ Upload buffer to Cloudinary
const uploadBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });

/* ✅ Helper: shopCompleted only by shop fields (NOT full profilePercent) */
const hasCompletedShop = (u) => {
  if (!u) return false;

  const sa = u.shopAddress || {};
  const loc = u.shopLocation || {};

  const hasAddress =
    !!sa.street &&
    !!sa.city &&
    !!sa.district &&
    !!sa.state &&
    !!sa.pincode;

  const hasLocation =
    loc &&
    Array.isArray(loc.coordinates) &&
    loc.coordinates.length === 2 &&
    typeof loc.coordinates[0] === "number" &&
    typeof loc.coordinates[1] === "number";

  return (
    !!u.shopName &&
    !!u.BusinessType &&
    !!u.BusinessCategory &&
    hasAddress &&
    hasLocation
  );
};

/* =====================================================
   UPDATE USER PROFILE (User Side)
===================================================== */
const updateUserProfile = async (req, res) => {
  try {
    const uid = req.user?._id;
    if (!uid) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized" });
    }

    const body = req.body;
    const updates = {};

    /* ----------------------------
        NORMAL TEXT FIELDS
       (User-side editable only)
    ---------------------------- */
    [
      "name",
      "mobile",
      "whatsappNumber",
      "BusinessType",
      "BusinessCategory",
      "shopName",
      "status", // if you don't want user to change status, remove this
    ].forEach((key) => {
      if (body[key] !== undefined) updates[key] = body[key];
    });

    /* ----------------------------
        ADDRESS (basic)
    ---------------------------- */
    if (body.address) {
      try {
        const parsed =
          typeof body.address === "string"
            ? JSON.parse(body.address)
            : body.address;

        if (parsed && typeof parsed === "object") {
          updates.address = parsed;
          updates.addressUpdatedAt = new Date();
        }
      } catch (err) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid address data" });
      }
    }

    /* ----------------------------
        SHOP ADDRESS
    ---------------------------- */
    if (body.shopAddress) {
      try {
        const parsed =
          typeof body.shopAddress === "string"
            ? JSON.parse(body.shopAddress)
            : body.shopAddress;

        if (parsed && typeof parsed === "object") {
          updates.shopAddress = parsed;
        }
      } catch (err) {
        console.log("Invalid shopAddress:", err.message);
      }
    }

    /* ----------------------------
        SHOP LOCATION (GeoPoint)
        Expect: { type: "Point", coordinates: [lng, lat] }
    ---------------------------- */
    if (body.shopLocation) {
      try
      {
        const parsed =
          typeof body.shopLocation === "string"
            ? JSON.parse(body.shopLocation)
            : body.shopLocation;

        if (
          parsed &&
          Array.isArray(parsed.coordinates) &&
          parsed.coordinates.length === 2
        ) {
          const [lng, lat] = parsed.coordinates.map(Number);

          // Ignore 0,0
          if (!(lng === 0 && lat === 0)) {
            updates.shopLocation = {
              type: "Point",
              coordinates: [lng, lat],
            };
          }
        }
      } catch (err) {
        console.log("Invalid shopLocation:", err.message);
      }
    }

    /* ----------------------------
        PHOTO UPLOADS
    ---------------------------- */
    if (req.files?.avatar?.[0]) {
      const r = await uploadBuffer(req.files.avatar[0].buffer, "users/avatar");
      updates.avatar = r.secure_url;
    }

    if (req.files?.shopFront?.[0]) {
      const r = await uploadBuffer(
        req.files.shopFront[0].buffer,
        "users/shopFront"
      );
      updates.shopFront = r.secure_url;
    }

    if (req.files?.shopBanner?.[0]) {
      const r = await uploadBuffer(
        req.files.shopBanner[0].buffer,
        "users/shopBanner"
      );
      updates.shopBanner = r.secure_url;
    }

    // Remove undefined keys
    Object.keys(updates).forEach((k) => {
      if (updates[k] === undefined) delete updates[k];
    });

    // 🔁 load user → apply updates → recompute profile + shopCompleted
    const user = await User.findById(uid);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    Object.assign(user, updates);

    // 🔢 recompute profilePercent & shopCompleted using helper
    try {
      const profilePercent = computeProfilePercent(user);
      user.profilePercent = profilePercent;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (updateUserProfile):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.shopCompleted = user.shopCompleted || false;
    }

    const updated = await user.save();

    return res.json({
      success: true,
      user: updated,
    });
  } catch (err) {
    console.error("updateUserProfile error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   ADMIN + QR + PUBLIC CONTROLLERS
===================================================== */

const getAllUsers = async (req, res) => {
  try {
    const filter = {};

    // type=shop → only members with shopName
    if (req.query.type === "shop") filter.shopName = { $ne: "" };

    // type=user → only members without shopName
    if (req.query.type === "user") filter.shopName = { $in: ["", null] };

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .select("-password -refresh_token"); // don't leak sensitive fields

    return res.json({ success: true, data: users });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select(
      "-password -refresh_token"
    );
    if (!u) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: u });
  } catch (err) {
    console.error("getUserById error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    // Admin-side allowed fields
    const allowed = [
      "name",
      "mobile",
      "status",
      "role",
      "verify_email",
      "BusinessType",
      "BusinessCategory",
      "RegistrationNumber",
      "isProfileVerified",
      "shopName",
    ];

    const updates = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const u = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!u) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user: u });
  } catch (err) {
    console.error("updateUser error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const deleteUserHard = async (req, res) => {
  try {
    const u = await User.findByIdAndDelete(req.params.id);
    if (!u) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("deleteUserHard error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const generateUserQRCode = async (req, res) => {
  try {
    const me = await User.findById(req.user._id);
    if (!me) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const payload = JSON.stringify({
      t: "USER_CONTACT",
      name: me.name,
      mobile: me.mobile,
      userId: me._id.toString(),
    });

    const qr = await QRCode.toDataURL(payload);

    return res.json({ success: true, qr, payload: JSON.parse(payload) });
  } catch (err) {
    console.error("generateUserQRCode error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const scanUserQRCode = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res
        .status(400)
        .json({ success: false, message: "Image required" });
    }

    const image = await Jimp.read(req.file.buffer);
    const qr = new QrCodeReader();

    const result = await new Promise((resolve, reject) => {
      qr.callback = (err, value) => (err ? reject(err) : resolve(value));
      qr.decode(image.bitmap);
    });

    let parsed;
    try {
      parsed = JSON.parse(result.result);
    } catch {
      parsed = { mobile: String(result.result) };
    }

    let user = null;
    if (parsed.mobile) user = await User.findOne({ mobile: parsed.mobile });
    if (!user && parsed.userId) user = await User.findById(parsed.userId);

    return res.json({
      success: true,
      parsed,
      user,
    });
  } catch (err) {
    console.error("scanUserQRCode error:", err);
    return res
      .status(400)
      .json({ success: false, message: "QR scan failed", error: err.message });
  }
};

const getUserByMobile = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error("getUserByMobile error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  updateUserProfile,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUserHard,
  generateUserQRCode,
  scanUserQRCode,
  getUserByMobile,
};
