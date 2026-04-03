// ═══════════════════════════════════════════════════════
// Database Migration — Full Schema
// ═══════════════════════════════════════════════════════

const { pool } = require("../config/database");

const UP = `
-- ─── USERS TABLE ──────────────────────────────────────
CREATE TABLE users (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('superadmin', 'hospital', 'doctor', 'patient', 'lab', 'travel', 'pharmacy', 'insurance') NOT NULL,
  name          VARCHAR(255) NOT NULL,
  phone         VARCHAR(50),
  avatar_url    VARCHAR(500),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ─── HOSPITALS TABLE ──────────────────────────────────
CREATE TABLE hospitals (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  city            VARCHAR(100) NOT NULL,
  state           VARCHAR(100),
  country         VARCHAR(100) DEFAULT 'India',
  address         TEXT,
  phone           VARCHAR(50),
  email           VARCHAR(255),
  total_beds      INT DEFAULT 0,
  available_beds  INT DEFAULT 0,
  rating          DECIMAL(2,1) DEFAULT 0.0,
  accreditation   VARCHAR(255),
  specialties     JSON,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_hospitals_city ON hospitals(city);

-- ─── DEPARTMENTS TABLE ────────────────────────────────
CREATE TABLE departments (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  hospital_id  INT NOT NULL REFERENCES hospitals(id) ,
  name         VARCHAR(255) NOT NULL,
  head_doctor  VARCHAR(255),
  bed_count    INT DEFAULT 0,
  floor        VARCHAR(50),
  phone_ext    VARCHAR(20),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_departments_hospital ON departments(hospital_id);

-- ─── DOCTORS TABLE ────────────────────────────────────
CREATE TABLE doctors (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  user_id         INT REFERENCES users(id) ON DELETE SET NULL,
  hospital_id     INT REFERENCES hospitals(id) ON DELETE SET NULL,
  department_id   INT REFERENCES departments(id) ON DELETE SET NULL,
  name            VARCHAR(255) NOT NULL,
  specialization  VARCHAR(255),
  license_no      VARCHAR(100),
  qualification   VARCHAR(500),
  experience_yrs  INT DEFAULT 0,
  consultation_fee DECIMAL(10,2) DEFAULT 0,
  available_days  JSON,
  available_from  TIME,
  available_to    TIME,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_doctors_hospital ON doctors(hospital_id);
CREATE INDEX idx_doctors_specialization ON doctors(specialization);

-- ─── PATIENTS TABLE ───────────────────────────────────
CREATE TABLE patients (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  user_id           INT REFERENCES users(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  email             VARCHAR(255),
  phone             VARCHAR(50),
  date_of_birth     DATE,
  age               INT,
  gender            VARCHAR(20),
  blood_group       VARCHAR(10),
  country           VARCHAR(100),
  nationality       VARCHAR(100),
  passport_no       VARCHAR(100),
  address           TEXT,
  emergency_contact VARCHAR(255),
  emergency_phone   VARCHAR(50),
  conditions        JSON,
  allergies         JSON,
  current_treatment VARCHAR(500),
  assigned_hospital INT REFERENCES hospitals(id),
  assigned_doctor   INT REFERENCES doctors(id),
  status            ENUM('pre-arrival', 'active', 'discharged', 'follow-up') DEFAULT 'pre-arrival',
  travel_status     VARCHAR(50) DEFAULT 'pending',
  insurance_plan    VARCHAR(255),
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patients_hospital ON patients(assigned_hospital);
CREATE INDEX idx_patients_doctor ON patients(assigned_doctor);

-- ─── APPOINTMENTS TABLE ───────────────────────────────
CREATE TABLE appointments (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  patient_id   INT NOT NULL REFERENCES patients(id),
  doctor_id    INT NOT NULL REFERENCES doctors(id),
  hospital_id  INT NOT NULL REFERENCES hospitals(id),
  appt_date    DATE NOT NULL,
  appt_time    TIME NOT NULL,
  end_time     TIME,
  type         VARCHAR(100) NOT NULL,
  status       ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no-show') DEFAULT 'pending',
  notes        TEXT,
  diagnosis    TEXT,
  follow_up    DATE,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_appointments_date ON appointments(appt_date);
CREATE INDEX idx_appointments_status ON appointments(status);

-- ─── LABS TABLE ───────────────────────────────────────
CREATE TABLE labs (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  user_id        INT REFERENCES users(id) ON DELETE SET NULL,
  name           VARCHAR(255) NOT NULL,
  certification  VARCHAR(255),
  hospital_id    INT REFERENCES hospitals(id),
  phone          VARCHAR(50),
  email          VARCHAR(255),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── LAB REPORTS TABLE ────────────────────────────────
CREATE TABLE lab_reports (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  patient_id    INT NOT NULL REFERENCES patients(id) ,
  doctor_id     INT NOT NULL REFERENCES doctors(id),
  lab_id        INT REFERENCES labs(id),
  test_name     VARCHAR(255) NOT NULL,
  test_category VARCHAR(100),
  sample_type   VARCHAR(100),
  results       JSON,
  result_file   VARCHAR(500),
  status        ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  urgent        BOOLEAN DEFAULT FALSE,
  ordered_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at  TIMESTAMP,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_lab_reports_patient ON lab_reports(patient_id);
CREATE INDEX idx_lab_reports_status ON lab_reports(status);
CREATE INDEX idx_lab_reports_lab ON lab_reports(lab_id);

-- ─── PHARMACIES TABLE ─────────────────────────────────
CREATE TABLE pharmacies (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT REFERENCES users(id) ON DELETE SET NULL,
  name        VARCHAR(255) NOT NULL,
  license_no  VARCHAR(100),
  hospital_id INT REFERENCES hospitals(id),
  phone       VARCHAR(50),
  email       VARCHAR(255),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─── PRESCRIPTIONS TABLE ──────────────────────────────
CREATE TABLE prescriptions (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  patient_id    INT NOT NULL REFERENCES patients(id) ,
  doctor_id     INT NOT NULL REFERENCES doctors(id),
  pharmacy_id   INT REFERENCES pharmacies(id),
  prescribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  dispensed_at  TIMESTAMP,
  status        ENUM('pending', 'dispensed', 'cancelled') DEFAULT 'pending',
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_status ON prescriptions(status);

-- ─── PRESCRIPTION ITEMS TABLE ─────────────────────────
CREATE TABLE prescription_items (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  prescription_id INT NOT NULL REFERENCES prescriptions(id) ,
  medication      VARCHAR(255) NOT NULL,
  dosage          VARCHAR(100) NOT NULL,
  frequency       VARCHAR(100) NOT NULL,
  duration        VARCHAR(100),
  instructions    TEXT,
  quantity        INT DEFAULT 1
);

CREATE INDEX idx_rx_items_prescription ON prescription_items(prescription_id);

-- ─── TRAVEL BOOKINGS TABLE ────────────────────────────
CREATE TABLE travel_bookings (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  patient_id      INT NOT NULL REFERENCES patients(id) ,
  agent_user_id   INT REFERENCES users(id),
  origin          VARCHAR(255) NOT NULL,
  destination     VARCHAR(255) NOT NULL,
  flight_in       VARCHAR(255),
  flight_out      VARCHAR(255),
  hotel           VARCHAR(255),
  hotel_checkin   DATE,
  hotel_checkout  DATE,
  visa_status     ENUM('not-applied', 'processing', 'approved', 'rejected') DEFAULT 'not-applied',
  status          ENUM('pending', 'booked', 'active', 'completed', 'cancelled') DEFAULT 'pending',
  pickup_status   ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
  companion       VARCHAR(255),
  special_needs   TEXT,
  total_cost      DECIMAL(12,2),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_travel_patient ON travel_bookings(patient_id);
CREATE INDEX idx_travel_status ON travel_bookings(status);

-- ─── INSURANCE CLAIMS TABLE ───────────────────────────
CREATE TABLE insurance_claims (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  patient_id       INT NOT NULL REFERENCES patients(id) ,
  reviewer_user_id INT REFERENCES users(id),
  plan             VARCHAR(255),
  treatment        VARCHAR(500),
  hospital_id      INT REFERENCES hospitals(id),
  amount_claimed   DECIMAL(12,2) NOT NULL,
  amount_approved  DECIMAL(12,2),
  status           ENUM('pending', 'under-review', 'approved', 'rejected', 'settled') DEFAULT 'pending',
  documents        JSON,
  rejection_reason TEXT,
  submitted_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at      TIMESTAMP,
  settled_at       TIMESTAMP,
  notes            TEXT,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_claims_patient ON insurance_claims(patient_id);
CREATE INDEX idx_claims_status ON insurance_claims(status);

-- ─── NOTIFICATIONS TABLE ──────────────────────────────
CREATE TABLE notifications (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT NOT NULL REFERENCES users(id) ,
  title       VARCHAR(255) NOT NULL,
  message     TEXT NOT NULL,
  type        VARCHAR(50) DEFAULT 'info',
  is_read     BOOLEAN DEFAULT FALSE,
  link        VARCHAR(500),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

-- ─── AUDIT LOG TABLE ──────────────────────────────────
CREATE TABLE audit_log (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  user_id     INT REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id   INT,
  details     JSON,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────











`;

const DOWN = `
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS insurance_claims;
DROP TABLE IF EXISTS travel_bookings;
DROP TABLE IF EXISTS prescription_items;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS pharmacies;
DROP TABLE IF EXISTS lab_reports;
DROP TABLE IF EXISTS labs;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS hospitals;
DROP TABLE IF EXISTS users;










`;

async function migrate(direction = "up") {
  try {
    if (direction === "down") {
      console.log("Rolling back migration...");
      await pool.query(DOWN);
      console.log("Rollback complete.");
    } else {
      console.log("Running migration...");
      await pool.query(UP);
      console.log("Migration complete.");
    }
  } catch (err) {
    console.error("Migration error:", err);
    throw err;
  } finally {
    await pool.end();
  }
}

// Run from CLI: node migrations/run.js [up|down]
if (require.main === module) {
  const direction = process.argv[2] || "up";
  migrate(direction).catch(() => process.exit(1));
}

module.exports = { migrate, UP, DOWN };
