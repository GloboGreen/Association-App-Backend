// server/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const { auth } = require("../middleware/auth");

const {
  register,
  login,
  sendVerifyEmailOtp,
  verifyEmailWithOtp,
  sendLoginOtp,
  loginWithOtp,
  googleLogin,
  logout,
  currentUser,
  changePassword,
} = require("../controllers/auth.controller");

/* ----- AUTH ----- */
router.post("/register", register);
router.post("/login", login);
router.post("/send-verify-email-otp", sendVerifyEmailOtp);
router.post("/verify-email-otp", verifyEmailWithOtp);

router.post("/send-login-otp", sendLoginOtp);
router.post("/login-otp", loginWithOtp);

router.post("/google-login", googleLogin);

router.get("/current-user", auth, currentUser);
router.post("/logout", auth, logout);
router.post("/change-password", auth, changePassword);

module.exports = router;
