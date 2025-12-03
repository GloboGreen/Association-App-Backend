/*****************************************************
 * AUTH CONTROLLER (Login, Signup, OTP, Google, Tokens)
 *****************************************************/

const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/user.model");
const Otp = require("../models/otp.model");
const Employee = require("../models/employee.model");
const { computeProfilePercent } = require("../utils/profileScore");

const {
  generateTokens,
  setAuthCookies,
  clearAuthCookies,
  generateTokensFromPayload,
} = require("../utils/generateTokens");

const {
  sendMail,
  verifyEmailOtpTemplate,
  loginOtpTemplate,
} = require("../utils/sendMail");

const { generateUserQr } = require("../utils/generateOwnerQr");

const OTP_EXP_MINUTES = 10;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------- Helper: Shop Completed Check (only shop fields) ---------- */
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
 *  MERGED LOGIN
 *  - Member login:   email + password
 *  - Employee login: mobile + pin
 * ==================================================== */
const login = async (req, res) => {
  try {
    const { email, password, mobile, pin } = req.body;

    /* -----------------------------------------
     * BRANCH 1: MEMBER LOGIN (email + password)
     * ----------------------------------------- */
    if (email && password) {
      console.log("🔐 MEMBER LOGIN start:", email);

      const user = await User.findOne({ email }).select("+password");
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      if (!user.password) {
        return res.status(400).json({
          success: false,
          message: "This account uses Google login. Use Google login.",
        });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password",
        });
      }

      const { accessToken, refreshToken } = generateTokens(user);

      user.refresh_token = refreshToken;
      user.last_login_date = new Date();

      // generate QR if missing
      if (!user.qrCodeUrl) {
        try {
          const qr = await generateUserQr(user);
          user.qrCodeUrl = qr;
        } catch (qrErr) {
          console.error("⚠️ QR generate error (member login):", qrErr.message);
        }
      }

      try {
        const profilePercent = computeProfilePercent(user);
        user.profilePercent = profilePercent;
        user.shopCompleted = hasCompletedShop(user);
      } catch (ppErr) {
        console.error("⚠️ profilePercent error (member login):", ppErr.message);
        user.profilePercent = user.profilePercent || 0;
        user.shopCompleted = user.shopCompleted || false;
      }

      await user.save();

      setAuthCookies(res, { accessToken, refreshToken });

      console.log("✅ MEMBER LOGIN success:", user._id.toString());

      return res.json({
        success: true,
        message: "Login successful",
        loginType: "MEMBER",
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          avatar: user.avatar || "",
          qrCodeUrl: user.qrCodeUrl || "",
          isProfileVerified: user.isProfileVerified || false,
          profilePercent: user.profilePercent || 0,
          shopCompleted: !!user.shopCompleted,
          BusinessType: user.BusinessType || "",
          BusinessCategory: user.BusinessCategory || "",
          shopName: user.shopName || "",
          shopAddress: user.shopAddress || null,
          shopFront: user.shopFront || "",
          shopBanner: user.shopBanner || "",
          shopLocation: user.shopLocation || null,
          address: user.address || null,
          RegistrationNumber: user.RegistrationNumber || "",
          association: user.association || null,
        },
      });
    }

    /* ------------------------------------------
     * BRANCH 2: EMPLOYEE LOGIN (mobile + pin)
     * ------------------------------------------ */
    if (mobile && pin) {
      console.log("🔐 EMPLOYEE LOGIN start:", mobile);

      if (!mobile || !pin) {
        return res.status(400).json({
          success: false,
          message: "Mobile and PIN are required",
        });
      }

      const employee = await Employee.findOne({
        mobile,
        status: "Active",
      })
        .select("+pinHash")
        .populate("owner");

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found or inactive",
        });
      }

      const match = await bcrypt.compare(String(pin), employee.pinHash);
      if (!match) {
        return res.status(401).json({
          success: false,
          message: "Invalid mobile or PIN",
        });
      }

      const owner = employee.owner;
      const ownerIsProfileVerified = !!owner?.isProfileVerified;

      const payload = {
        sub: employee._id.toString(),
        role: employee.role,
        provider: "local",
        subjectType: "EMPLOYEE",
      };

      const { accessToken, refreshToken } = generateTokensFromPayload(payload);

      employee.refreshToken = refreshToken;
      await employee.save();

      setAuthCookies(res, { accessToken, refreshToken });

      console.log("✅ EMPLOYEE LOGIN success:", employee._id.toString());

      return res.json({
        success: true,
        message: "Employee login successful",
        loginType: "EMPLOYEE",
        accessToken,
        employee: {
          id: employee._id,
          name: employee.name,
          mobile: employee.mobile,
          role: employee.role,
          avatar: employee.avatar,
          shopName: employee.shopName,
          shopAddress: employee.shopAddress,
          qrCodeUrl: employee.qrCodeUrl,
          status: employee.status,
          ownerId: owner?._id || null,
          ownerName: owner?.name || "",
          ownerIsProfileVerified,
          profilePercent: 0,
          shopCompleted: true,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message:
        "Provide either (email + password) for member login or (mobile + pin) for employee login.",
    });
  } catch (err) {
    console.error("❌ Login error (merged):", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message,
    });
  }
};

