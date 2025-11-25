// server/utils/profileScore.js

// Helper: check if a value is "filled"
const hasValue = (v) =>
  v !== undefined &&
  v !== null &&
  String(v).trim() !== "";

/**
 * Calculate profile completion percentage based on:
 * - Profile details
 * - Address
 * - Business details
 * - Shop details
 */
const computeProfilePercent = (user) => {
  if (!user) return 0;

  const flags = [];

  // ---- Basic profile ----
  flags.push(hasValue(user.name));            // 1
  flags.push(hasValue(user.email));           // 2
  flags.push(hasValue(user.mobile));          // 3
  flags.push(hasValue(user.whatsappNumber));  // 4
  flags.push(hasValue(user.avatar));          // 5

  // ---- Personal address ----
  const addr = user.address || {};
  flags.push(hasValue(addr.street));          // 6
  flags.push(hasValue(addr.area));            // 7
  flags.push(hasValue(addr.city));            // 8
  flags.push(hasValue(addr.district));        // 9
  flags.push(hasValue(addr.state));           // 10
  flags.push(hasValue(addr.pincode));         // 11

  // ---- Business ----
  flags.push(hasValue(user.BusinessType));     // 12
  flags.push(hasValue(user.BusinessCategory)); // 13

  // ---- Shop ----
  flags.push(hasValue(user.shopName));        // 14

  const shopAddr = user.shopAddress || {};
  flags.push(hasValue(shopAddr.street));      // 15
  flags.push(hasValue(shopAddr.area));        // 16
  flags.push(hasValue(shopAddr.city));        // 17
  flags.push(hasValue(shopAddr.district));    // 18
  flags.push(hasValue(shopAddr.state));       // 19
  flags.push(hasValue(shopAddr.pincode));     // 20

  flags.push(hasValue(user.shopFront));       // 21
  flags.push(hasValue(user.shopBanner));      // 22

  // shopLocation: coordinates not [0,0]
  const locOk =
    user.shopLocation &&
    Array.isArray(user.shopLocation.coordinates) &&
    user.shopLocation.coordinates.length === 2 &&
    (user.shopLocation.coordinates[0] !== 0 ||
      user.shopLocation.coordinates[1] !== 0);

  flags.push(locOk);                          // 23

  const total = flags.length; // 23
  if (!total) return 0;

  const completed = flags.filter(Boolean).length;
  const pct = Math.round((completed / total) * 100);

  // clamp between 0–100
  return Math.max(0, Math.min(100, pct));
};

module.exports = {
  computeProfilePercent,
};
