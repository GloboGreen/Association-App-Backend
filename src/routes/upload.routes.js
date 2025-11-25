const express = require("express");
const uploadRouter = express.Router();

const upload = require("../middleware/upload");
const { auth, isAdmin } = require("../middleware/auth");
const {
  uploadImageController,
} = require("../controllers/upload.controller");

// Only admin can update footer image
uploadRouter.post(
  "/Images",
  auth,
  isAdmin,
  upload.single("image"),
  uploadImageController
);

module.exports = uploadRouter;
