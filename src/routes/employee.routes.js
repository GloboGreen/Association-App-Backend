// server/routes/employee.routes.js
const express = require("express");
const router = express.Router();

const {
  createEmployee,
  getMyEmployees,
  updateEmployee,
} = require("../controllers/employee.controller");

const { auth } = require("../middleware/auth");

// OWNER / ADMIN endpoints
router.post("/create", auth, createEmployee);
router.get("/my", auth, getMyEmployees);
router.patch("/:id", auth, updateEmployee); 



module.exports = router;
