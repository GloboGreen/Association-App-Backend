const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASSWORD,
  },
});

async function sendMail({ to, subject, html }) {
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.NODEMAILER_EMAIL,
    to, subject, html
  });
}

function verifyEmailOtpTemplate(code) {
  return `
    <div style="font-family:sans-serif">
      <h2>Verify your email</h2>
      <p>Your OTP is <strong>${code}</strong>. It expires in 10 minutes.</p>
    </div>
  `;
}
function loginOtpTemplate(code) {
  return `
    <div style="font-family:sans-serif">
      <h2>Login OTP</h2>
      <p>Your OTP is <strong>${code}</strong>. It expires in 10 minutes.</p>
    </div>
  `;
}

module.exports = { sendMail, verifyEmailOtpTemplate, loginOtpTemplate };
