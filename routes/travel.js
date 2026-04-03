// ═══════════════════════════════════════════════════════
// Travel Routes — /api/v1/travel
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { body, param, validationResult } = require("express-validator");
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { auditLog } = require("../utils/auditLogger");
const { createNotification } = require("../utils/notifications");

router.use(authenticate);

// GET /api/v1/travel/bookings
router.get("/bookings", async (req, res, next) => {
  try {
    const { status, visa_status, patient_id, page = 1, limit = 20 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role === "patient") {
      const pat = await query("SELECT id FROM patients WHERE user_id = $1", [req.user.id]);
      if (pat.rows.length > 0) { conditions.push(`tb.patient_id = $${idx++}`); params.push(pat.rows[0].id); }
    } else if (req.user.role === "travel") {
      conditions.push(`tb.agent_user_id = $${idx++}`); params.push(req.user.id);
    }

    if (status) { conditions.push(`tb.status = $${idx++}`); params.push(status); }
    if (visa_status) { conditions.push(`tb.visa_status = $${idx++}`); params.push(visa_status); }
    if (patient_id) { conditions.push(`tb.patient_id = $${idx++}`); params.push(patient_id); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM travel_bookings tb ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT tb.*, p.name AS patient_name, p.country AS patient_country
      FROM travel_bookings tb
      JOIN patients p ON tb.patient_id = p.id
      ${where}
      ORDER BY tb.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({ bookings: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/v1/travel/bookings/:id
router.get("/bookings/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(`
      SELECT tb.*, p.name AS patient_name, p.country AS patient_country, p.passport_no
      FROM travel_bookings tb JOIN patients p ON tb.patient_id = p.id WHERE tb.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Booking not found" });
    res.json({ booking: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/v1/travel/bookings
router.post("/bookings", authorize("superadmin", "travel", "hospital"), [
  body("patient_id").isInt(),
  body("origin").trim().isLength({ min: 2 }),
  body("destination").trim().isLength({ min: 2 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: "Validation failed", details: errors.array() });

    const { patient_id, origin, destination, flight_in, flight_out, hotel,
      hotel_checkin, hotel_checkout, companion, special_needs, total_cost, notes } = req.body;

    const result = await query(`
      INSERT INTO travel_bookings (patient_id, agent_user_id, origin, destination, flight_in, flight_out,
        hotel, hotel_checkin, hotel_checkout, companion, special_needs, total_cost, notes, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [patient_id, req.user.id, origin, destination, flight_in, flight_out,
      hotel, hotel_checkin, hotel_checkout, companion, special_needs, total_cost, notes]);

    // Update patient travel_status
    await query("UPDATE patients SET travel_status = 'booked' WHERE id = ?", [patient_id]);

    // Notify patient
    const pat = await query("SELECT user_id FROM patients WHERE id = ?", [patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "Travel Booked",
        `Your travel to ${destination} has been booked`, "success");
    }

    await auditLog(req.user.id, "CREATE_TRAVEL_BOOKING", "travel_bookings", result.rows[0].id, { patient_id, destination }, req.ip);
    res.status(201).json({ booking: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/v1/travel/bookings/:id
router.put("/bookings/:id", authorize("superadmin", "travel"), [param("id").isInt()], async (req, res, next) => {
  try {
    const allowed = ["origin", "destination", "flight_in", "flight_out", "hotel",
      "hotel_checkin", "hotel_checkout", "visa_status", "status", "pickup_status",
      "companion", "special_needs", "total_cost", "notes"];
    const updates = []; const params = []; let idx = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key} = $${idx++}`); params.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });
    params.push(req.params.id);
    const result = await query(`UPDATE travel_bookings SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`, params);
    if (!result.rows.length) return res.status(404).json({ error: "Booking not found" });
    await auditLog(req.user.id, "UPDATE_TRAVEL_BOOKING", "travel_bookings", req.params.id, req.body, req.ip);
    res.json({ booking: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/travel/bookings/:id/confirm-pickup
router.patch("/bookings/:id/confirm-pickup", authorize("superadmin", "travel"), [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE travel_bookings SET pickup_status = 'confirmed' WHERE id = $1 AND pickup_status = 'pending' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Booking not found or pickup already confirmed" });

    const pat = await query("SELECT user_id FROM patients WHERE id = $1", [result.rows[0].patient_id]);
    if (pat.rows.length > 0 && pat.rows[0].user_id) {
      await createNotification(pat.rows[0].user_id, "Airport Pickup Confirmed",
        "Your airport pickup has been confirmed", "success");
    }

    res.json({ booking: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/travel/bookings/:id/visa
router.patch("/bookings/:id/visa", authorize("superadmin", "travel"), [
  param("id").isInt(),
  body("visa_status").isIn(["not-applied", "processing", "approved", "rejected"]),
], async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE travel_bookings SET visa_status = $1 WHERE id = $2 RETURNING *`,
      [req.body.visa_status, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Booking not found" });
    await auditLog(req.user.id, "UPDATE_VISA_STATUS", "travel_bookings", req.params.id, { visa_status: req.body.visa_status }, req.ip);
    res.json({ booking: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
