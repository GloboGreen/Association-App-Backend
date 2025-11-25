// server/controllers/user.controller.js
const Jimp = require("jimp");
const QrCodeReader = require("qrcode-reader");
const QRCode = require("qrcode");
const cloudinary = require("../config/cloudinary");
const User = require("../models/user.model");

// Upload buffer to Cloudinary
const uploadBuffer = (buffer, folder) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, res) => (err ? reject(err) : resolve(res))
    );
    stream.end(buffer);
  });

/* =====================================================
   UPDATE USER PROFILE (User Side)
===================================================== */
const updateUserProfile = async (req, res) => {
  try {
    const uid = req.user?._id;
    if (!uid)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const body = req.body;
    const updates = {};

    /* ----------------------------
        NORMAL TEXT FIELDS
    ---------------------------- */
    [
      "name",
      "mobile",
      "whatsappNumber",
      "BusinessType",
      "BusinessCategory",
      "RegistrationNumber",
      "shopName",
      "status",
    ].forEach((key) => {
      if (body[key] !== undefined) updates[key] = body[key];
    });

    /* ----------------------------
        ADDRESS (7-day lock)
    ---------------------------- */
    if (body.address) {
      try {
        const parsed = JSON.parse(body.address);
        if (typeof parsed === "object") {
          updates.address = parsed;
          updates.addressUpdatedAt = new Date(); // important
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
        updates.shopAddress = JSON.parse(body.shopAddress);
      } catch (err) {
        console.log("Invalid shopAddress:", err.message);
      }
    }

    /* ----------------------------
        SHOP LOCATION (GeoPoint)
        Must be { coordinates:[lng,lat] }
    ---------------------------- */
    if (body.shopLocation) {
      try {
        const parsed = JSON.parse(body.shopLocation);

        if (
          parsed &&
          Array.isArray(parsed.coordinates) &&
          parsed.coordinates.length === 2
        ) {
          const [lng, lat] = parsed.coordinates.map(Number);

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

    // remove undefined
    Object.keys(updates).forEach(
      (k) => updates[k] === undefined && delete updates[k]
    );

    const updated = await User.findByIdAndUpdate(
      uid,
      { $set: updates },
      { new: true }
    );

    return res.json({ success: true, user: updated });
  } catch (err) {
    console.error("updateUserProfile error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   ADMIN + QR + PUBLIC CONTROLLERS
===================================================== */

const getAllUsers = async (req, res) => {
  try {
    const filter = {};

    if (req.query.type === "shop") filter.shopName = { $ne: "" };
    if (req.query.type === "user") filter.shopName = { $in: ["", null] };

    const users = await User.find(filter).sort({ createdAt: -1 });

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const u = await User.findById(req.params.id);
    if (!u)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, user: u });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
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

    if (!u)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, user: u });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const deleteUserHard = async (req, res) => {
  try {
    const u = await User.findByIdAndDelete(req.params.id);
    if (!u)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const generateUserQRCode = async (req, res) => {
  try {
    const me = await User.findById(req.user._id);

    const payload = JSON.stringify({
      t: "USER_CONTACT",
      name: me.name,
      mobile: me.mobile,
      userId: me._id.toString(),
    });

    const qr = await QRCode.toDataURL(payload);

    res.json({ success: true, qr, payload: JSON.parse(payload) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const scanUserQRCode = async (req, res) => {
  try {
    if (!req.file?.buffer)
      return res
        .status(400)
        .json({ success: false, message: "Image required" });

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

    res.json({
      success: true,
      parsed,
      user,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: "QR scan failed" });
  }
};

const getUserByMobile = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });

    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
