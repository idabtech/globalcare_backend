// ═══════════════════════════════════════════════════════
// Lab Routes — /api/v1/labs
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notifications");

router.use(authenticate);

// GET /api/v1/labs/reports — List lab reports
router.get("/reports", async (req, res, next) => {
  try {
    const { status, patient_id, doctor_id, urgent, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    // Role-based scoping
    if (req.user.role === "lab") {
      const labResult = await query("SELECT id FROM labs WHERE user_id = $1", [req.user.id]);
      if (labResult.rows.length > 0) { conditions.push(`lr.lab_id = $${idx++}`); params.push(labResult.rows[0].id); }
    } else if (req.user.role === "doctor") {
      const docResult = await query("SELECT id FROM doctors WHERE user_id = $1", [req.user.id]);
      if (docResult.rows.length > 0) { conditions.push(`lr.doctor_id = $${idx++}`); params.push(docResult.rows[0].id); }
    } else if (req.user.role === "patient") {
      const patResult = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (patResult.rows.length > 0) { conditions.push(`lr.patient_id = $${idx++}`); params.push(patResult.rows[0].id); }
    }

    if (status) { conditions.push(`lr.status = $${idx++}`); params.push(status); }
    if (patient_id) { conditions.push(`lr.patient_id = $${idx++}`); params.push(patient_id); }
    if (doctor_id) { conditions.push(`lr.doctor_id = $${idx++}`); params.push(doctor_id); }
    if (urgent === "true") { conditions.push(`lr.urgent = TRUE`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM lab_reports lr ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT lr.*, p.name AS patient_name, d.name AS doctor_name, l.name AS lab_name
      FROM lab_reports lr
      JOIN patients p ON lr.patient_id = p.id
      JOIN doctors d ON lr.doctor_id = d.id
      LEFT JOIN labs l ON lr.lab_id = l.id
      ${where}
      ORDER BY lr.urgent DESC, lr.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({
      reports: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/labs/reports/:id
router.get("/reports/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT lr.*, p.name AS patient_name, d.name AS doctor_name, l.name AS lab_name
      FROM lab_reports lr
      JOIN patients p ON lr.patient_id = p.id
      JOIN doctors d ON lr.doctor_id = d.id
      LEFT JOIN labs l ON lr.lab_id = l.id
      WHERE lr.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Lab report not found" });
    res.json({ report: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/labs/reports — Order a lab test
router.post("/reports", authorize("superadmin", "hospital", "doctor"), [
  body("patient_id").isInt(),
  body("doctor_id").isInt(),
  body("test_name").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { patient_id, doctor_id, lab_id, test_name, test_category, sample_type, urgent, notes } = req.body;
    const result = await query(`
      INSERT INTO lab_reports (patient_id, doctor_id, lab_id, test_name, test_category, sample_type, urgent, notes)
      VALUES (?,?,?,?,?,?,?,?)
    `, [patient_id, doctor_id, lab_id, test_name, test_category, sample_type, urgent || false, notes]);

    // Notify lab
    if (lab_id) {
      const lab = await query("SELECT user_id FROM labs WHERE id = $1", [lab_id]);
      if (lab.rows.length > 0 && lab.rows[0].user_id) {
        await createNotification(lab.rows[0].user_id, "New Lab Order",
          `${urgent ? "URGENT: " : ""}New ${test_name} test ordered`, urgent ? "warning" : "info");
      }
    }

    await auditLog(req.user.id, "ORDER_LAB_TEST", "lab_reports", result.rows[0].id, { test_name, urgent }, req.ip);
    res.status(201).json({ report: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/labs/reports/:id/process — Start processing
router.patch("/reports/:id/process", authorize("superadmin", "lab"), [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE lab_reports SET status = 'processing' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Report not found or already processing" });
    await auditLog(req.user.id, "PROCESS_LAB_REPORT", "lab_reports", req.params.id, {}, req.ip);
    res.json({ report: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/labs/reports/:id/complete — Upload results & mark complete
router.patch("/reports/:id/complete", authorize("superadmin", "lab"), [
  param("id").isInt(),
  body("results").isObject(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { results, notes } = req.body;
    const result = await query(
      `UPDATE lab_reports SET status = 'completed', results = $1, notes = COALESCE($2, notes), completed_at = NOW()
       WHERE id = $3 AND status IN ('pending', 'processing') RETURNING *`,
      [JSON.stringify(results), notes, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Report not found or already completed" });

    const report = result.rows[0];

    // Notify doctor
    const doc = await query("SELECT user_id FROM doctors WHERE id = $1", [report.doctor_id]);
    if (doc.rows.length > 0 && doc.rows[0].user_id) {
      await createNotification(doc.rows[0].user_id, "Lab Results Ready",
        `${report.test_name} results are ready for review`, "success");
    }

    // Notify patient
    const pat = await query("SELECT user_id FROM patients WHERE id = $1", [report.patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "Lab Results Available",
        `Your ${report.test_name} results are now available`, "info");
    }

    await auditLog(req.user.id, "COMPLETE_LAB_REPORT", "lab_reports", req.params.id, { test_name: report.test_name }, req.ip);
    res.json({ report });
  } catch (err) { next(err); }
});

// GET /api/v1/labs/stats — Lab statistics
router.get("/stats", authorize("superadmin", "lab"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE urgent = TRUE AND status != 'completed') AS urgent_pending
      FROM lab_reports
    `);
    res.json({ stats: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
