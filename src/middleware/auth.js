// server/middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const Employee = require("../models/employee.model");

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

    // 🔹 EMPLOYEE TOKENS
    if (
      decoded.subjectType === "EMPLOYEE" ||
      decoded.role === "EMPLOYEE"
    ) {
      const employee = await Employee.findById(decoded.sub).select(
        "_id name mobile role avatar shopName shopAddress parentOwner qrCodeUrl status"
      );

      if (!employee || employee.status !== "Active") {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Employee not found",
        });
      }

      // create a user-like object so controllers can use req.user
      req.user = {
        _id: employee._id,
        name: employee.name,
        email: null,
        mobile: employee.mobile,
        role: employee.role || "EMPLOYEE",
        avatar: employee.avatar,
        shopName: employee.shopName,
        shopAddress: employee.shopAddress,
        parentOwner: employee.parentOwner,
        qrCodeUrl: employee.qrCodeUrl,
        isProfileVerified: true, // scanner side: treat employee as allowed (owner verification handled elsewhere)
        _employee: employee, // raw doc if any controller needs extra fields
      };

      return next();
    }

    // 🔹 OWNER / USER TOKENS
    const user = await User.findById(decoded.sub).select(
      "_id name email role provider verify_email mobile avatar whatsappNumber address isProfileVerified shopName shopAddress qrCodeUrl"
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
