// ═══════════════════════════════════════════════════════
// Global Care Backend — Main Server
// ═══════════════════════════════════════════════════════
//
//  npm install          — Install dependencies
//  npm run migrate      — Create database tables
//  npm run seed         — Insert demo data
//  npm run dev          — Start with nodemon (hot reload)
//  npm start            — Start production server
//
// ═══════════════════════════════════════════════════════

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT;

// ─── Security & Utility Middleware ────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/", limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts, please try again in 15 minutes" },
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Health Check ─────────────────────────────────────
app.get("/api/v1/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Global Care API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ─── API Routes ───────────────────────────────────────
app.use("/api/v1/auth", authLimiter, require("./routes/auth"));
app.use("/api/v1/patients", require("./routes/patients"));
app.use("/api/v1/appointments", require("./routes/appointments"));
app.use("/api/v1/hospitals", require("./routes/hospitals"));
app.use("/api/v1/doctors", require("./routes/doctors"));
app.use("/api/v1/labs", require("./routes/labs"));
app.use("/api/v1/travel", require("./routes/travel"));
app.use("/api/v1/prescriptions", require("./routes/prescriptions"));
app.use("/api/v1/insurance", require("./routes/insurance"));
app.use("/api/v1/notifications", require("./routes/notifications"));
app.use("/api/v1/analytics", require("./routes/analytics"));

// ─── API Documentation ───────────────────────────────
app.get("/api/v1", (req, res) => {
  res.json({
    name: "Global Care Medical Tourism API",
    version: "1.0.0",
    endpoints: {
      auth: {
        "POST /login": "Login → JWT tokens",
        "POST /register": "Register new user",
        "POST /refresh": "Refresh access token",
        "GET  /me": "Current user profile",
      },
      patients: "CRUD + filter by status/country/hospital/doctor",
      appointments: "CRUD + confirm/cancel/complete workflow",
      hospitals: "CRUD + departments + bed management",
      doctors: "CRUD + schedule + patient list",
      labs: "Reports CRUD + process → complete workflow",
      travel: "Bookings CRUD + visa tracking + pickup confirm",
      prescriptions: "Write (doctor) → dispense (pharmacy) workflow",
      insurance: "Claims submit → review → approve/reject → settle",
      notifications: "List/read/delete per-user notifications",
      analytics: "Dashboard stats, revenue, trends, audit log",
    },
    authentication: "Bearer JWT in Authorization header",
    roles: ["superadmin", "hospital", "doctor", "patient", "lab", "travel", "pharmacy", "insurance"],
  });
});

// ─── Error Handling ───────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║   Global Care API Server                          ║
  ║   Port: ${PORT}                                      ║
  ║   Env:  ${(process.env.NODE_ENV || "development").padEnd(16)}                          ║
  ║   Docs: http://localhost:${PORT}/api/v1              ║
  ╚═══════════════════════════════════════════════════╝
  `);
});

module.exports = app;
