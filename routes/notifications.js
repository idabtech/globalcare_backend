// ═══════════════════════════════════════════════════════
// Notification Routes — /api/v1/notifications
// ═══════════════════════════════════════════════════════

const router = require("express").Router();
const { param } = require("express-validator");
const { query } = require("../config/database");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

// GET /api/v1/notifications
router.get("/", async (req, res, next) => {
  try {
    const { unread_only, page = 1, limit = 20 } = req.query;
    const conditions = [`n.user_id = $1`];
    const params = [req.user.id];
    let idx = 2;
    if (unread_only === "true") conditions.push("n.is_read = FALSE");
    const where = `WHERE ${conditions.join(" AND ")}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countResult = await query(`SELECT COUNT(*) FROM notifications n ${where}`, params);
    const total = parseInt(countResult.rows[0].count);
    const unreadCount = await query("SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE", [req.user.id]);

    params.push(parseInt(limit), offset);
    const result = await query(`SELECT * FROM notifications n ${where} ORDER BY n.created_at DESC LIMIT $${idx++} OFFSET $${idx}`, params);

    res.json({
      notifications: result.rows,
      unread_count: parseInt(unreadCount.rows[0].count),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/:id/read
router.patch("/:id/read", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *", [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: result.rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/v1/notifications/read-all
router.patch("/read-all", async (req, res, next) => {
  try {
    await query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE", [req.user.id]);
    res.json({ message: "All notifications marked as read" });
  } catch (err) { next(err); }
});

// DELETE /api/v1/notifications/:id
router.delete("/:id", [param("id").isInt()], async (req, res, next) => {
  try {
    const result = await query("DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Notification not found" });
    res.json({ message: "Notification deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
