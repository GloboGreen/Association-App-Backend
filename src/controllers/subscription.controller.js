// server/controllers/subscription.controller.js
const Subscription = require("../models/subscription.model");
const User = require("../models/user.model");

const createOrUpdateSubscription = async (req, res) => {
  try {
    const adminUser = req.user;
    const { memberId } = req.params;

    const {
      monthKey,
      subscriptionAmount,
      meetingAmount,
      status,
      notes,
    } = req.body;

    if (!monthKey || !subscriptionAmount) {
      return res.status(400).json({
        success: false,
        message: "monthKey and subscriptionAmount are required",
      });
    }

    const member = await User.findById(memberId);
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const payload = {
      member: memberId,
      monthKey,
      subscriptionAmount: Number(subscriptionAmount),
      meetingAmount: Number(meetingAmount) || 0,
      status: status === "FAILED" ? "FAILED" : "PAID",
      paidDate: new Date(),
      createdBy: adminUser?._id,
      notes: notes || "",
    };

    const sub = await Subscription.findOneAndUpdate(
      { member: memberId, monthKey },
      payload,
      { new: true, upsert: true }
    );

    return res.json({ success: true, message: "Subscription saved", data: sub });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

const getSubscriptionsByMember = async (req, res) => {
  try {
    const { memberId } = req.params;

    const subs = await Subscription.find({ member: memberId })
      .populate("member", "name mobile shopName role")
      .sort({ monthKey: 1 })
      .lean();

    return res.json({ success: true, data: subs });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};
const getMySubscriptions = async (req, res) => {
  try {
    const subs = await Subscription.find({ member: req.user._id })
      .populate("member", "name mobile shopName role")
      .sort({ monthKey: 1 })
      .lean();

    return res.json({ success: true, data: subs });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Server error" });
  }
};


const getAllSubscriptionsAdmin = async (req, res) => {
  try {
    const subs = await Subscription.find({})
      .populate({
        path: "member",
        select: "name mobile shopName role",
        match: { role: "OWNER" }, // 👈 only owners
      })
      .sort({ monthKey: -1 })
      .lean();

    // filter out docs where populate failed (non-OWNER)
    const filtered = subs.filter((s) => s.member);

    return res.json({ success: true, data: filtered });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to load subscriptions" });
  }
};


module.exports = {
  createOrUpdateSubscription,
  getSubscriptionsByMember,
  getMySubscriptions,
  getAllSubscriptionsAdmin,
};
