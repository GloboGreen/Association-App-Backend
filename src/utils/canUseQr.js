// server/utils/canUseQr.js
const canUseQrForOwner = (user) => {
  if (!user) return false;
  return (
    user.role === "OWNER" &&
    user.profilePercent === 100 &&
    user.shopCompleted === true &&
    user.isProfileVerified === true
  );
};

const canUseQrForEmployee = (employee) => {
  if (!employee || !employee.owner) return false;
  const owner = employee.owner;
  return (
    owner.role === "OWNER" &&
    owner.profilePercent === 100 &&
    owner.shopCompleted === true &&
    owner.isProfileVerified === true
  );
};

module.exports = { canUseQrForOwner, canUseQrForEmployee };
