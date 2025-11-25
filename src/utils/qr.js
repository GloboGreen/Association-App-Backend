const QRCode = require("qrcode");
const Jimp = require("jimp");
const QrCodeReader = require("qrcode-reader");

/**
 * Generate QR Code (returns base64 or Cloudinary URL if you upload it)
 * @param {string} text - Text to encode (e.g., mobile number)
 */
async function generateQRCode(text) {
  try {
    return await QRCode.toDataURL(text, { errorCorrectionLevel: "H" });
  } catch (err) {
    throw new Error("Failed to generate QR code");
  }
}

/**
 * Decode QR Code from an image buffer
 * @param {Buffer} buffer - Image buffer containing QR code
 */
async function decodeQRCode(buffer) {
  return new Promise((resolve, reject) => {
    Jimp.read(buffer, (err, image) => {
      if (err) return reject("Invalid image for QR scan");
      const qr = new QrCodeReader();
      qr.callback = (error, value) => {
        if (error) return reject("Failed to decode QR code");
        resolve(value.result);
      };
      qr.decode(image.bitmap);
    });
  });
}

module.exports = { generateQRCode, decodeQRCode };
