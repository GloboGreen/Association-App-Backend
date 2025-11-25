const User = require("../models/user.model");
const Employee = require("../models/employee.model");
const ScanHistory = require("../models/scanHistory.model");

/* ---------------- helper: parse QR payload ---------------- */
const parseQrPayload = (raw) => {
  let parsed = null;
  let idCandidate = raw;
  let type = null;
  let shopName = "";
  let productName = "";

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object") {
    if (parsed.id) idCandidate = parsed.id;
    type = parsed.type || null;
    shopName = parsed.shopName || "";
    productName = parsed.productName || "";
  } else if (raw && raw.startsWith("http")) {
    try {
      const urlObj = new URL(raw);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length > 0) idCandidate = parts[parts.length - 1];
    } catch {
      // ignore
    }
  }

  return { idCandidate, type, shopName, productName, parsed };
};

/* --------- helper: check if target QR should be blocked --------- */
const checkTargetVerification = async ({ owner, employee }) => {
  if (owner) {
    if (!owner.isProfileVerified) {
      return {
        blocked: true,
        code: "OWNER_NOT_VERIFIED",
        message: "This shop is not verified yet. QR is temporarily blocked.",
      };
    }
    return { blocked: false };
  }

  if (employee) {
    // check parent owner if exists
    if (employee.parentOwner) {
      const parentOwner = await User.findById(employee.parentOwner).select(
        "isProfileVerified shopName"
      );
      if (!parentOwner || !parentOwner.isProfileVerified) {
        return {
          blocked: true,
          code: "OWNER_NOT_VERIFIED",
          message:
            "This shop is not verified yet. Employee QR is temporarily blocked.",
        };
      }
    }
    return { blocked: false };
  }

  return {
    blocked: true,
    code: "INVALID_QR",
    message: "Invalid or unsupported QR code.",
  };
};

/**
 * POST /api/qr/scan
 * Body: { raw, actionType?, notes? }
 *  actionType = "BUY" | "RETURN" (optional)
 * Auth: OWNER or EMPLOYEE (req.user from auth middleware)
 */
const scanQr = async (req, res) => {
  try {
    const { raw, actionType, notes } = req.body;
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "QR payload is required",
      });
    }

    const authUser = req.user; // user from auth middleware

    // 1️⃣ OWNER not verified → cannot scan AT ALL
    if (authUser.role === "OWNER" && authUser.isProfileVerified === false) {
      return res.status(403).json({
        success: false,
        code: "SCANNER_NOT_VERIFIED",
        message:
          "Your shop profile is not verified yet. You cannot scan QR codes.",
      });
    }

    // 2️⃣ Parse QR
    const { idCandidate, type } = parseQrPayload(raw);

    let targetOwner = null;
    let targetEmployee = null;
    let targetType = null;

    if (type === "OWNER") {
      targetOwner = await User.findById(idCandidate).select(
        "name shopName isProfileVerified role shopAddress"
      );
      if (!targetOwner) {
        return res.status(404).json({
          success: false,
          code: "OWNER_NOT_FOUND",
          message: "Owner not found for this QR.",
        });
      }
      targetType = "OWNER";
    } else if (type === "EMPLOYEE") {
      targetEmployee = await Employee.findById(idCandidate).select(
        "name shopName parentOwner"
      );
      if (!targetEmployee) {
        return res.status(404).json({
          success: false,
          code: "EMPLOYEE_NOT_FOUND",
          message: "Employee not found for this QR.",
        });
      }
      targetType = "EMPLOYEE";
    } else {
      // fallback: treat as OWNER id
      targetOwner = await User.findById(idCandidate).select(
        "name shopName isProfileVerified role shopAddress"
      );
      if (!targetOwner) {
        return res.status(404).json({
          success: false,
          code: "INVALID_QR",
          message: "Invalid QR code.",
        });
      }
      targetType = "OWNER";
    }

    // 3️⃣ Check target verification (owner or employee->owner)
    const verificationResult = await checkTargetVerification({
      owner: targetOwner,
      employee: targetEmployee,
    });

    if (verificationResult.blocked) {
      return res.status(403).json({
        success: false,
        code: verificationResult.code,
        message: verificationResult.message,
      });
    }

    // 4️⃣ Decide final actionType (BUY / RETURN / UNKNOWN)
    let finalActionType = "UNKNOWN";
    if (actionType === "BUY" || actionType === "RETURN") {
      finalActionType = actionType;
    }

    // 5️⃣ Decide main "opposite user" (toUser) and shop name
    // - If QR is OWNER → opposite = that owner
    // - If QR is EMPLOYEE → opposite = parent owner (shop), fallback to nothing if missing
    let oppositeUser = null;
    let oppositeShopName = "";

    if (targetOwner) {
      oppositeUser = targetOwner;
      oppositeShopName = targetOwner.shopName || "";
    } else if (targetEmployee) {
      if (targetEmployee.parentOwner) {
        const parentOwner = await User.findById(
          targetEmployee.parentOwner
        ).select("name shopName");
        if (parentOwner) {
          oppositeUser = parentOwner;
          oppositeShopName = targetEmployee.shopName || parentOwner.shopName || "";
        }
      }
      // if for some reason no parent owner found, still fallback to employee shop
      if (!oppositeUser) {
        oppositeShopName = targetEmployee.shopName || "";
      }
    }

    if (!oppositeUser) {
      // safety fallback → prevent saving inconsistent doc
      return res.status(400).json({
        success: false,
        code: "INVALID_TARGET",
        message: "Could not resolve shop owner from this QR.",
      });
    }

    // 6️⃣ Build both-side snapshot (Google Pay style)
    const fromUser = authUser;
    const toUser = oppositeUser;

    const fromName = fromUser.name || "Member";
    const fromShopName = fromUser.shopName || "";

    const toName = toUser.name || "Member";
    const toShopName = oppositeShopName || toUser.shopName || "";

    // 7️⃣ Save ScanHistory (ONE row, BOTH sides)
    let historyDoc = null;
    try {
      historyDoc = await ScanHistory.create({
        fromUser: fromUser._id,
        toUser: toUser._id,
        fromName,
        toName,
        fromShopName,
        toShopName,
        actionType: finalActionType,
        notes: notes || "",
      });
    } catch (err) {
      console.error("ScanHistory create error:", err.message);
    }

    // 8️⃣ Return target details to app
    return res.json({
      success: true,
      code: "SCAN_OK",
      data: {
        historyId: historyDoc ? historyDoc._id : null,
        actionType: finalActionType,
        targetType, // OWNER / EMPLOYEE
        owner: targetOwner
          ? {
              id: targetOwner._id,
              name: targetOwner.name,
              shopName: targetOwner.shopName,
              address: targetOwner.shopAddress,
            }
          : null,
        employee: targetEmployee
          ? {
              id: targetEmployee._id,
              name: targetEmployee.name,
              shopName: targetEmployee.shopName,
            }
          : null,
      },
    });
  } catch (err) {
    console.error("scanQr error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while scanning QR.",
    });
  }
};