/* =====================================================
   SEND VERIFY EMAIL OTP
===================================================== */
const sendVerifyEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const exists = await User.findOne({ email });
    if (!exists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await createOtp({ email, code, purpose: "verify_email" });

    await sendMail({
      to: email,
      subject: "Verify your email",
      html: verifyEmailOtpTemplate(code),
    });

    return res.json({ success: true, message: "Verification OTP sent" });
  } catch (err) {
    console.error("sendVerifyEmailOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
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

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    await Otp.updateOne({ _id: otp._id }, { isUsed: true });

    const user = await User.findOneAndUpdate(
      { email },
      { verify_email: true },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        verify_email: true,
      },
    });
  } catch (err) {
    console.error("verifyEmailWithOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   SEND LOGIN OTP
===================================================== */
const sendLoginOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const exists = await User.findOne({ email });
    if (!exists) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    await createOtp({ email, code, purpose: "login" });

    await sendMail({
      to: email,
      subject: "Login OTP",
      html: loginOtpTemplate(code),
    });

    return res.json({ success: true, message: "Login OTP sent" });
  } catch (err) {
    console.error("sendLoginOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
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

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

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

    try {
      const profilePercent = computeProfilePercent(user);
      user.profilePercent = profilePercent;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (loginWithOtp):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.shopCompleted = user.shopCompleted || false;
    }

    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePercent: user.profilePercent || 0,
        shopCompleted: !!user.shopCompleted,
      },
    });
  } catch (err) {
    console.error("loginWithOtp error:", err);
    return res.status(500).json({ success: false, error: err.message });
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

    try {
      const profilePercent = computeProfilePercent(user);
      user.profilePercent = profilePercent;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (googleLogin):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.shopCompleted = user.shopCompleted || false;
    }

    await user.save();

    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        profilePercent: user.profilePercent || 0,
        shopCompleted: !!user.shopCompleted,
      },
    });
  } catch (err) {
    console.error("googleLogin error:", err);
    return res.status(401).json({
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
    const user = await User.findById(req.user._id).populate(
      "association",
      "name district area logo isActive"
    );

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    try {
      const profilePercent = computeProfilePercent(user);
      user.profilePercent = profilePercent;
      user.shopCompleted = hasCompletedShop(user);
    } catch (ppErr) {
      console.error("profilePercent error (currentUser):", ppErr.message);
      user.profilePercent = user.profilePercent || 0;
      user.shopCompleted = user.shopCompleted || false;
    }

    const updated = await user.save();
    const obj = updated.toObject();

    return res.json({
      success: true,
      user: {
        ...obj,
        profilePercent: updated.profilePercent || 0,
        shopCompleted: !!updated.shopCompleted,
      },
    });
  } catch (err) {
    console.error("currentUser error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   LOGOUT
===================================================== */
const logout = async (req, res) => {
  try {
    // 🔹 clear refresh token depending on role
    if (req.user?.role === "EMPLOYEE") {
      await Employee.updateOne(
        { _id: req.user._id },
        { refreshToken: "" }
      );
    } else if (req.user?._id) {
      await User.updateOne({ _id: req.user._id }, { refresh_token: "" });
    }

    clearAuthCookies(res);

    return res.json({ success: true, message: "Logged out" });
  } catch (err) {
    console.error("logout error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* =====================================================
   CHANGE PASSWORD
===================================================== */
const changePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+password");
    const { currentPassword, newPassword } = req.body;

    if (user.provider === "google") {
      return res.status(400).json({
        success: false,
        message: "Google accounts cannot change password",
      });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: "Current password incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({ success: false, error: err.message });
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
};
