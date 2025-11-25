// server/routes/user.routes.js
const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");
const multer = require("multer");

const upload = multer({ storage: multer.memoryStorage() });

const {
  updateUserProfile,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUserHard,
  generateUserQRCode,
  scanUserQRCode,
  getUserByMobile,
} = require("../controllers/user.controller");

// =====================================================
// USER PROFILE UPDATE (supports FormData + image upload)
// =====================================================
router.patch(
  "/profile",
  auth,
  upload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "shopFront", maxCount: 1 },
    { name: "shopBanner", maxCount: 1 },
  ]),
  updateUserProfile
);

// ========== ADMIN ROUTES ==========
router.get("/all", auth, getAllUsers);
router.get("/:id", auth, getUserById);
router.patch("/:id", auth, updateUser);
router.delete("/:id", auth, deleteUserHard);

// ========== QR ROUTES ==========
router.post("/generate-qr", auth, generateUserQRCode);
router.post("/scan-qr", auth, upload.single("qrImage"), scanUserQRCode);

// ========== PUBLIC MOBILE SEARCH ==========
router.get("/profile/:mobile", getUserByMobile);

module.exports = router;