/**
 * GET /api/qr/my
 * Get logged in user's QR (OWNER or EMPLOYEE)
 * OWNER: blocked if isProfileVerified === false
 * EMPLOYEE: blocked if parentOwner is not verified
 *
 * ✅ unchanged from your version
 */
const getMyQr = async (req, res) => {
  try {
    const user = req.user;

    if (user.role === "OWNER") {
      if (!user.isProfileVerified) {
        return res.status(403).json({
          success: false,
          code: "OWNER_NOT_VERIFIED",
          message:
            "Your profile is not verified yet. You will get your QR after verification.",
        });
      }

      // Owner QR already stored in user.qrCodeUrl
      return res.json({
        success: true,
        qrCodeUrl: user.qrCodeUrl || "",
        type: "OWNER",
      });
    }

    if (user.role === "EMPLOYEE") {
      // find employee record
      const employee = await Employee.findOne({ _id: user.employeeId }).select(
        "qrCodeUrl parentOwner shopName"
      );

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "Employee record not found.",
        });
      }

      if (employee.parentOwner) {
        const owner = await User.findById(employee.parentOwner).select(
          "isProfileVerified"
        );
        if (!owner || !owner.isProfileVerified) {
          return res.status(403).json({
            success: false,
            code: "OWNER_NOT_VERIFIED",
            message:
              "Shop is not verified yet. Employee QR will be available after verification.",
          });
        }
      }

      return res.json({
        success: true,
        qrCodeUrl: employee.qrCodeUrl || "",
        type: "EMPLOYEE",
        shopName: employee.shopName,
      });
    }

    return res.status(403).json({
      success: false,
      message: "QR is not available for this role.",
    });
  } catch (err) {
    console.error("getMyQr error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching QR.",
    });
  }
};

/**
 * GET /api/qr/history
 * Query param: ?limit=50 (optional)
 *
 * ❗ NEW BEHAVIOUR:
 *  - returns scans where this user is EITHER:
 *      fromUser (scanner) OR toUser (opposite)
 *  - maps output so frontend can show:
 *      myName, myShopName, oppositeName, oppositeShopName, actionType, notes, date
 */
const getScanHistory = async (req, res) => {
  try {
    const user = req.user;
    const userId = user._id; // mongoose ObjectId
    const limit = Number(req.query.limit || 50);

    console.log("🔎 getScanHistory for user:", String(userId));

    const items = await ScanHistory.find({
      $or: [{ fromUser: userId }, { toUser: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(); // return plain objects

    console.log("🧾 history items found:", items.length);

    const mapped = items.map((doc) => {
      const isSender =
        String(doc.fromUser) === String(userId);

      return {
        id: String(doc._id),
        selfRole: isSender ? "SENDER" : "RECEIVER",

        myName: isSender ? doc.fromName : doc.toName,
        myShopName: isSender ? doc.fromShopName : doc.toShopName,

        oppositeName: isSender ? doc.toName : doc.fromName,
        oppositeShopName: isSender
          ? doc.toShopName
          : doc.fromShopName,

        actionType: doc.actionType || "UNKNOWN", // BUY / RETURN / UNKNOWN
        notes: doc.notes || "",
        createdAt: doc.createdAt,
      };
    });

    return res.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    console.error("getScanHistory error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching scan history.",
    });
  }
};

module.exports = {
  scanQr,
  getMyQr,
  getScanHistory,
};
