// ═══════════════════════════════════════════════════════
// Auth Routes — /api/v1/auth
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, generateTokens } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");

// POST /api/v1/auth/login
router.post("/login", [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 4 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Validation failed", details: errors.array() });
    }

    const { email, password } = req.body;
    const result = await query(
      "SELECT id, email, password_hash, role, name, is_active FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last login
    await query("UPDATE users SET last_login = NOW() WHERE id = $1", [user.id]);

    const tokens = generateTokens(user.id, user.role);

    await auditLog(user.id, "LOGIN", "users", user.id, { email }, req.ip);

    res.json({
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      ...tokens,
    });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/register
router.post("/register", [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
  body("name").trim().isLength({ min: 2 }),
  body("role").isIn(["patient", "doctor", "hospital", "lab", "travel", "pharmacy", "insurance"]),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Validation failed", details: errors.array() });
    }

    const { email, password, name, role, phone } = req.body;

    // Check existing
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, role, name, phone)
       VALUES (?, ?, ?, ?, ?) RETURNING id, email, role, name`,
      [email, passwordHash, role, name, phone || null]
    );

    const user = result.rows[0];
    const tokens = generateTokens(user.id, user.role);

    await auditLog(user.id, "REGISTER", "users", user.id, { email, role }, req.ip);

    res.status(201).json({ user, ...tokens });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || "dev_secret_change_me");
    if (decoded.type !== "refresh") {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const tokens = generateTokens(decoded.userId, decoded.role);
    res.json(tokens);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Refresh token expired" });
    }
    next(err);
  }
});

// GET /api/v1/auth/me
router.get("/me", authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
