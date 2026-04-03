// ═══════════════════════════════════════════════════════
// Insurance Routes — /api/v1/insurance
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notifications");

router.use(authenticate);

// GET /api/v1/insurance/claims
router.get("/claims", async (req, res, next) => {
  try {
    const { status, patient_id, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    // Patient can only see own claims
    if (req.user.role === "patient") {
      const pat = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (pat.rows.length > 0) { conditions.push(`ic.patient_id = $${idx++}`); params.push(pat.rows[0].id); }
    }

    if (status) { conditions.push(`ic.status = $${idx++}`); params.push(status); }
    if (patient_id) { conditions.push(`ic.patient_id = $${idx++}`); params.push(patient_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM insurance_claims ic ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT ic.*, p.name AS patient_name, h.name AS hospital_name
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN hospitals h ON ic.hospital_id = h.id
      ${where}
      ORDER BY ic.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({
      claims: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/insurance/claims/:id
router.get("/claims/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT ic.*, p.name AS patient_name, h.name AS hospital_name,
             u.name AS reviewer_name
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      LEFT JOIN hospitals h ON ic.hospital_id = h.id
      LEFT JOIN users u ON ic.reviewer_user_id = u.id
      WHERE ic.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Claim not found" });
    res.json({ claim: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/insurance/claims — Submit claim
router.post("/claims", authorize("superadmin", "hospital", "patient"), [
  body("patient_id").isInt(),
  body("treatment").trim().isLength({ min: 2 }),
  body("amount_claimed").isFloat({ min: 0.01 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { patient_id, plan, treatment, hospital_id, amount_claimed, documents, notes } = req.body;

    const result = await query(`
      INSERT INTO insurance_claims (patient_id, plan, treatment, hospital_id, amount_claimed, documents, notes)
      VALUES (?,?,?,?,?,?,?)
    `, [patient_id, plan, treatment, hospital_id, amount_claimed, documents || [], notes]);

    await auditLog(req.user.id, "SUBMIT_CLAIM", "insurance_claims", result.rows[0].id, { treatment, amount_claimed }, req.ip);
    res.status(201).json({ claim: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/insurance/claims/:id/review — Start review
router.patch(
  "/claims/:id/review",
  authorize("superadmin", "insurance"),
  [param("id").isInt()],
  async (req, res, next) => {
    try {

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: "Validation failed", details: errors.array() });
      }

      const result = await query(
        `UPDATE insurance_claims
         SET status = 'under-review',
             reviewer_user_id = $1,
             reviewed_at = NOW()
         WHERE id = $2
         AND status = 'pending'
         RETURNING *`,
        [req.user.id, req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Claim not found or not pending" });
      }

      const claim = result.rows[0];

      const pat = await query(
        `SELECT user_id FROM patients WHERE id = $1`,
        [claim.patient_id]
      );

      if (pat.rows.length && pat.rows[0].user_id) {
        await createNotification(
          pat.rows[0].user_id,
          "Claim Under Review",
          "Your insurance claim is now being reviewed",
          "info"
        );
      }

      await auditLog(
        req.user.id,
        "REVIEW_CLAIM",
        "insurance_claims",
        req.params.id,
        {},
        req.ip
      );

      res.json({ claim });

    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/insurance/claims/:id/approve — Approve with amount
router.patch(
  "/claims/:id/approve",
  authorize("superadmin", "insurance"),
  [
    param("id").isInt(),
    body("amount_approved").isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: "Validation failed", details: errors.array() });
      }

      const result = await query(
        `UPDATE insurance_claims
         SET status = 'approved',
             amount_approved = $1,
             reviewer_user_id = $2,
             reviewed_at = NOW()
         WHERE id = $3
         AND status IN ('pending','under-review')
         RETURNING *`,
        [req.body.amount_approved, req.user.id, req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Claim not found or cannot be approved" });
      }

      const claim = result.rows[0];

      const pat = await query(
        `SELECT user_id FROM patients WHERE id = $1`,
        [claim.patient_id]
      );

      if (pat.rows.length && pat.rows[0].user_id) {
        await createNotification(
          pat.rows[0].user_id,
          "Claim Approved",
          `Your insurance claim has been approved for $${req.body.amount_approved.toLocaleString()}`,
          "success"
        );
      }

      await auditLog(
        req.user.id,
        "APPROVE_CLAIM",
        "insurance_claims",
        req.params.id,
        { amount_approved: req.body.amount_approved },
        req.ip
      );

      res.json({ claim });

    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/insurance/claims/:id/reject
router.patch(
  "/claims/:id/reject",
  authorize("superadmin", "insurance"),
  [
    param("id").isInt(),
    body("rejection_reason").trim().isLength({ min: 5 }),
  ],
  async (req, res, next) => {
    try {

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({ error: "Validation failed", details: errors.array() });
      }

      const result = await query(
        `UPDATE insurance_claims
         SET status = 'rejected',
             rejection_reason = $1,
             reviewer_user_id = $2,
             reviewed_at = NOW()
         WHERE id = $3
         AND status IN ('pending','under-review')
         RETURNING *`,
        [req.body.rejection_reason, req.user.id, req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Claim not found or cannot be rejected" });
      }

      const claim = result.rows[0];

      const pat = await query(
        `SELECT user_id FROM patients WHERE id = $1`,
        [claim.patient_id]
      );

      if (pat.rows.length && pat.rows[0].user_id) {
        await createNotification(
          pat.rows[0].user_id,
          "Claim Rejected",
          `Your insurance claim was rejected: ${req.body.rejection_reason}`,
          "danger"
        );
      }

      await auditLog(
        req.user.id,
        "REJECT_CLAIM",
        "insurance_claims",
        req.params.id,
        { reason: req.body.rejection_reason },
        req.ip
      );

      res.json({ claim });

    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/v1/insurance/claims/:id/settle — Mark payment settled
router.patch(
  "/claims/:id/settle",
  authorize("superadmin", "insurance"),
  [param("id").isInt()],
  async (req, res, next) => {
    try {

      const result = await query(
        `UPDATE insurance_claims SET status = 'settled', settled_at = NOW()
       WHERE id = $1 AND status = 'approved' RETURNING *`,
        [req.params.id]
      );
      if (!result.rows.length) return res.status(404).json({ error: "Claim not found or not approved" });

      // Notify patient
      const pat = await query("SELECT user_id FROM patients WHERE id = $1", [result.rows[0].patient_id]);
      if (pat.rows.length > 0 && pat.rows[0].user_id) {
        await createNotification(pat.rows[0].user_id, "Claim Settled",
          `Your insurance payment of $${result.rows[0].amount_approved?.toLocaleString()} has been settled`, "success");
      }

      await auditLog(req.user.id, "SETTLE_CLAIM", "insurance_claims", req.params.id, {}, req.ip);
      res.json({ claim: result.rows[0] });
    } catch (err) { next(err); }
  });

// GET /api/v1/insurance/summary — Aggregate statistics
router.get("/summary", authorize("superadmin", "insurance"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total_claims,
        COALESCE(SUM(amount_claimed), 0) AS total_claimed,
        COALESCE(SUM(amount_approved), 0) AS total_approved,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'under-review') AS review_count,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
        COUNT(*) FILTER (WHERE status = 'settled') AS settled_count,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
      FROM insurance_claims
    `);
    res.json({ summary: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
