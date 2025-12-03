function computeProfilePercent(user) {
  let total = 0;
  let done = 0;

  const addCheck = (ok) => {
    total += 1;
    if (ok) done += 1;
  };

  // ✅ Profile basics
  addCheck(!!user.name);
  addCheck(!!user.whatsappNumber);

  // ✅ Member address
  const addr = user.address || {};
  addCheck(!!addr.street);
  addCheck(!!addr.city);
  addCheck(!!addr.pincode);

  // ✅ Shop basic
  addCheck(!!user.shopName);

  // ✅ Shop address
  const sa = user.shopAddress || {};
  addCheck(!!sa.street);
  addCheck(!!sa.city);
  addCheck(!!sa.pincode);

  // ✅ Shop photos
  addCheck(!!user.shopFront);
  addCheck(!!user.shopBanner);

  // ✅ Business details
  addCheck(!!user.BusinessType);
  addCheck(!!user.BusinessCategory);

  if (!total) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

module.exports = { computeProfilePercent };
