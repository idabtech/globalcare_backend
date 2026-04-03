// ═══════════════════════════════════════════════════════
// Analytics Routes — /api/v1/analytics
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { query } = require("../config/database");
const { authenticate, authorize } = require("../middleware/auth");
const { cacheGet } = require("../config/redis");

router.use(authenticate);

// GET /api/v1/analytics/dashboard — Superadmin dashboard stats
router.get("/dashboard", authorize("superadmin"), async (req, res, next) => {
  try {
    const stats = await cacheGet("analytics:dashboard", async () => {
      const [patients, appointments, hospitals, claims, labReports, travelBookings] = await Promise.all([
        query(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'pre-arrival') AS pre_arrival,
          COUNT(*) FILTER (WHERE status = 'discharged') AS discharged
          FROM patients`),
        query(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed
          FROM appointments`),
        query(`SELECT COUNT(*) AS total, SUM(total_beds) AS total_beds, SUM(available_beds) AS available_beds FROM hospitals`),
        query(`SELECT COUNT(*) AS total,
          COALESCE(SUM(amount_claimed), 0) AS total_claimed,
          COALESCE(SUM(amount_approved), 0) AS total_approved,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'approved') AS approved,
          COUNT(*) FILTER (WHERE status = 'settled') AS settled
          FROM insurance_claims`),
        query(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE urgent = TRUE) AS urgent
          FROM lab_reports`),
        query(`SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'booked') AS upcoming,
          COUNT(*) FILTER (WHERE visa_status = 'processing') AS visa_pending
          FROM travel_bookings`),
      ]);

      return {
        patients: patients.rows[0],
        appointments: appointments.rows[0],
        hospitals: hospitals.rows[0],
        claims: claims.rows[0],
        labReports: labReports.rows[0],
        travelBookings: travelBookings.rows[0],
      };
    }, 60); // cache 1 minute

    res.json({ dashboard: stats });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/patients-by-country
router.get("/patients-by-country", authorize("superadmin"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        DATE_FORMAT(submitted_at, '%Y-%m') AS month,
        COUNT(*) AS claim_count,
        COALESCE(SUM(amount_claimed), 0) AS total_claimed,
        COALESCE(SUM(amount_approved), 0) AS total_approved
      FROM insurance_claims
      WHERE submitted_at >= NOW() - INTERVAL 12 MONTH
      GROUP BY DATE_FORMAT(submitted_at, '%Y-%m') 
      ORDER BY month DESC
    `);
    res.json({ distribution: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/revenue
router.get("/revenue", authorize("superadmin"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        DATE_TRUNC('month', submitted_at) AS month,
        COUNT(*) AS claim_count,
        COALESCE(SUM(amount_claimed), 0) AS total_claimed,
        COALESCE(SUM(amount_approved), 0) AS total_approved
      FROM insurance_claims
      WHERE submitted_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', submitted_at)
      ORDER BY month DESC
    `);
    res.json({ revenue: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/appointments-trend
router.get("/appointments-trend", authorize("superadmin", "hospital"), async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        appt_date AS date,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
      FROM appointments
      WHERE appt_date >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY appt_date ORDER BY appt_date
    `);
    res.json({ trend: result.rows });
  } catch (err) { next(err); }
});

// GET /api/v1/analytics/audit-log
router.get("/audit-log", authorize("superadmin"), async (req, res, next) => {
  try {
    const { user_id, action, entity_type, page = 1, limit = 50 } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (user_id) { conditions.push(`al.user_id = $${idx++}`); params.push(user_id); }
    if (action) { conditions.push(`al.action ILIKE $${idx++}`); params.push(`%${action}%`); }
    if (entity_type) { conditions.push(`al.entity_type = $${idx++}`); params.push(entity_type); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const offset = (parseInt(page) - 1) * parseInt(limit);

    params.push(parseInt(limit), offset);
    const result = await query(`
      SELECT al.*, u.name AS user_name, u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, params);

    res.json({ logs: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
