function verifyEmailOtpTemplate( name ="", otp =""){
    return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #4CAF50;">Email Verification</h2>
    <p>Hi, ${name},</p>
    <p>Your One-Time Password (OTP) for email verification is:</p>
    <h1 style="color: #4CAF50;">${otp}</h1>
    <p>This OTP is valid for the next 10 minutes. Please do not Share it with anyone.</p>
    <p>If you did not request this, please ignore this email.</p>
    <br/>
    <p>Best regards,<br/>The Association App Team</p>
    </div>`;
};

function resetPasswordOtpTemplate( name ="", otp =""){
    return`
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #FF5722;">Password Reset Request</h2>
    <p>Hi, ${name},</p>
    <p>Your One-Time Password (OTP) for resetting your password is:</p>
    <h1 style="color: #FF5722;">${otp}</h1>
    <p> This OTP is valid for the next 10 minutes. Please do not Share it with anyone.</p>
    <p> If you did not request this, please ignore this email.</p>    <br/>
    <p>Best regards,<br/>The Association App Team</p>
    </div>`;
};

function loginOtpTemplate( name = "", otp =""){
    return`
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <h2 style="color: #FF5722;">Login OTP</h2>
    <p>Hi, ${name},</p>
    <p>Your One-Time Password (OTP) for Login is:</p>
    <h1 style="color: #FF5722;">${otp}</h1>
    <p> This OTP is valid for the next 10 minutes. Please do not Share it with anyone.</p>
    <p> If you did not request this, please ignore this email.</p>    <br/>
    <p>Best regards,<br/>The Association App Team</p>
    </div>`;
}

module.exports = {
    verifyEmailOtpTemplate,
    resetPasswordOtpTemplate,
    loginOtpTemplate,
};