/*****************************************************
 * AUTH CONTROLLER (Login, Signup, OTP, Google, Tokens)
 *****************************************************/

const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const Employee = require("../models/employee.model"); // 👈 needed for employeeLogin
const { computeProfilePercent } = require("../utils/profileScore");

const {
  generateTokens,
  setAuthCookies,
  clearAuthCookies,
} = require("../utils/generateTokens");

const {
  sendMail,
  verifyEmailOtpTemplate,
  loginOtpTemplate,
} = require("../utils/sendMail");

const { generateUserQr } = require("../utils/generateOwnerQr");

const OTP_EXP_MINUTES = 10;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------- Helper: OTP Create ---------- */
const createOtp = async ({ email, code, purpose }) => {
  const expiresAt = new Date(Date.now() + OTP_EXP_MINUTES * 60 * 1000);

  await Otp.updateMany(
    { email, purpose, isUsed: false, expiresAt: { $gt: new Date() } },
    { $set: { isUsed: true } }
  );

  await Otp.create({ email, code, purpose, expiresAt });
};

/* ---------- Helper: Google Admin Whitelist ---------- */
const markAdminIfWhitelisted = (user) => {
  const g1 = process.env.GOOGLE_EMAIL_ID_1;
  const g2 = process.env.GOOGLE_EMAIL_ID_2;

  if (user.provider === "google" && (user.email === g1 || user.email === g2)) {
    user.role = "ADMIN";
  }
};

/* =====================================================
   REGISTER (EMAIL + PASSWORD)
===================================================== */
const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      mobile,
      BusinessType,
      BusinessCategory,
      associationId,
      shopName,
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email & password required",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email,
      password: hash,
      mobile,
      provider: "local",
      BusinessType,
      BusinessCategory,
      association: associationId || null,
      shopName,
    });

    let otpError = null;

    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await createOtp({ email, code, purpose: "verify_email" });

      await sendMail({
        to: email,
        subject: "Verify your email",
        html: verifyEmailOtpTemplate(code),
      });
    } catch (err) {
      console.error("❌ OTP / Email error in register:", err);
      otpError = err;
    }

    return res.json({
      success: true,
      message: otpError
        ? "Registered successfully, but failed to send OTP email. Please contact admin."
        : "Registered successfully. OTP sent to email.",
    });
  } catch (err) {
    console.error("❌ Register error:", err);

    let message = "Register failed";

    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      message = "Email already registered";
    }
    if (
      err.code === 11000 &&
      err.keyPattern &&
      err.keyPattern.RegistrationNumber
    ) {
      message = "Registration number already exists. Please try again.";
    }

    return res.status(500).json({
      success: false,
      message,
      error: err.message,
    });
  }
};

/* =====================================================
   LOGIN (PASSWORD)
===================================================== */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    if (!user.password)
      return res.status(400).json({
        success: false,
        message: "This account uses Google login. Use Google login.",
      });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });

    const { accessToken, refreshToken } = generateTokens(user);

    user.refresh_token = refreshToken;
    user.last_login_date = new Date();

    if (!user.qrCodeUrl) {
      const qr = await generateUserQr(user);
      user.qrCodeUrl = qr;
    }

    const profilePercent = computeProfilePercent(user);
user.profilePercent = profilePercent;
user.shopCompleted = profilePercent === 100;

    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        avatar: user.avatar,
        qrCodeUrl: user.qrCodeUrl,
        isProfileVerified: user.isProfileVerified || false,
        profilePercent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* =====================================================
   SEND VERIFY EMAIL OTP
