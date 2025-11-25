const express = require("express");
const router = express.Router();

const { auth, isAdmin } = require("../middleware/auth");
const {
  createOrUpdateSubscription,
  getSubscriptionsByMember,
  getMySubscriptions,
  getAllSubscriptionsAdmin, // ✅ new
} = require("../controllers/subscription.controller");

// Admin only – create / update for ONE member
router.post("/:memberId", auth, isAdmin, createOrUpdateSubscription);

// Admin – see one member history
router.get("/member/:memberId", auth, isAdmin, getSubscriptionsByMember);

// Admin – see ALL members history
router.get("/allsubscriptionsAdmin", auth, isAdmin, getAllSubscriptionsAdmin); 

// App user – see own history
router.get("/my", auth, getMySubscriptions);

module.exports = router;
