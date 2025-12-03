// utils/generateUserQr.js
const QRCode = require("qrcode");

/**
 * Generate QR code (as DataURL) for a user
 */
const generateUserQr = async (user) => {
  // What info you want inside QR:
  const payload = {
    id: user._id.toString(),
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    shopName: user.shopName,
    association: user.association?.toString() || null,
  };

  // This returns `data:image/png;base64,...`
  const qrCodeDataUrl = await QRCode.toDataURL(JSON.stringify(payload));

  return qrCodeDataUrl;
};

module.exports = { generateUserQr };