===================================================== */
const sendVerifyEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const exists = await User.findOne({ email });
    if (!exists)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await createOtp({ email, code, purpose: "verify_email" });

    await sendMail({
      to: email,
      subject: "Verify your email",
      html: verifyEmailOtpTemplate(code),
    });

    res.json({ success: true, message: "Verification OTP sent" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   VERIFY EMAIL OTP
===================================================== */
const verifyEmailWithOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    const otp = await Otp.findOne({
      email,
      code,
      purpose: "verify_email",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp)
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });

    await Otp.updateOne({ _id: otp._id }, { isUsed: true });

    const user = await User.findOneAndUpdate(
      { email },
      { verify_email: true },
      { new: true }
    );

    res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        verify_email: true,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   SEND LOGIN OTP
===================================================== */
const sendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const exists = await User.findOne({ email });
    if (!exists)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await createOtp({ email, code, purpose: "login" });

    await sendMail({
      to: email,
      subject: "Login OTP",
      html: loginOtpTemplate(code),
    });

    res.json({ success: true, message: "Login OTP sent" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   LOGIN WITH OTP
===================================================== */
const loginWithOtp = async (req, res) => {
  try {
    const { email, code } = req.body;

    const otp = await Otp.findOne({
      email,
      code,
      purpose: "login",
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otp)
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });

    await Otp.updateOne({ _id: otp._id }, { isUsed: true });

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name: email.split("@")[0],
        email,
        provider: "local",
        verify_email: true,
      });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    user.refresh_token = refreshToken;
    user.last_login_date = new Date();
    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   GOOGLE LOGIN
===================================================== */
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const info = ticket.getPayload();

    const email = info.email;
    const name = info.name || email.split("@")[0];
    const picture = info.picture;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        avatar: picture,
        provider: "google",
        verify_email: true,
      });
    } else {
      user.provider = "google";
      user.verify_email = true;
      if (!user.avatar) user.avatar = picture;
    }

    markAdminIfWhitelisted(user);

    const { accessToken, refreshToken } = generateTokens(user);
    user.refresh_token = refreshToken;
    user.last_login_date = new Date();
    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: "Google login failed",
      error: err.message,
    });
  }
};

/* =====================================================
   CURRENT USER
===================================================== */
const currentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("association", "name district area logo isActive"); // ⭐ add this

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const profilePercent = computeProfilePercent(user);
    user.profilePercent = profilePercent;
    user.shopCompleted = profilePercent === 100;
    await user.save();

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        profilePercent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


/* =====================================================
   LOGOUT
===================================================== */
const logout = async (req, res) => {
  try {
    if (req.user?._id) {
      await User.updateOne({ _id: req.user._id }, { refresh_token: "" });
    }

    clearAuthCookies(res);

    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   CHANGE PASSWORD
===================================================== */
const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    const { currentPassword, newPassword } = req.body;

    if (user.provider === "google")
      return res.status(400).json({
        success: false,
        message: "Google accounts cannot change password",
      });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return res.status(400).json({
        success: false,
        message: "Current password incorrect",
      });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   EMPLOYEE LOGIN (MOBILE + PIN)
===================================================== */
const employeeLogin = async (req, res) => {
  try {
    const { mobile, pin } = req.body;

    if (!mobile || !pin) {
      return res.status(400).json({
        success: false,
        message: "Mobile and PIN are required",
      });
    }

    const employee = await Employee.findOne({ mobile }).populate("owner");
    if (!employee) {
      return res
        .status(400)
        .json({ success: false, message: "Employee not found" });
    }

    const user = await User.findOne({
      mobile,
      role: "EMPLOYEE",
      isEmployeeActive: true,
      status: "Active",
    }).select("+employeePin");

    if (!user || !user.employeePin) {
      return res.status(401).json({
        success: false,
        message: "Invalid mobile or PIN",
      });
    }

    const match = await bcrypt.compare(String(pin), user.employeePin);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid mobile or PIN",
      });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    user.refresh_token = refreshToken;
    user.last_login_date = new Date();
    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({
      success: true,
      message: "Employee login successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        shopName: user.shopName,
      },
    });
  } catch (err) {
    console.error("employeeLogin error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
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
  employeeLogin,
};
