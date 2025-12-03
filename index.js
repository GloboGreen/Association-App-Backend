require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const connectDB = require("./src/config/connectDB.js");
const UserModel = require("./src/models/user.model.js");
const authRouter = require("./src/routes/auth.routes.js");
const userRouter = require("./src/routes/user.routes.js");
const associationRouter = require("./src/routes/association.routes.js");
const uploadRouter = require("./src/routes/upload.routes.js");
const employeeRoutes = require("./src/routes/employee.routes.js");
const qrRoutes = require("./src/routes/qr.routes.js");
const subscriptionRoutes = require("./src/routes/subscription.routes");
const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

/* ---- Security & Parsers (MUST be before routes) ---- */
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: isDev ? false : { policy: "same-origin" },
    crossOriginEmbedderPolicy: isDev ? false : true,
  })
);
app.use(helmet.referrerPolicy({ policy: "strict-origin-when-cross-origin" }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());
app.set("trust proxy", 1);

/* ---- CORS (MUST be before routes) ---- */
const allowedOrigins = [
  process.env.FRONTEND_URL,     // .env -> http://localhost:5173 (web)
  "http://localhost:5173",      // Vite dev
].filter(Boolean);

app.use(
  cors({
    origin: isDev
      ? true // 👈 allow everything in development
      : function (origin, cb) {
          if (!origin || allowedOrigins.includes(origin)) {
            return cb(null, true);
          }
          return cb(new Error("Not allowed by CORS"));
        },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
  })
);

/* ---- Routes ---- */
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/associations", associationRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/uploadImag", uploadRouter); 
app.use("/api/employee", employeeRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
/* ---- Health ---- */
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime() })
);

/* ---- Errors ---- */
app.use((err, _req, res, _next) => {
  console.error("🔥 Server Error:", err.message);
  res
    .status(500)
    .json({ success: false, message: err.message || "Internal Server Error" });
});

/* ---- Admin seeding ---- */
async function ensureDefaultAdmin() {
  const email = process.env.ADMIN_EMAIL_ID;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const exist = await UserModel.findOne({ email }).lean();
  if (exist) return;

  const hash = await bcrypt.hash(password, 10);
  await UserModel.create({
    name: "Master Admin",
    email,
    password: hash,
    role: "ADMIN",
    provider: "local",
    verify_email: true,
    status: "Active",
  });
  console.log(`[seed] ✅ Default admin created: ${email}`);
}

/* ---- Start ---- */
connectDB()
  .then(async () => {
    await ensureDefaultAdmin();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });

process.on("SIGINT", () => {
  console.log("\n🛑 Server shutting down gracefully...");
  process.exit(0);
});
