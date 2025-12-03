// server/routes/qr.routes.js
const express = require("express");
const router = express.Router();

const { auth } = require("../middleware/auth");
const { scanQr, getMyQr, getScanHistory } = require("../controllers/qr.controller");

router.post("/scan", auth, scanQr);
router.get("/my", auth, getMyQr);
router.get("/history", auth, getScanHistory);

module.exports = router;
