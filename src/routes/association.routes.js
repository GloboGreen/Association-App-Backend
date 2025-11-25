const express = require("express");
const associationRouter = express.Router();

const upload = require("../middleware/upload");
const { auth, isAdmin } = require("../middleware/auth");
const {
  createAssociation,
  getAllAssociations,
  getAssociationById,
  updateAssociation,
  deleteAssociation,
} = require("../controllers/association.controller");

// Public
associationRouter.get("/allassociations", getAllAssociations);
associationRouter.get("/:id", getAssociationById);

// Admin: Create with logo
associationRouter.post(
  "/createdassociations",
  auth,
  isAdmin,
  upload.single("logo"), // field name must match frontend
  createAssociation
);

// Admin: Update (with optional new logo)
associationRouter.patch(
  "/:id",
  auth,
  isAdmin,
  upload.single("logo"),
  updateAssociation
);

// Admin: Delete
associationRouter.delete("/:id", auth, isAdmin, deleteAssociation);

module.exports = associationRouter;
