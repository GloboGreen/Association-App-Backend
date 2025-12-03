// server/controllers/qr.controller.js
const User = require("../models/user.model");
const Employee = require("../models/employee.model");
const ScanHistory = require("../models/scanHistory.model");

/* ---------------- helper: parse QR payload ---------------- */
/**
 * raw can be:
 *  - plain ObjectId
 *  - JSON string: { "id": "...", "type": "OWNER"|"EMPLOYEE", "shopName": "...", "productName": "..." }
 *  - URL containing the id in path or query
 */
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
  } else if (raw && typeof raw === "string" && raw.startsWith("http")) {
    try {
      const urlObj = new URL(raw);
      const parts = urlObj.pathname.split("/").filter(Boolean);
      if (parts.length > 0) idCandidate = parts[parts.length - 1];

      const queryId =
        urlObj.searchParams.get("id") ||
        urlObj.searchParams.get("memberId") ||
        urlObj.searchParams.get("userId");
      if (queryId) {
        idCandidate = queryId;
      }
    } catch {
      // ignore parse error
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
    const { raw, actionType, notes } = req.body || {};
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "QR payload is required",
      });
    }

    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
      });
    }

    // 1️⃣ OWNER not verified → cannot scan
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
      // fallback owner
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

    // 3️⃣ Check target verification
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

    // 4️⃣ Decide actionType
    let finalActionType = "UNKNOWN";
    if (actionType === "BUY" || actionType === "RETURN") {
      finalActionType = actionType;
    }

    // 5️⃣ Decide opposite user & shop
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
          oppositeShopName =
            targetEmployee.shopName || parentOwner.shopName || "";
        }
      }

      if (!oppositeUser) {
        oppositeShopName = targetEmployee.shopName || "";
      }
    }

    if (!oppositeUser) {
      return res.status(400).json({
        success: false,
        code: "INVALID_TARGET",
        message: "Could not resolve shop owner from this QR.",
      });
    }

    // 6️⃣ Snapshot both sides
    const fromUser = authUser;
    const toUser = oppositeUser;

    const fromName = fromUser.name || "Member";
    const fromShopName = fromUser.shopName || "";

    const toName = toUser.name || "Member";
    const toShopName = oppositeShopName || toUser.shopName || "";

    // 7️⃣ Save history
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
        notes: (notes || "").trim(),
      });
    } catch (err) {
      console.error("ScanHistory create error:", err.message);
    }

    // 8️⃣ Response
    return res.json({
      success: true,
      code: "SCAN_OK",
      data: {
        historyId: historyDoc ? historyDoc._id : null,
        actionType: finalActionType,
        targetType,
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

      return res.json({
        success: true,
        qrCodeUrl: user.qrCodeUrl || "",
        type: "OWNER",
      });
    }

    if (user.role === "EMPLOYEE") {
      // 🔹 EMPLOYEE: we now use req.user._id (set by auth middleware)
      const employee = await Employee.findById(user._id).select(
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
 * OWNER  : sees own scans + all employees' scans
 * EMPLOYEE: sees only their own related scans
 */
const getScanHistory = async (req, res) => {
  try {
    const user = req.user;
    const limit = Math.min(Number(req.query.limit || 50), 500);

    // 1️⃣ Build list of IDs considered "self"
    // OWNER: [ownerId, all employeeIds under this owner]
    // EMPLOYEE / other: [userId]
    let selfIds = [user._id.toString()];

    if (user.role === "OWNER") {
      const employees = await Employee.find({
        $or: [
          { owner: user._id }, // your sample employee doc uses `owner`
          { parentOwner: user._id }, // some parts use `parentOwner`
        ],
        status: "Active",
      }).select("_id");

      selfIds = [
        user._id.toString(),
        ...employees.map((e) => e._id.toString()),
      ];
    }

    // 2️⃣ Fetch histories where fromUser OR toUser is any of those ids
    const items = await ScanHistory.find({
      $or: [
        { fromUser: { $in: selfIds } },
        { toUser: { $in: selfIds } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // 3️⃣ Map into shape expected by ScanHistory.tsx (HistoryItem)
    const mapped = items.map((doc) => {
      const fromId = doc.fromUser.toString();
      const toId = doc.toUser.toString();

      const senderIsSelf = selfIds.includes(fromId);
      const receiverIsSelf = selfIds.includes(toId);

      // Decide selfRole for filters ("You scanned" / "They scanned")
      let isSender;
      if (senderIsSelf && !receiverIsSelf) {
        isSender = true;
      } else if (!senderIsSelf && receiverIsSelf) {
        isSender = false;
      } else {
        // both or neither (weird case) → default to sender side
        isSender = senderIsSelf;
      }

      return {
        id: String(doc._id),
        selfRole: isSender ? "SENDER" : "RECEIVER",

        myName: isSender ? doc.fromName : doc.toName,
        myShopName: isSender ? doc.fromShopName : doc.toShopName,

        oppositeName: isSender ? doc.toName : doc.fromName,
        oppositeShopName: isSender ? doc.toShopName : doc.fromShopName,

        actionType: doc.actionType || "UNKNOWN",
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
