// server/utils/generateTokens.js
const jwt = require("jsonwebtoken");

/**
 * Ensure JWT secrets exist in environment.
 * If not, throw a clear error instead of silent jwt.sign failure.
 */
const ensureJwtSecrets = () => {
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    console.error("❌ JWT secrets missing in environment");
    throw new Error(
      "JWT_ACCESS_SECRET / JWT_REFRESH_SECRET not configured in environment"
    );
  }
};

/**
 * Generate access + refresh tokens from a full user document.
 * Always call: generateTokens(user)
 */
const generateTokens = (user) => {
  if (!user || !user._id) {
    throw new Error("generateTokens: user or user._id missing");
  }

  // ✅ make sure env is correct before signing
  ensureJwtSecrets();

  const payload = {
    sub: user._id.toString(),
    role: user.role || "OWNER",
    provider: user.provider || "local",
  };

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
};

/**
 * Generate tokens from custom payload (e.g. EMPLOYEE)
 */
const generateTokensFromPayload = (payload) => {
  if (!payload || !payload.sub) {
    throw new Error("generateTokensFromPayload: payload.sub missing");
  }

  // ✅ again ensure secrets exist
  ensureJwtSecrets();

  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
};

/**
 * Store tokens in cookies (for web). Mobile reads JSON response.
 */
const setAuthCookies = (res, { accessToken, refreshToken }) => {
  if (!res || !accessToken || !refreshToken) return;

  const isProd = process.env.NODE_ENV === "production";

  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res) => {
  if (!res) return;
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
};

module.exports = {
  generateTokens,
  generateTokensFromPayload,
  setAuthCookies,
  clearAuthCookies,
};
