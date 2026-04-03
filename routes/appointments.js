// ═══════════════════════════════════════════════════════
// Appointment Routes — /api/v1/appointments
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { createNotification, sendEmail } = require("../utils/notifications");
const { cacheInvalidate } = require("../config/redis");

router.use(authenticate);

// GET /api/v1/appointments
router.get("/", async (req, res, next) => {
  try {
    const { status, patient_id, doctor_id, hospital_id, date_from, date_to, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    // Role-based scoping
    if (req.user.role === "patient") {
      const pat = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (pat.rows.length > 0) { conditions.push(`a.patient_id = $${idx++}`); params.push(pat.rows[0].id); }
    } else if (req.user.role === "doctor") {
      const doc = await query("SELECT id FROM doctors WHERE user_id = $1", [req.user.id]);
      if (doc.rows.length > 0) { conditions.push(`a.doctor_id = $${idx++}`); params.push(doc.rows[0].id); }
    } else if (req.user.role === "hospital") {
      const hosp = await query("SELECT id FROM hospitals WHERE user_id = $1", [req.user.id]);
      if (hosp.rows.length > 0) { conditions.push(`a.hospital_id = $${idx++}`); params.push(hosp.rows[0].id); }
    }

    if (status) { conditions.push(`a.status = $${idx++}`); params.push(status); }
    if (patient_id) { conditions.push(`a.patient_id = $${idx++}`); params.push(patient_id); }
    if (doctor_id) { conditions.push(`a.doctor_id = $${idx++}`); params.push(doctor_id); }
    if (hospital_id) { conditions.push(`a.hospital_id = $${idx++}`); params.push(hospital_id); }
    if (date_from) { conditions.push(`a.appt_date >= $${idx++}`); params.push(date_from); }
    if (date_to) { conditions.push(`a.appt_date <= $${idx++}`); params.push(date_to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM appointments a ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT a.*, p.name AS patient_name, d.name AS doctor_name, h.name AS hospital_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN hospitals h ON a.hospital_id = h.id
      ${where}
      ORDER BY a.appt_date DESC, a.appt_time DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({
      appointments: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/appointments/:id
router.get("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT a.*, p.name AS patient_name, d.name AS doctor_name, h.name AS hospital_name
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      JOIN hospitals h ON a.hospital_id = h.id
      WHERE a.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json({ appointment: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/appointments — Book an appointment
router.post("/", [
  body("patient_id").isInt(),
  body("doctor_id").isInt(),
  body("hospital_id").isInt(),
  body("appt_date").isDate(),
  body("appt_time").matches(/^\d{2}:\d{2}$/),
  body("type").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {
    console.log("Appointment booking request:", req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { patient_id, doctor_id, hospital_id, appt_date, appt_time, type, notes } = req.body;

    // Check for scheduling conflicts
    const conflict = await query(
      `SELECT id FROM appointments
       WHERE doctor_id = $1 AND appt_date = $2 AND appt_time = $3 AND status NOT IN ('cancelled')`,
      [doctor_id, appt_date, appt_time]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ error: "Doctor already has an appointment at this time" });
    }

    const result = await query(`
  INSERT INTO appointments (patient_id, doctor_id, hospital_id, appt_date, appt_time, type, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`, [patient_id, doctor_id, hospital_id, appt_date, appt_time, type, notes]);

    // 🔥 Get inserted ID
    const insertId = result.insertId;

    // 🔥 Fetch inserted row
    const rows = await query(
      `SELECT * FROM appointments WHERE id = ?`,
      [insertId]
    );

    const appt = rows.rows[0];
    console.log("Appointment created:", appt);
    // Notify doctor
    const doc = await query("SELECT user_id FROM doctors WHERE id = $1", [doctor_id]);
    if (doc.rows.length > 0 && doc.rows[0].user_id) {
      await createNotification(doc.rows[0].user_id, "New Appointment", `New ${type} appointment on ${appt_date}`, "info", `/appointments/${appt.id}`);
    }

    // await cacheInvalidate("appointments:*");
    // await auditLog(req.user.id, "CREATE_APPOINTMENT", "appointments", appt.id, { patient_id, doctor_id, appt_date }, req.ip);

    res.status(201).json({ appointment: appt });
  } catch (err) { next(err); }
});

// PATCH /api/v1/appointments/:id/confirm
router.patch("/:id/confirm", authorize("superadmin", "hospital", "doctor"), [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found or not pending" });

    // Notify patient
    const pat = await query("SELECT user_id FROM patients WHERE id = $1", [result.rows[0].patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "Appointment Confirmed", `Your appointment has been confirmed`, "success");
    }

    await auditLog(req.user.id, "CONFIRM_APPOINTMENT", "appointments", req.params.id, {}, req.ip);
    res.json({ appointment: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/appointments/:id/cancel
router.patch("/:id/cancel", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND status IN ('pending', 'confirmed') RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found or cannot be cancelled" });

    await auditLog(req.user.id, "CANCEL_APPOINTMENT", "appointments", req.params.id, {}, req.ip);
    res.json({ appointment: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/appointments/:id/complete
router.patch("/:id/complete", authorize("superadmin", "doctor"), [param("id").isInt()], async (req, res, next) => {
  try {
    const { diagnosis, follow_up } = req.body;
    const result = await query(
      `UPDATE appointments SET status = 'completed', diagnosis = $2, follow_up = $3
       WHERE id = $1 AND status = 'confirmed' RETURNING *`,
      [req.params.id, diagnosis, follow_up]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found or not confirmed" });

    await auditLog(req.user.id, "COMPLETE_APPOINTMENT", "appointments", req.params.id, { diagnosis }, req.ip);
    res.json({ appointment: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/appointments/:id/reschedule
router.patch("/:id/reschedule", [
  param("id").isInt(),
  body("appt_date").isDate(),
  body("appt_time").matches(/^\d{2}:\d{2}$/),],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(422).json({
          error: "Validation failed",
          details: errors.array(),
        });
      }
      const { appt_date, appt_time } = req.body;
      const appointmentId = req.params.id;

      // 🔥 Get existing appointment
      const existing = await query(
        `SELECT * FROM appointments WHERE id = ?`,
        [appointmentId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      console.log("Existing appointment:", existing.rows[0]);
      const appt = existing.rows[0];

      // ❌ Do not allow reschedule if cancelled/completed
      if (["completed"].includes(appt.status)) {
        return res
          .status(400)
          .json({ error: "Cannot reschedule this appointment" });
      }

      // 🔥 Check conflict
      const conflict = await query(
        `SELECT id FROM appointments
         WHERE doctor_id = ?
         AND appt_date = ?
         AND appt_time = ?
         AND id != ? 
         AND status NOT IN ('cancelled')`,
        [appt.doctor_id, appt_date, appt_time, appointmentId]
      );

      if (conflict.rows.length > 0) {
        return res.status(409).json({
          error: "Doctor already has an appointment at this time",
        });
      }
      console.log("No conflict found");

      // 🔥 Update appointment
      await query(
        `UPDATE appointments
         SET appt_date = ?, appt_time = ?, status = 'pending'
         WHERE id = ?`,
        [appt_date, appt_time, appointmentId]
      );

      // 🔥 Fetch updated data
      const updated = await query(
        `SELECT * FROM appointments WHERE id = ?`,
        [appointmentId]
      );

      const updatedAppt = updated.rows[0];

      // 🔔 Notify doctor
      const doc = await query(
        `SELECT user_id FROM doctors WHERE id = ?`,
        [updatedAppt.doctor_id]
      );

      if (doc.rows.length > 0 && doc.rows[0].user_id) {
        await createNotification(
          doc.rows[0].user_id,
          "Appointment Rescheduled",
          `Appointment rescheduled to ${appt_date} ${appt_time}`,
          "info",
          `/appointments/${appointmentId}`
        );
      }

      res.json({ appointment: updatedAppt });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
