// server/utils/generateTokens.js
const jwt = require("jsonwebtoken");

const ms = (h) => h * 60 * 60 * 1000;

function generateTokens(user) {
  const payload = {
    sub: String(user._id),
    role: user.role,
    provider: user.provider,
  };

  // you can keep 7d / 30d if you want
  const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: "7d",
  });
  const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
}

function setAuthCookies(res, tokens) {
  const isProd = process.env.NODE_ENV === "production";

  res.cookie("accessToken", tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: ms(0.25), // 15 minutes
  });

  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: ms(24 * 30), // 30 days
  });
}

function clearAuthCookies(res) {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
}

module.exports = { generateTokens, setAuthCookies, clearAuthCookies };
