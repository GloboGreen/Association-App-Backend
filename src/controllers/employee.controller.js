// server/controllers/employee.controller.js
const bcrypt = require("bcryptjs");
const Employee = require("../models/employee.model");
const User = require("../models/user.model");

const { generateTokens, setAuthCookies } = require("../utils/generateTokens");
const { generateEmployeeQr } = require("../utils/generateEmployeeQr");
const cloudinary = require("../config/cloudinary"); // ✅ NEW

const createEmployee = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { name, mobile, pin, avatarBase64 } = req.body; // ✅ avatarBase64

    if (!name || !mobile || !pin) {
      return res.status(400).json({
        success: false,
        message: "Name, mobile and PIN are required",
      });
    }

    if (!/^\d{4,6}$/.test(String(pin))) {
      return res.status(400).json({
        success: false,
        message: "PIN must be 4–6 digits",
      });
    }

    const owner = await User.findById(ownerId);
    if (!owner) {
      return res
        .status(404)
        .json({ success: false, message: "Owner not found" });
    }

    if (!["OWNER", "ADMIN"].includes(owner.role)) {
      return res.status(403).json({
        success: false,
        message: "Only owner/admin can add employees",
      });
    }

    // check existing active employee with same mobile for this owner
    const existing = await Employee.findOne({
      mobile,
      owner: ownerId,
      status: "Active",
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Employee with this mobile already exists",
      });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);

    const shopName = owner.shopName || owner.name || "";
    const shopAddress = owner.shopAddress || owner.address || {};

    // 🔵 Upload avatar if provided (base64 → Cloudinary)
    let avatar = "";
    if (avatarBase64) {
      try {
        const uploadRes = await cloudinary.uploader.upload(
          `data:image/jpeg;base64,${avatarBase64}`,
          { folder: "employees/avatar" }
        );
        avatar = uploadRes.secure_url; // ✅ HTTPS URL
      } catch (e) {
        console.warn("Cloudinary upload error (employee avatar):", e);
      }
    }

    let employee = await Employee.create({
      name,
      mobile,
      avatar,
      shopName,
      shopAddress,
      pinHash,
      owner: ownerId,
      role: "EMPLOYEE",
      status: "Active",
    });

    // QR code
    try {
      const qrUrl = await generateEmployeeQr(employee);
      employee.qrCodeUrl = qrUrl;
      await employee.save();
    } catch (qrErr) {
      console.warn("generateEmployeeQr error:", qrErr);
    }

    return res.json({
      success: true,
      message: "Employee added successfully",
      data: {
        id: employee._id,
        name: employee.name,
        mobile: employee.mobile,
        role: employee.role,
        avatar: employee.avatar,
        shopName: employee.shopName,
        qrCodeUrl: employee.qrCodeUrl,
        status: employee.status,
      },
    });
  } catch (err) {
    console.error("createEmployee error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add employee",
      error: err.message,
    });
  }
};

const getMyEmployees = async (req, res) => {
  try {
    const ownerId = req.user._id;

    const employees = await Employee.find({
      owner: ownerId,
    })
      .sort({ createdAt: -1 })
      .lean();

    const data = employees.map((e) => ({
      id: e._id,
      name: e.name,
      mobile: e.mobile,
      role: e.role,
      avatar: e.avatar,
      shopName: e.shopName,
      qrCodeUrl: e.qrCodeUrl,
      status: e.status,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("getMyEmployees error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch employees",
      error: err.message,
    });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const ownerId = req.user._id;
    const { id } = req.params;
    const { name, mobile, pin, status } = req.body;

    const employee = await Employee.findOne({
      _id: id,
      owner: ownerId,
    }).select("+pinHash");

    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    if (name) employee.name = name;
    if (mobile) employee.mobile = mobile;

    if (typeof status === "string") {
      if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Use Active or Inactive",
        });
      }
      employee.status = status;
    }

    if (pin) {
      if (!/^\d{4,6}$/.test(String(pin))) {
        return res.status(400).json({
          success: false,
          message: "PIN must be 4–6 digits",
        });
      }
      employee.pinHash = await bcrypt.hash(String(pin), 10);
    }

    await employee.save();

    return res.json({
      success: true,
      message: "Employee updated successfully",
      data: {
        id: employee._id,
        name: employee.name,
        mobile: employee.mobile,
        role: employee.role,
        avatar: employee.avatar,
        shopName: employee.shopName,
        qrCodeUrl: employee.qrCodeUrl,
        status: employee.status,
      },
    });
  } catch (err) {
    console.error("updateEmployee error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update employee",
      error: err.message,
    });
  }
};

module.exports = {
  createEmployee,
  getMyEmployees,
  updateEmployee,
};
