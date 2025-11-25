// server/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const auth = async (req, res, next) => {
  try {
    const rawHeader = req.headers.authorization || req.headers.Authorization;
    let bearer = null;

    if (
      rawHeader &&
      typeof rawHeader === "string" &&
      rawHeader.startsWith("Bearer ")
    ) {
      bearer = rawHeader.slice(7).trim();
    }

    const cookieToken = req.cookies?.accessToken;

    const cleanedBearer =
      bearer && bearer !== "undefined" && bearer !== "null" && bearer !== ""
        ? bearer
        : null;

    const cleanedCookie =
      cookieToken &&
      cookieToken !== "undefined" &&
      cookieToken !== "null" &&
      cookieToken !== ""
        ? cookieToken
        : null;

    const token = cleanedBearer || cleanedCookie;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await User.findById(decoded.sub).select(
      "_id name email role provider verify_email mobile avatar whatsappNumber address"
    );

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: User not found" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.log("AUTH ERROR:", err.message);
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized", error: err.message });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "ADMIN") {
    return res
      .status(403)
      .json({ success: false, message: "Forbidden: Admin only" });
  }
  next();
};

module.exports = { auth, isAdmin };
