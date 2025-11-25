const QRCode = require("qrcode");

async function generateEmployeeQr(employee) {
  const payload = {
    type: "EMPLOYEE_QR",
    id: String(employee._id),
    name: employee.name,
    mobile: employee.mobile,
    shopName: employee.shopName,
  };

  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
    errorCorrectionLevel: "H",
    type: "image/png",
    margin: 2,
    width: 512,
  });

  return qrDataUrl;
}

module.exports = { generateEmployeeQr };
