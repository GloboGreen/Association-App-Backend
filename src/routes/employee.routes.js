// server/routes/employee.routes.js
const express = require("express");
const router = express.Router();

const {
  createEmployee,
  getMyEmployees,
  updateEmployee,
  loginEmployeeWithPin,
} = require("../controllers/employee.controller");

const { auth } = require("../middleware/auth");

// OWNER / ADMIN endpoints
router.post("/create", auth, createEmployee);
router.get("/my", auth, getMyEmployees);
router.patch("/:id", auth, updateEmployee); 

// Employee login (no auth)
router.post("/login", loginEmployeeWithPin);

module.exports = router;
