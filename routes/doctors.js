// ═══════════════════════════════════════════════════════
// Doctor Routes — /api/v1/doctors
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");

router.use(authenticate);

// GET /api/v1/doctors
router.get("/", async (req, res, next) => {
  try {
    const { hospital_id, specialization, search, page = 1, limit = 20 } = req.query;
    const conditions = ["d.is_active = TRUE"];
    const params = [];
    let idx = 1;

    if (hospital_id) { conditions.push(`d.hospital_id = $${idx++}`); params.push(hospital_id); }
    if (specialization) { conditions.push(`d.specialization ILIKE $${idx++}`); params.push(`%${specialization}%`); }
    if (search) { conditions.push(`(d.name ILIKE $${idx} OR d.specialization ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const countResult = await query(`SELECT COUNT(*) FROM doctors d ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT d.*, h.name AS hospital_name, dep.name AS department_name
      FROM doctors d
      LEFT JOIN hospitals h ON d.hospital_id = h.id
      LEFT JOIN departments dep ON d.department_id = dep.id
      ${where} ORDER BY d.name LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({ doctors: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/v1/doctors/:id
router.get("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT d.*, h.name AS hospital_name, dep.name AS department_name,
        (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.status = 'confirmed') AS upcoming_appointments,
        (SELECT COUNT(*) FROM patients p WHERE p.assigned_doctor = d.id AND p.status = 'active') AS active_patients
      FROM doctors d
      LEFT JOIN hospitals h ON d.hospital_id = h.id
      LEFT JOIN departments dep ON d.department_id = dep.id
      WHERE d.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Doctor not found" });
    res.json({ doctor: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/doctors
router.post("/", authorize("superadmin", "hospital"), [
  body("name").trim().isLength({ min: 2 }),
  body("hospital_id").isInt(),
  body("specialization").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        error: "Validation failed",
        details: errors.array()
      });
    }

    const {
      user_id,
      hospital_id,
      department_id,
      name,
      specialization,
      license_no,
      qualification,
      experience_yrs,
      consultation_fee,
      available_days,
      available_from,
      available_to
    } = req.body;

    // INSERT
    const result = await query(`
    INSERT INTO doctors
    (user_id, hospital_id, department_id, name, specialization, license_no,
    qualification, experience_yrs, consultation_fee, available_days, available_from, available_to)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      user_id || null,
      hospital_id,
      department_id || null,
      name,
      specialization,
      license_no,
      qualification,
      experience_yrs || 0,
      consultation_fee || 0,
      JSON.stringify(available_days || []),
      available_from,
      available_to
    ]);

    // GET inserted doctor
    const doctor = await query(
      `SELECT * FROM doctors WHERE id = ?`,
      [result.insertId]
    );

    await auditLog(
      req.user.id,
      "CREATE_DOCTOR",
      "doctors",
      result.insertId,
      { name },
      req.ip
    );

    res.status(201).json({
      doctor: doctor[0]
    });

  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/doctors/:id
router.put("/:id",
  authorize("superadmin", "hospital", "doctor"),
  [param("id").isInt()],
  async (req, res, next) => {
    try {

      const allowed = [
        "name",
        "specialization",
        "license_no",
        "qualification",
        "experience_yrs",
        "consultation_fee",
        "available_days",
        "available_from",
        "available_to",
        "department_id",
        "is_active"
      ];

      const updates = [];
      const params = [];

      for (const key of allowed) {
        if (req.body[key] !== undefined) {

          let value = req.body[key];

          // ✅ convert array to JSON
          if (key === "available_days" && Array.isArray(value)) {
            value = JSON.stringify(value);
          }

          updates.push(`${key} = ?`);
          params.push(value);
        }
      }

      if (!updates.length) {
        return res.status(400).json({ error: "No valid fields" });
      }

      params.push(req.params.id);

      const result = await query(
        `UPDATE doctors SET ${updates.join(", ")} WHERE id = ?`,
        params
      );

      if (!result.rowCount) {
        return res.status(404).json({ error: "Doctor not found" });
      }

      res.json({ message: "Doctor updated successfully" });

    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/doctors/:id/schedule
router.get("/:id/schedule", [param("id").isInt()], async (req, res, next) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = ""; const params = [req.params.id];
    if (date_from) { dateFilter += " AND a.appt_date >= $2"; params.push(date_from); }
    if (date_to) { dateFilter += ` AND a.appt_date <= $${params.length + 1}`; params.push(date_to); }
    const result = await query(`
      SELECT a.*, p.name AS patient_name, h.name AS hospital_name
      FROM appointments a JOIN patients p ON a.patient_id = p.id JOIN hospitals h ON a.hospital_id = h.id
      WHERE a.doctor_id = $1 AND a.status NOT IN ('cancelled') ${dateFilter}
      ORDER BY a.appt_date, a.appt_time
    `, params);
    res.json({ schedule: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/doctors/:id/patients
router.get("/:id/patients", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, h.name AS hospital_name FROM patients p
      LEFT JOIN hospitals h ON p.assigned_hospital = h.id
      WHERE p.assigned_doctor = $1 ORDER BY p.status, p.name
    `, [req.params.id]);
    res.json({ patients: result.rows });
  } catch (err) { next(err); }
});

// DELETE /api/v1/doctors/:id
router.delete("/:id",
  authorize("superadmin", "hospital"),
  [param("id").isInt()],
  async (req, res, next) => {
    try {

      const result = await query(
        `UPDATE doctors SET is_active = FALSE WHERE id = ?`,
        [req.params.id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: "Doctor not found"
        });
      }

      await auditLog(
        req.user.id,
        "DELETE_DOCTOR",
        "doctors",
        req.params.id,
        {},
        req.ip
      );

      res.json({
        message: "Doctor deleted successfully"
      });

    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
