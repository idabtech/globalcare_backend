// ═══════════════════════════════════════════════════════
// Hospital Routes — /api/v1/hospitals
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { cacheInvalidate } = require("../config/redis");

router.use(authenticate);

// GET /api/v1/hospitals
router.get("/", async (req, res, next) => {
  try {
    const { city, search, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (city) { conditions.push(`h.city ILIKE $${idx++}`); params.push(`%${city}%`); }
    if (search) { conditions.push(`(h.name ILIKE $${idx} OR h.city ILIKE $${idx})`); params.push(`%${search}%`); idx++; }

    const where = conditions.length ? -`WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM hospitals h ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT h.*,
        (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = h.id) AS doctor_count,
        (SELECT COUNT(*) FROM departments dp WHERE dp.hospital_id = h.id) AS department_count
      FROM hospitals h ${where}
      ORDER BY h.rating DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({
      hospitals: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/hospitals/:id
router.get("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT h.*,
        (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = h.id) AS doctor_count,
        (SELECT COUNT(*) FROM departments dp WHERE dp.hospital_id = h.id) AS department_count,
        (SELECT COUNT(*) FROM patients p WHERE p.assigned_hospital = h.id AND p.status = 'active') AS active_patients
      FROM hospitals h WHERE h.id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: "Hospital not found" });

    const depts = await query("SELECT * FROM departments WHERE hospital_id = $1 ORDER BY name", [req.params.id]);
    const docs = await query(
      "SELECT id, name, specialization, experience_yrs, consultation_fee FROM doctors WHERE hospital_id = $1 AND is_active = TRUE ORDER BY name",
      [req.params.id]
    );

    res.json({ hospital: result.rows[0], departments: depts.rows, doctors: docs.rows });
  } catch (err) { next(err); }
});

// POST /api/v1/hospitals
router.post("/", authorize("superadmin"), [
  body("name").trim().isLength({ min: 2 }),
  body("city").trim().isLength({ min: 2 }),
  body("total_beds").isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { name, city, state, country, address, phone, email, total_beds, available_beds,
      rating, accreditation, specialties } = req.body;
    const result = await query(`
  INSERT INTO hospitals (name, city, state, country, address, phone, email,
    total_beds, available_beds, rating, accreditation, specialties)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`, [
      name,
      city,
      state,
      country || "India",
      address,
      phone,
      email,
      total_beds,
      available_beds || total_beds,
      rating || 0,
      accreditation,
      JSON.stringify([specialties] || [])
    ]);

    const insertedId = result.insertId;

    const hospital = await query(
      `SELECT * FROM hospitals WHERE id = ?`,
      [insertedId]
    );

    // await cacheInvalidate("hospitals:*");
    await auditLog(req.user.id, "CREATE_HOSPITAL", "hospitals", insertedId, { name, city }, req.ip);
    res.status(201).json({ hospital: hospital[0] });
  } catch (err) { next(err); }
});

// PUT /api/v1/hospitals/:id
router.put("/:id", authorize("superadmin", "hospital"), [param("id").isInt()], async (req, res, next) => {
  try {
    const fields = req.body;
    const allowed = ["name", "city", "state", "country", "address", "phone", "email",
      "total_beds", "available_beds", "rating", "accreditation", "specialties", "is_active"];
    const updates = []; const params = []; let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) { updates.push(`${key} = $${idx++}`); params.push(fields[key]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: "No valid fields to update" });
    params.push(req.params.id);
    const result = await query(`UPDATE hospitals SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ error: "Hospital not found" });
    await cacheInvalidate("hospitals:*");
    await auditLog(req.user.id, "UPDATE_HOSPITAL", "hospitals", req.params.id, fields, req.ip);
    res.json({ hospital: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/hospitals/:id/beds
router.patch("/:id/beds", authorize("superadmin", "hospital"), [
  param("id").isInt(), body("available_beds").isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const result = await query(
      "UPDATE hospitals SET available_beds = $1 WHERE id = $2 RETURNING id, name, total_beds, available_beds",
      [req.body.available_beds, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Hospital not found" });
    res.json({ hospital: result.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/v1/hospitals/:id/departments
router.get("/:id/departments", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM departments WHERE hospital_id = $1 ORDER BY name", [req.params.id]);
    res.json({ departments: result.rows });
  } catch (err) { next(err); }
});

// POST /api/v1/hospitals/:id/departments
router.post("/:id/departments", authorize("superadmin", "hospital"), [
  param("id").isInt(), body("name").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });
    const { name, head_doctor, bed_count, floor, phone_ext } = req.body;
    const result = await query(
      `INSERT INTO departments (hospital_id, name, head_doctor, bed_count, floor, phone_ext)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, name, head_doctor, bed_count || 0, floor, phone_ext]
    );
    await auditLog(req.user.id, "CREATE_DEPARTMENT", "departments", result.rows[0].id, { name }, req.ip);
    res.status(201).json({ department: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/v1/hospitals/:id
router.delete("/:id", authorize("superadmin"), [param("id").isInt()], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: "Invalid hospital ID" });
    }

    const hospitalId = req.params.id;

    // Check if hospital exists
    const existing = await query(
      "SELECT id, name FROM hospitals WHERE id = ?",
      [hospitalId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    // Delete hospital
    await query("DELETE FROM hospitals WHERE id = ?", [hospitalId]);

    // Optional: clear cache
    // await cacheInvalidate("hospitals:*");

    // Audit log
    await auditLog(
      req.user.id,
      "DELETE_HOSPITAL",
      "hospitals",
      hospitalId,
      { name: existing.name },
      req.ip
    );

    res.json({ message: "Hospital deleted successfully" });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
