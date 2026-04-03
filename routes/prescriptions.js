// ═══════════════════════════════════════════════════════
// Prescription Routes — /api/v1/prescriptions
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query, getClient } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notifications");

router.use(authenticate);

// GET /api/v1/prescriptions
router.get("/", async (req, res, next) => {
  try {
    const { status, patient_id, doctor_id, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === "patient") {
      const pat = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (pat.rows.length > 0) { conditions.push(`rx.patient_id = $${idx++}`); params.push(pat.rows[0].id); }
    } else if (req.user.role === "doctor") {
      const doc = await query("SELECT id FROM doctors WHERE user_id = $1", [req.user.id]);
      if (doc.rows.length > 0) { conditions.push(`rx.doctor_id = $${idx++}`); params.push(doc.rows[0].id); }
    } else if (req.user.role === "pharmacy") {
      const ph = await query("SELECT id FROM pharmacies WHERE user_id = $1", [req.user.id]);
      if (ph.rows.length > 0) { conditions.push(`rx.pharmacy_id = $${idx++}`); params.push(ph.rows[0].id); }
    }

    if (status) { conditions.push(`rx.status = $${idx++}`); params.push(status); }
    if (patient_id) { conditions.push(`rx.patient_id = $${idx++}`); params.push(patient_id); }
    if (doctor_id) { conditions.push(`rx.doctor_id = $${idx++}`); params.push(doctor_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM prescriptions rx ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT rx.*, p.name AS patient_name, d.name AS doctor_name, ph.name AS pharmacy_name
      FROM prescriptions rx
      JOIN patients p ON rx.patient_id = p.id
      JOIN doctors d ON rx.doctor_id = d.id
      LEFT JOIN pharmacies ph ON rx.pharmacy_id = ph.id
      ${where}
      ORDER BY rx.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    // Attach items to each prescription
    const prescriptions = [];
    for (const rx of result.rows) {
      const items = await query(
        "SELECT * FROM prescription_items WHERE prescription_id = $1 ORDER BY medication",
        [rx.id]
      );
      prescriptions.push({ ...rx, medications: items.rows });
    }

    res.json({ prescriptions, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/v1/prescriptions/:id
router.get("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT rx.*, p.name AS patient_name, d.name AS doctor_name, ph.name AS pharmacy_name
      FROM prescriptions rx
      JOIN patients p ON rx.patient_id = p.id
      JOIN doctors d ON rx.doctor_id = d.id
      LEFT JOIN pharmacies ph ON rx.pharmacy_id = ph.id
      WHERE rx.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Prescription not found" });

    const items = await query("SELECT * FROM prescription_items WHERE prescription_id = $1", [req.params.id]);
    res.json({ prescription: { ...result.rows[0], medications: items.rows } });
  } catch (err) { next(err); }
});

// POST /api/v1/prescriptions — Doctor writes prescription
router.post("/", authorize("superadmin", "doctor"), [
  body("patient_id").isInt(),
  body("medications").isArray({ min: 1 }),
  body("medications.*.medication").trim().isLength({ min: 1 }),
  body("medications.*.dosage").trim().isLength({ min: 1 }),
  body("medications.*.frequency").trim().isLength({ min: 1 }),
], async (req, res, next) => {
  const client = await getClient();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    await client.query("BEGIN");

    const { patient_id, pharmacy_id, medications, notes } = req.body;

    // Get doctor_id from logged-in user
    let doctor_id = req.body.doctor_id;
    if (!doctor_id && req.user.role === "doctor") {
      const doc = await client.query("SELECT id FROM doctors WHERE user_id = $1", [req.user.id]);
      if (doc.rows.length > 0) doctor_id = doc.rows[0].id;
    }
    if (!doctor_id) return res.status(400).json({ error: "doctor_id is required" });

    const rxResult = await client.query(`
      INSERT INTO prescriptions (patient_id, doctor_id, pharmacy_id, notes)
      VALUES (?, ?, ?, ?)
    `, [patient_id, doctor_id, pharmacy_id, notes]);

    const rxId = rxResult.rows[0].id;

    for (const med of medications) {
      await client.query(`
        INSERT INTO prescription_items (prescription_id, medication, dosage, frequency, duration, instructions, quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [rxId, med.medication, med.dosage, med.frequency, med.duration, med.instructions, med.quantity || 1]);
    }

    await client.query("COMMIT");

    // Notify pharmacy
    if (pharmacy_id) {
      const ph = await query("SELECT user_id FROM pharmacies WHERE id = $1", [pharmacy_id]);
      if (ph.rows.length > 0 && ph.rows[0].user_id) {
        await createNotification(ph.rows[0].user_id, "New Prescription",
          `New prescription with ${medications.length} medication(s)`, "info");
      }
    }

    // Notify patient
    const pat = await query("SELECT user_id FROM patients WHERE id = $1", [patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "New Prescription",
        "Your doctor has written a new prescription", "info");
    }

    await auditLog(req.user.id, "CREATE_PRESCRIPTION", "prescriptions", rxId, { patient_id, medications: medications.length }, req.ip);

    // Fetch the full record
    const items = await query("SELECT * FROM prescription_items WHERE prescription_id = $1", [rxId]);
    res.status(201).json({ prescription: { ...rxResult.rows[0], medications: items.rows } });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/v1/prescriptions/:id/dispense — Pharmacy dispenses
router.patch("/:id/dispense", authorize("superadmin", "pharmacy"), [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE prescriptions SET status = 'dispensed', dispensed_at = NOW()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Prescription not found or already dispensed" });

    const rx = result.rows[0];

    // Notify patient
    const pat = await query("SELECT user_id FROM patients WHERE id = $1", [rx.patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "Prescription Dispensed",
        "Your prescription has been dispensed and is ready for pickup", "success");
    }

    await auditLog(req.user.id, "DISPENSE_PRESCRIPTION", "prescriptions", req.params.id, {}, req.ip);
    res.json({ prescription: rx });
  } catch (err) { next(err); }
});

module.exports = router;
