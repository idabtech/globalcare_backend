// ═══════════════════════════════════════════════════════
// Patient Routes — /api/v1/patients
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, query: checkQuery, validationResult } = require("express-validator");
const { query, getClient } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { cacheGet, cacheInvalidate } = require("../config/redis");

// All routes require authentication
router.use(authenticate);

// GET /api/v1/patients — List with filtering & pagination
router.get("/", authorize("superadmin", "hospital", "doctor", "lab", "travel", "insurance"), async (req, res, next) => {
  try {
    const { status, country, hospital, doctor, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Role-based filtering
    if (req.user.role === "doctor") {
      const docResult = await query("SELECT id FROM doctors WHERE user_id = $1", [req.user.id]);
      if (docResult.rows.length > 0) {
        conditions.push(`p.assigned_doctor = $${paramIdx++}`);
        params.push(docResult.rows[0].id);
      }
    } else if (req.user.role === "hospital") {
      const hospResult = await query("SELECT id FROM hospitals WHERE user_id = $1", [req.user.id]);
      if (hospResult.rows.length > 0) {
        conditions.push(`p.assigned_hospital = $${paramIdx++}`);
        params.push(hospResult.rows[0].id);
      }
    }

    if (status) { conditions.push(`p.status = $${paramIdx++}`); params.push(status); }
    if (country) { conditions.push(`p.country ILIKE $${paramIdx++}`); params.push(`%${country}%`); }
    if (hospital) { conditions.push(`p.assigned_hospital = $${paramIdx++}`); params.push(hospital); }
    if (doctor) { conditions.push(`p.assigned_doctor = $${paramIdx++}`); params.push(doctor); }
    if (search) { conditions.push(`(p.name ILIKE $${paramIdx} OR p.email ILIKE $${paramIdx})`); params.push(`%${search}%`); paramIdx++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(`SELECT COUNT(*) FROM patients p ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT p.*, 
             h.name AS hospital_name, 
             d.name AS doctor_name
      FROM patients p
      LEFT JOIN hospitals h ON p.assigned_hospital = h.id
      LEFT JOIN doctors d ON p.assigned_doctor = d.id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx}
    `, params);

    res.json({
      patients: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/patients/:id — Single patient with full details
router.get("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT p.*, h.name AS hospital_name, d.name AS doctor_name
      FROM patients p
      LEFT JOIN hospitals h ON p.assigned_hospital = h.id
      LEFT JOIN doctors d ON p.assigned_doctor = d.id
      WHERE p.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Patient not found" });

    // If patient role, can only view own record
    if (req.user.role === "patient") {
      const pat = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (pat.rows.length === 0 || pat.rows[0].id !== req.params.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    res.json({ patient: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/patients — Create new patient
router.post("/", authorize("superadmin", "hospital"), [
  body("name").trim().isLength({ min: 2 }),
  body("email").optional().isEmail(),
  body("country").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { name, email, phone, date_of_birth, age, gender, blood_group, country,
      nationality, passport_no, address, emergency_contact, emergency_phone,
      conditions, allergies, current_treatment, assigned_hospital, assigned_doctor,
      insurance_plan, notes } = req.body;

    const result = await query(`
  INSERT INTO patients (
    name, email, phone, date_of_birth, age, gender, blood_group,
    country, nationality, passport_no, address, emergency_contact,
    emergency_phone, conditions, allergies, current_treatment,
    assigned_hospital, assigned_doctor, insurance_plan, notes
  )
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`, [
      name, email, phone, date_of_birth, age, gender, blood_group,
      country, nationality, passport_no, address, emergency_contact,
      emergency_phone,
      JSON.stringify(conditions || []),
      JSON.stringify(allergies || []),
      current_treatment,
      assigned_hospital,
      assigned_doctor,
      insurance_plan,
      notes
    ]);

    // 👇 get inserted patient
    const insertedPatient = await query(
      `SELECT * FROM patients WHERE id = ?`,
      [result.insertId]
    );
    console.log(insertedPatient);
    // await cacheInvalidate("patients:*");
    await auditLog(req.user.id, "CREATE_PATIENT", "patients", insertedPatient.rows[0].id, { name }, req.ip);

    res.status(201).json({ patient: insertedPatient[0] });
  } catch (err) { next(err); }
});

// PUT /api/v1/patients/:id — Update patient
router.put("/:id", authorize("superadmin", "hospital", "doctor"), [
  param("id").isInt(),
], async (req, res, next) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const fields = req.body;

    const allowed = [
      "name", "email", "phone", "age", "gender", "blood_group", "country",
      "conditions", "allergies", "current_treatment",
      "assigned_hospital", "assigned_doctor",
      "status", "travel_status", "insurance_plan", "notes"
    ];

    const updates = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = $${idx++}`);
        params.push(fields[key]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    params.push(req.params.id);

    const result = await query(
      `UPDATE patients 
       SET ${updates.join(", ")}
       WHERE id = $${idx}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    await cacheInvalidate("patients:*");
    await auditLog(req.user.id, "UPDATE_PATIENT", "patients", req.params.id, fields, req.ip);

    res.json({ patient: result.rows[0] });

  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/patients/:id
router.delete("/:id", authorize("superadmin"), [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query("DELETE FROM patients WHERE id = $1 RETURNING id", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Patient not found" });

    await cacheInvalidate("patients:*");
    await auditLog(req.user.id, "DELETE_PATIENT", "patients", req.params.id, {}, req.ip);

    res.json({ message: "Patient deleted", id: req.params.id });
  } catch (err) { next(err); }
});

module.exports = router;
