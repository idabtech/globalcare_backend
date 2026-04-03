// ═══════════════════════════════════════════════════════
// Notification Service — In-app + Email
// ═══════════════════════════════════════════════════════

const { query } = require("../config/database");
const nodemailer = require("nodemailer");

// In-app notification
const createNotification = async (userId, title, message, type = "info", link = null) => {
  try {
    const result = await query(
      `INSERT INTO notifications (user_id, title, message, type, link)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, title, message, type, link]
    );
    return result.rows[0];
  } catch (err) {
    console.error("Notification error:", err.message);
  }
};

// Email transporter (lazy init)
let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

const sendEmail = async (to, subject, html) => {
  try {
    if (!process.env.SMTP_USER) {
      console.log(`[EMAIL STUB] To: ${to}, Subject: ${subject}`);
      return;
    }
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || "noreply@globalcare.com",
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error("Email send error:", err.message);
  }
};

module.exports = { createNotification, sendEmail };
