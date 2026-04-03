// // ═══════════════════════════════════════════════════════
// // Database Seed — Demo Data
// // ═══════════════════════════════════════════════════════

// const bcrypt = require("bcryptjs");
// const { pool } = require("../config/database");

// async function seed() {
//   console.log("Seeding database...");
//   // console.log("pool", pool);
//   const client = await pool.getConnection();
//   try {
//     console.log("Before BEGIN");
//     await client.beginTransaction();
//     console.log("Transaction started");

//     // Hash passwords
//     const hash = await bcrypt.hash("admin123", 12);
//     const hashH = await bcrypt.hash("hospital123", 12);
//     const hashD = await bcrypt.hash("doctor123", 12);
//     const hashP = await bcrypt.hash("patient123", 12);
//     const hashL = await bcrypt.hash("lab123", 12);
//     const hashT = await bcrypt.hash("travel123", 12);
//     const hashPh = await bcrypt.hash("pharma123", 12);
//     const hashI = await bcrypt.hash("insure123", 12);
//     console.log("hash", hash);

//     // ── Users ──────────────────────────────────────────
//     const users = await client.query(`
//       INSERT INTO users (email, password_hash, role, name, phone) VALUES
//         ('admin@globalcare.com',    ?, 'superadmin', 'System Administrator',  '+91-9000000001'),
//         ('hospital@globalcare.com', ?, 'hospital',   'Apollo Hospital Mumbai', '+91-2266000000'),
//         ('doctor@globalcare.com',   ?, 'doctor',     'Dr. Priya Sharma',       '+91-9800000001'),
//         ('patient@globalcare.com',  ?, 'patient',    'James Wilson',           '+1-555-0101'),
//         ('lab@globalcare.com',      ?, 'lab',        'PathCare Diagnostics',   '+91-2267000000'),
//         ('travel@globalcare.com',   ?, 'travel',     'MedVoyage Travel',       '+91-9900000001'),
//         ('pharma@globalcare.com',   ?, 'pharmacy',   'LifeCare Pharmacy',      '+91-2268000000'),
//         ('insurance@globalcare.com',?, 'insurance',  'GlobalShield Insurance', '+1-800-555-0199')
//       RETURNING id, email, role
//     `, [hash, hashH, hashD, hashP, hashL, hashT, hashPh, hashI]);
//     console.log("users", users);
//     const userMap = {};
//     users.rows.forEach(u => { userMap[u.role] = u.id; });

//     // ── Hospitals ──────────────────────────────────────
//     const hosps = await client.query(`
//       INSERT INTO hospitals (user_id, name, city, country, total_beds, available_beds, rating, specialties) VALUES
//         ($1, 'Apollo Hospital Mumbai',  'Mumbai',   'India', 500, 123, 4.8, JSON_ARRAY("Cardiology","Orthopedics","Oncology","Neurology")),
//         (NULL, 'Fortis Hospital Delhi', 'Delhi',    'India', 350, 87,  4.6, JSON_ARRAY("Orthopedics","Neurology","Urology")),
//         (NULL, 'Medanta Gurugram',      'Gurugram', 'India', 420, 95,  4.7, JSON_ARRAY("Cardiac Surgery","Dental","Ophthalmology")),
//         (NULL, 'Max Hospital Saket',    'Delhi',    'India', 300, 68,  4.5, JSON_ARRAY("General Surgery","Pediatrics"))
//       RETURNING id, name
//     `, [userMap.hospital]);

//     const hospMap = {};
//     hosps.rows.forEach(h => { hospMap[h.name] = h.id; });

//     // ── Departments ───────────────────────────────────
//     const apolloId = hospMap["Apollo Hospital Mumbai"];
//     await client.query(`
//       INSERT INTO departments (hospital_id, name, bed_count) VALUES
//         ($1, 'Cardiology',     65),
//         ($1, 'Orthopedics',    50),
//         ($1, 'Ophthalmology',  30),
//         ($1, 'Dental',         20),
//         ($1, 'Neurology',      40),
//         ($1, 'Oncology',       55),
//         ($1, 'General Surgery',45),
//         ($1, 'Pediatrics',     35)
//     `, [apolloId]);

//     // ── Doctors ───────────────────────────────────────
//     const docs = await client.query(`
//       INSERT INTO doctors (user_id, hospital_id, name, specialization, license_no, experience_yrs, consultation_fee) VALUES
//         ($1, $2, 'Dr. Priya Sharma',  'Cardiology',   'MCI-10234', 15, 200.00),
//         (NULL, $3, 'Dr. Rajesh Kumar', 'Orthopedics',  'MCI-10567', 20, 250.00),
//         (NULL, $4, 'Dr. Anita Desai',  'Dental',       'MCI-10890', 12, 150.00),
//         (NULL, $2, 'Dr. Vikram Patel', 'Neurology',    'MCI-11234', 18, 300.00)
//       RETURNING id, name
//     `, [userMap.doctor, apolloId, hospMap["Fortis Hospital Delhi"], hospMap["Medanta Gurugram"]]);

//     const docMap = {};
//     docs.rows.forEach(d => { docMap[d.name] = d.id; });

//     // ── Patients ──────────────────────────────────────
//     const pats = await client.query(`
//       INSERT INTO patients (user_id, name, email, country, age, gender, blood_group, conditions, current_treatment, assigned_hospital, assigned_doctor, status, travel_status, insurance_plan) VALUES
//         ($1, 'James Wilson',   'patient@globalcare.com', 'United States',  45, 'Male',   'O+',  JSON_ARRAY("Hypertension","Cardiac Arrhythmia"), 'Cardiac Evaluation',  $2, $3, 'active',      'arrived',    'GlobalShield Premium'),
//         (NULL, 'Sarah Chen',   'sarah@example.com',      'Canada',         38, 'Female', 'A+',  JSON_ARRAY("Osteoarthritis"),                    'Knee Replacement',    $4, $5, 'active',      'in-transit', 'GlobalShield Standard'),
//         (NULL, 'Michael Brown','michael@example.com',     'United Kingdom', 52, 'Male',   'B+',  JSON_ARRAY("Diabetes Type 2","Retinopathy"),     'Eye Surgery',         $2, $3, 'discharged',  'departed',   'GlobalShield Premium'),
//         (NULL, 'Emma Davis',   'emma@example.com',        'Australia',      29, 'Female', 'AB-', JSON_ARRAY("Dental Caries"),                     'Dental Implants',     $6, $7, 'pre-arrival', 'booked',     'GlobalShield Basic'),
//         (NULL, 'Ahmed Hassan', 'ahmed@example.com',       'UAE',            60, 'Male',   'O-',  JSON_ARRAY("Spinal Stenosis"),                   'Spinal Surgery',      $4, $5, 'active',      'arrived',    'GlobalShield Premium')
//       RETURNING id, name
//     `, [
//       userMap.patient,
//       apolloId, docMap["Dr. Priya Sharma"],
//       hospMap["Fortis Hospital Delhi"], docMap["Dr. Rajesh Kumar"],
//       hospMap["Medanta Gurugram"], docMap["Dr. Anita Desai"],
//     ]);

//     const patMap = {};
//     pats.rows.forEach(p => { patMap[p.name] = p.id; });

//     // ── Labs ──────────────────────────────────────────
//     const labResult = await client.query(`
//       INSERT INTO labs (user_id, name, certification, hospital_id) VALUES
//         ($1, 'PathCare Diagnostics', 'NABL Certified', $2)
//       RETURNING id
//     `, [userMap.lab, apolloId]);
//     const labId = labResult.rows[0].id;

//     // ── Lab Reports ───────────────────────────────────
//     await client.query(`
//       INSERT INTO lab_reports (patient_id, doctor_id, lab_id, test_name, results, status, urgent) VALUES
//         ($1, $2, $5, 'Complete Blood Count',   '{"hemoglobin":"14.2 g/dL","wbc":"7200/uL","platelets":"250000/uL"}', 'completed',   FALSE),
//         ($1, $2, $5, 'Cardiac Enzymes Panel',  NULL, 'processing',  TRUE),
//         ($3, $4, $5, 'X-Ray Knee Joint',       '{"findings":"Moderate joint space narrowing","impression":"Grade III OA"}', 'completed', FALSE),
//         ($6, $2, $5, 'HbA1c',                  '{"hba1c":"7.8%","fasting_glucose":"142 mg/dL"}', 'completed', FALSE),
//         ($7, $4, $5, 'MRI Spine',              NULL, 'pending', TRUE)
//     `, [
//       patMap["James Wilson"], docMap["Dr. Priya Sharma"],
//       patMap["Sarah Chen"], docMap["Dr. Rajesh Kumar"],
//       labId,
//       patMap["Michael Brown"],
//       patMap["Ahmed Hassan"],
//     ]);

//     // ── Appointments ──────────────────────────────────
//     await client.query(`
//       INSERT INTO appointments (patient_id, doctor_id, hospital_id, appt_date, appt_time, type, status, notes) VALUES
//         ($1, $5, $9, '2026-03-20', '10:00', 'Cardiac Consultation', 'confirmed', 'Initial consultation'),
//         ($2, $6, $10,'2026-03-22', '14:30', 'Orthopedic Surgery',   'pending',   'Knee replacement pre-op'),
//         ($3, $5, $9, '2026-03-18', '11:00', 'Follow-up',            'completed', 'Post-surgery follow up'),
//         ($4, $7, $11,'2026-03-25', '09:00', 'Dental Implants',      'confirmed', 'Full mouth rehab'),
//         ($1, $8, $9, '2026-03-28', '15:00', 'Lab Review',           'pending',   'Review blood work')
//     `, [
//       patMap["James Wilson"], patMap["Sarah Chen"], patMap["Michael Brown"], patMap["Emma Davis"],
//       docMap["Dr. Priya Sharma"], docMap["Dr. Rajesh Kumar"], docMap["Dr. Anita Desai"], docMap["Dr. Vikram Patel"],
//       apolloId, hospMap["Fortis Hospital Delhi"], hospMap["Medanta Gurugram"],
//     ]);

//     // ── Pharmacies ────────────────────────────────────
//     const pharmaResult = await client.query(`
//       INSERT INTO pharmacies (user_id, name, license_no, hospital_id) VALUES
//         ($1, 'LifeCare Pharmacy', 'PH-MH-2024-001', $2)
//       RETURNING id
//     `, [userMap.pharmacy, apolloId]);
//     const pharmaId = pharmaResult.rows[0].id;

//     // ── Prescriptions ─────────────────────────────────
//     const rx1 = await client.query(`
//       INSERT INTO prescriptions (patient_id, doctor_id, pharmacy_id, status) VALUES
//         ($1, $2, $3, 'dispensed'),
//         ($4, $2, $3, 'dispensed'),
//         ($5, $6, $3, 'pending')
//       RETURNING id
//     `, [
//       patMap["James Wilson"], docMap["Dr. Priya Sharma"], pharmaId,
//       patMap["Michael Brown"],
//       patMap["Ahmed Hassan"], docMap["Dr. Rajesh Kumar"],
//     ]);

//     const rxIds = rx1.rows.map(r => r.id);
//     await client.query(`
//       INSERT INTO prescription_items (prescription_id, medication, dosage, frequency, duration) VALUES
//         ($1, 'Amlodipine',       '5mg',   'Once daily',  '30 days'),
//         ($1, 'Aspirin',          '75mg',  'Once daily',  '30 days'),
//         ($2, 'Metformin',        '500mg', 'Twice daily', '90 days'),
//         ($2, 'Eye Drops Timolol','0.5%',  'Twice daily', '30 days'),
//         ($3, 'Pregabalin',       '75mg',  'Twice daily', '14 days'),
//         ($3, 'Diclofenac',       '50mg',  'Twice daily', '7 days')
//     `, [rxIds[0], rxIds[1], rxIds[2]]);

//     // ── Travel Bookings ───────────────────────────────
//     await client.query(`
//       INSERT INTO travel_bookings (patient_id, agent_user_id, origin, destination, flight_in, flight_out, hotel, hotel_checkin, hotel_checkout, visa_status, status, pickup_status, companion, special_needs) VALUES
//         ($1, $5, 'New York, USA',       'Mumbai, India',   '2026-03-17 AI-144', '2026-04-05 AI-145', 'Taj Mahal Palace',    '2026-03-17', '2026-04-05', 'approved',   'active',  'confirmed', 'Mary Wilson (Spouse)',    'Wheelchair assistance'),
//         ($2, $5, 'Toronto, Canada',     'Delhi, India',    '2026-03-21 AC-846', '2026-04-10 AC-847', 'The Imperial Delhi',  '2026-03-21', '2026-04-10', 'approved',   'booked',  'pending',   'None',                    'None'),
//         ($3, $5, 'Sydney, Australia',   'Gurugram, India', '2026-03-24 QF-23',  '2026-04-08 QF-24',  'The Oberoi Gurugram', '2026-03-24', '2026-04-08', 'processing', 'booked',  'pending',   'Tom Davis (Brother)',     'Vegetarian meals'),
//         ($4, $5, 'Dubai, UAE',          'Delhi, India',    '2026-03-14 EK-510', '2026-04-02 EK-511', 'ITC Maurya Delhi',    '2026-03-14', '2026-04-02', 'approved',   'active',  'confirmed', 'Fatima Hassan (Wife)',    'Halal meals, Arabic interpreter')
//     `, [
//       patMap["James Wilson"], patMap["Sarah Chen"], patMap["Emma Davis"], patMap["Ahmed Hassan"],
//       userMap.travel,
//     ]);

//     // ── Insurance Claims ──────────────────────────────
//     await client.query(`
//       INSERT INTO insurance_claims (patient_id, plan, treatment, hospital_id, amount_claimed, amount_approved, status, documents) VALUES
//         ($1, 'GlobalShield Premium',  'Cardiac Evaluation', $5, 12500.00, 11000.00, 'approved',     JSON_ARRAY("Medical Report","Hospital Bill","Prescription")),
//         ($2, 'GlobalShield Standard', 'Knee Replacement',   $6, 28000.00, NULL,     'under-review', JSON_ARRAY("Medical Report","Pre-auth Letter")),
//         ($3, 'GlobalShield Premium',  'Eye Surgery',        $5, 8500.00,  8500.00,  'settled',      JSON_ARRAY("Medical Report","Hospital Bill","Prescription","Discharge Summary")),
//         ($4, 'GlobalShield Premium',  'Spinal Surgery',     $6, 45000.00, NULL,     'pending',      JSON_ARRAY("Medical Report"))
//     `, [
//       patMap["James Wilson"], patMap["Sarah Chen"], patMap["Michael Brown"], patMap["Ahmed Hassan"],
//       apolloId, hospMap["Fortis Hospital Delhi"],
//     ]);

//     await client.commit();
//     console.log("Seed complete — demo data inserted successfully.");
//   } catch (err) {
//     await client.rollback();
//     console.error("Seed error:", err.message);
//     throw err;
//   } finally {
//     client.release();
//     await pool.end();
//   }
// }

// if (require.main === module) {
//   seed().catch(() => process.exit(1));
// }

// module.exports = { seed };
// ═══════════════════════════════════════════════════════
// Database Seed — Demo Data (MySQL-compatible)
// ═══════════════════════════════════════════════════════

const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");

async function seed() {
  console.log("Seeding database...");
  const client = await pool.getConnection();
  try {
    await client.beginTransaction();
    console.log("Transaction started");

    // Hash passwords
    const hash = await bcrypt.hash("admin123", 12);
    const hashH = await bcrypt.hash("hospital123", 12);
    const hashD = await bcrypt.hash("doctor123", 12);
    const hashP = await bcrypt.hash("patient123", 12);
    const hashL = await bcrypt.hash("lab123", 12);
    const hashT = await bcrypt.hash("travel123", 12);
    const hashPh = await bcrypt.hash("pharma123", 12);
    const hashI = await bcrypt.hash("insure123", 12);

    // ── Users ──────────────────────────────────────────
    // Insert one by one so we can capture each LAST_INSERT_ID()
    const userMap = {};

    const userRows = [
      { email: "admin@globalcare.com", hash: hash, role: "superadmin", name: "System Administrator", phone: "+91-9000000001" },
      { email: "hospital@globalcare.com", hash: hashH, role: "hospital", name: "Apollo Hospital Mumbai", phone: "+91-2266000000" },
      { email: "doctor@globalcare.com", hash: hashD, role: "doctor", name: "Dr. Priya Sharma", phone: "+91-9800000001" },
      { email: "patient@globalcare.com", hash: hashP, role: "patient", name: "James Wilson", phone: "+1-555-0101" },
      { email: "lab@globalcare.com", hash: hashL, role: "lab", name: "PathCare Diagnostics", phone: "+91-2267000000" },
      { email: "travel@globalcare.com", hash: hashT, role: "travel", name: "MedVoyage Travel", phone: "+91-9900000001" },
      { email: "pharma@globalcare.com", hash: hashPh, role: "pharmacy", name: "LifeCare Pharmacy", phone: "+91-2268000000" },
      { email: "insurance@globalcare.com", hash: hashI, role: "insurance", name: "GlobalShield Insurance", phone: "+1-800-555-0199" },
    ];

    for (const u of userRows) {
      const [result] = await client.query(
        `INSERT INTO users (email, password_hash, role, name, phone) VALUES (?, ?, ?, ?, ?)`,
        [u.email, u.hash, u.role, u.name, u.phone]
      );
      userMap[u.role] = result.insertId;
    }
    console.log("userMap", userMap);

    // ── Hospitals ──────────────────────────────────────
    const hospMap = {};

    const hospitalRows = [
      { userId: userMap.hospital, name: "Apollo Hospital Mumbai", city: "Mumbai", country: "India", beds: 500, avail: 123, rating: 4.8, specs: JSON.stringify(["Cardiology", "Orthopedics", "Oncology", "Neurology"]) },
      { userId: null, name: "Fortis Hospital Delhi", city: "Delhi", country: "India", beds: 350, avail: 87, rating: 4.6, specs: JSON.stringify(["Orthopedics", "Neurology", "Urology"]) },
      { userId: null, name: "Medanta Gurugram", city: "Gurugram", country: "India", beds: 420, avail: 95, rating: 4.7, specs: JSON.stringify(["Cardiac Surgery", "Dental", "Ophthalmology"]) },
      { userId: null, name: "Max Hospital Saket", city: "Delhi", country: "India", beds: 300, avail: 68, rating: 4.5, specs: JSON.stringify(["General Surgery", "Pediatrics"]) },
    ];

    for (const h of hospitalRows) {
      const [result] = await client.query(
        `INSERT INTO hospitals (user_id, name, city, country, total_beds, available_beds, rating, specialties) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [h.userId, h.name, h.city, h.country, h.beds, h.avail, h.rating, h.specs]
      );
      hospMap[h.name] = result.insertId;
    }
    console.log("hospMap", hospMap);

    // ── Departments ───────────────────────────────────
    const apolloId = hospMap["Apollo Hospital Mumbai"];
    const deptNames = ["Cardiology", "Orthopedics", "Ophthalmology", "Dental", "Neurology", "Oncology", "General Surgery", "Pediatrics"];
    const deptBeds = [65, 50, 30, 20, 40, 55, 45, 35];

    for (let i = 0; i < deptNames.length; i++) {
      await client.query(
        `INSERT INTO departments (hospital_id, name, bed_count) VALUES (?, ?, ?)`,
        [apolloId, deptNames[i], deptBeds[i]]
      );
    }

    // ── Doctors ───────────────────────────────────────
    const docMap = {};

    const doctorRows = [
      { userId: userMap.doctor, hospId: apolloId, name: "Dr. Priya Sharma", spec: "Cardiology", license: "MCI-10234", exp: 15, fee: 200.00 },
      { userId: null, hospId: hospMap["Fortis Hospital Delhi"], name: "Dr. Rajesh Kumar", spec: "Orthopedics", license: "MCI-10567", exp: 20, fee: 250.00 },
      { userId: null, hospId: hospMap["Medanta Gurugram"], name: "Dr. Anita Desai", spec: "Dental", license: "MCI-10890", exp: 12, fee: 150.00 },
      { userId: null, hospId: apolloId, name: "Dr. Vikram Patel", spec: "Neurology", license: "MCI-11234", exp: 18, fee: 300.00 },
    ];

    for (const d of doctorRows) {
      const [result] = await client.query(
        `INSERT INTO doctors (user_id, hospital_id, name, specialization, license_no, experience_yrs, consultation_fee) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [d.userId, d.hospId, d.name, d.spec, d.license, d.exp, d.fee]
      );
      docMap[d.name] = result.insertId;
    }
    console.log("docMap", docMap);

    // ── Patients ──────────────────────────────────────
    const patMap = {};

    const patientRows = [
      { userId: userMap.patient, name: "James Wilson", email: "patient@globalcare.com", country: "United States", age: 45, gender: "Male", blood: "O+", conds: JSON.stringify(["Hypertension", "Cardiac Arrhythmia"]), treatment: "Cardiac Evaluation", hospId: apolloId, docId: docMap["Dr. Priya Sharma"], status: "active", travel: "arrived", plan: "GlobalShield Premium" },
      { userId: null, name: "Sarah Chen", email: "sarah@example.com", country: "Canada", age: 38, gender: "Female", blood: "A+", conds: JSON.stringify(["Osteoarthritis"]), treatment: "Knee Replacement", hospId: hospMap["Fortis Hospital Delhi"], docId: docMap["Dr. Rajesh Kumar"], status: "active", travel: "in-transit", plan: "GlobalShield Standard" },
      { userId: null, name: "Michael Brown", email: "michael@example.com", country: "United Kingdom", age: 52, gender: "Male", blood: "B+", conds: JSON.stringify(["Diabetes Type 2", "Retinopathy"]), treatment: "Eye Surgery", hospId: apolloId, docId: docMap["Dr. Priya Sharma"], status: "discharged", travel: "departed", plan: "GlobalShield Premium" },
      { userId: null, name: "Emma Davis", email: "emma@example.com", country: "Australia", age: 29, gender: "Female", blood: "AB-", conds: JSON.stringify(["Dental Caries"]), treatment: "Dental Implants", hospId: hospMap["Medanta Gurugram"], docId: docMap["Dr. Anita Desai"], status: "pre-arrival", travel: "booked", plan: "GlobalShield Basic" },
      { userId: null, name: "Ahmed Hassan", email: "ahmed@example.com", country: "UAE", age: 60, gender: "Male", blood: "O-", conds: JSON.stringify(["Spinal Stenosis"]), treatment: "Spinal Surgery", hospId: hospMap["Fortis Hospital Delhi"], docId: docMap["Dr. Rajesh Kumar"], status: "active", travel: "arrived", plan: "GlobalShield Premium" },
    ];

    for (const p of patientRows) {
      const [result] = await client.query(
        `INSERT INTO patients (user_id, name, email, country, age, gender, blood_group, conditions, current_treatment, assigned_hospital, assigned_doctor, status, travel_status, insurance_plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.userId, p.name, p.email, p.country, p.age, p.gender, p.blood, p.conds, p.treatment, p.hospId, p.docId, p.status, p.travel, p.plan]
      );
      patMap[p.name] = result.insertId;
    }
    console.log("patMap", patMap);

    // ── Labs ──────────────────────────────────────────
    const [labResult] = await client.query(
      `INSERT INTO labs (user_id, name, certification, hospital_id) VALUES (?, ?, ?, ?)`,
      [userMap.lab, "PathCare Diagnostics", "NABL Certified", apolloId]
    );
    const labId = labResult.insertId;

    // ── Lab Reports ───────────────────────────────────
    const labReports = [
      { patId: patMap["James Wilson"], docId: docMap["Dr. Priya Sharma"], test: "Complete Blood Count", results: JSON.stringify({ hemoglobin: "14.2 g/dL", wbc: "7200/uL", platelets: "250000/uL" }), status: "completed", urgent: false },
      { patId: patMap["James Wilson"], docId: docMap["Dr. Priya Sharma"], test: "Cardiac Enzymes Panel", results: null, status: "processing", urgent: true },
      { patId: patMap["Sarah Chen"], docId: docMap["Dr. Rajesh Kumar"], test: "X-Ray Knee Joint", results: JSON.stringify({ findings: "Moderate joint space narrowing", impression: "Grade III OA" }), status: "completed", urgent: false },
      { patId: patMap["Michael Brown"], docId: docMap["Dr. Priya Sharma"], test: "HbA1c", results: JSON.stringify({ hba1c: "7.8%", fasting_glucose: "142 mg/dL" }), status: "completed", urgent: false },
      { patId: patMap["Ahmed Hassan"], docId: docMap["Dr. Rajesh Kumar"], test: "MRI Spine", results: null, status: "pending", urgent: true },
    ];

    for (const r of labReports) {
      await client.query(
        `INSERT INTO lab_reports (patient_id, doctor_id, lab_id, test_name, results, status, urgent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.patId, r.docId, labId, r.test, r.results, r.status, r.urgent]
      );
    }

    // ── Appointments ──────────────────────────────────
    const appointments = [
      { patId: patMap["James Wilson"], docId: docMap["Dr. Priya Sharma"], hospId: apolloId, date: "2026-03-20", time: "10:00", type: "Cardiac Consultation", status: "confirmed", notes: "Initial consultation" },
      { patId: patMap["Sarah Chen"], docId: docMap["Dr. Rajesh Kumar"], hospId: hospMap["Fortis Hospital Delhi"], date: "2026-03-22", time: "14:30", type: "Orthopedic Surgery", status: "pending", notes: "Knee replacement pre-op" },
      { patId: patMap["Michael Brown"], docId: docMap["Dr. Priya Sharma"], hospId: apolloId, date: "2026-03-18", time: "11:00", type: "Follow-up", status: "completed", notes: "Post-surgery follow up" },
      { patId: patMap["Emma Davis"], docId: docMap["Dr. Anita Desai"], hospId: hospMap["Medanta Gurugram"], date: "2026-03-25", time: "09:00", type: "Dental Implants", status: "confirmed", notes: "Full mouth rehab" },
      { patId: patMap["James Wilson"], docId: docMap["Dr. Vikram Patel"], hospId: apolloId, date: "2026-03-28", time: "15:00", type: "Lab Review", status: "pending", notes: "Review blood work" },
    ];

    for (const a of appointments) {
      await client.query(
        `INSERT INTO appointments (patient_id, doctor_id, hospital_id, appt_date, appt_time, type, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.patId, a.docId, a.hospId, a.date, a.time, a.type, a.status, a.notes]
      );
    }

    // ── Pharmacies ────────────────────────────────────
    const [pharmaResult] = await client.query(
      `INSERT INTO pharmacies (user_id, name, license_no, hospital_id) VALUES (?, ?, ?, ?)`,
      [userMap.pharmacy, "LifeCare Pharmacy", "PH-MH-2024-001", apolloId]
    );
    const pharmaId = pharmaResult.insertId;

    // ── Prescriptions ─────────────────────────────────
    const prescriptions = [
      { patId: patMap["James Wilson"], docId: docMap["Dr. Priya Sharma"], status: "dispensed" },
      { patId: patMap["Michael Brown"], docId: docMap["Dr. Priya Sharma"], status: "dispensed" },
      { patId: patMap["Ahmed Hassan"], docId: docMap["Dr. Rajesh Kumar"], status: "pending" },
    ];

    const rxIds = [];
    for (const rx of prescriptions) {
      const [result] = await client.query(
        `INSERT INTO prescriptions (patient_id, doctor_id, pharmacy_id, status) VALUES (?, ?, ?, ?)`,
        [rx.patId, rx.docId, pharmaId, rx.status]
      );
      rxIds.push(result.insertId);
    }

    const prescriptionItems = [
      { rxId: rxIds[0], med: "Amlodipine", dose: "5mg", freq: "Once daily", dur: "30 days" },
      { rxId: rxIds[0], med: "Aspirin", dose: "75mg", freq: "Once daily", dur: "30 days" },
      { rxId: rxIds[1], med: "Metformin", dose: "500mg", freq: "Twice daily", dur: "90 days" },
      { rxId: rxIds[1], med: "Eye Drops Timolol", dose: "0.5%", freq: "Twice daily", dur: "30 days" },
      { rxId: rxIds[2], med: "Pregabalin", dose: "75mg", freq: "Twice daily", dur: "14 days" },
      { rxId: rxIds[2], med: "Diclofenac", dose: "50mg", freq: "Twice daily", dur: "7 days" },
    ];

    for (const item of prescriptionItems) {
      await client.query(
        `INSERT INTO prescription_items (prescription_id, medication, dosage, frequency, duration) VALUES (?, ?, ?, ?, ?)`,
        [item.rxId, item.med, item.dose, item.freq, item.dur]
      );
    }

    // ── Travel Bookings ───────────────────────────────
    const travelBookings = [
      { patId: patMap["James Wilson"], origin: "New York, USA", dest: "Mumbai, India", flightIn: "2026-03-17 AI-144", flightOut: "2026-04-05 AI-145", hotel: "Taj Mahal Palace", checkin: "2026-03-17", checkout: "2026-04-05", visa: "approved", status: "active", pickup: "confirmed", companion: "Mary Wilson (Spouse)", needs: "Wheelchair assistance" },
      { patId: patMap["Sarah Chen"], origin: "Toronto, Canada", dest: "Delhi, India", flightIn: "2026-03-21 AC-846", flightOut: "2026-04-10 AC-847", hotel: "The Imperial Delhi", checkin: "2026-03-21", checkout: "2026-04-10", visa: "approved", status: "booked", pickup: "pending", companion: "None", needs: "None" },
      { patId: patMap["Emma Davis"], origin: "Sydney, Australia", dest: "Gurugram, India", flightIn: "2026-03-24 QF-23", flightOut: "2026-04-08 QF-24", hotel: "The Oberoi Gurugram", checkin: "2026-03-24", checkout: "2026-04-08", visa: "processing", status: "booked", pickup: "pending", companion: "Tom Davis (Brother)", needs: "Vegetarian meals" },
      { patId: patMap["Ahmed Hassan"], origin: "Dubai, UAE", dest: "Delhi, India", flightIn: "2026-03-14 EK-510", flightOut: "2026-04-02 EK-511", hotel: "ITC Maurya Delhi", checkin: "2026-03-14", checkout: "2026-04-02", visa: "approved", status: "active", pickup: "confirmed", companion: "Fatima Hassan (Wife)", needs: "Halal meals, Arabic interpreter" },
    ];

    for (const t of travelBookings) {
      await client.query(
        `INSERT INTO travel_bookings (patient_id, agent_user_id, origin, destination, flight_in, flight_out, hotel, hotel_checkin, hotel_checkout, visa_status, status, pickup_status, companion, special_needs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.patId, userMap.travel, t.origin, t.dest, t.flightIn, t.flightOut, t.hotel, t.checkin, t.checkout, t.visa, t.status, t.pickup, t.companion, t.needs]
      );
    }

    // ── Insurance Claims ──────────────────────────────
    const claims = [
      { patId: patMap["James Wilson"], plan: "GlobalShield Premium", treatment: "Cardiac Evaluation", hospId: apolloId, claimed: 12500.00, approved: 11000.00, status: "approved", docs: JSON.stringify(["Medical Report", "Hospital Bill", "Prescription"]) },
      { patId: patMap["Sarah Chen"], plan: "GlobalShield Standard", treatment: "Knee Replacement", hospId: hospMap["Fortis Hospital Delhi"], claimed: 28000.00, approved: null, status: "under-review", docs: JSON.stringify(["Medical Report", "Pre-auth Letter"]) },
      { patId: patMap["Michael Brown"], plan: "GlobalShield Premium", treatment: "Eye Surgery", hospId: apolloId, claimed: 8500.00, approved: 8500.00, status: "settled", docs: JSON.stringify(["Medical Report", "Hospital Bill", "Prescription", "Discharge Summary"]) },
      { patId: patMap["Ahmed Hassan"], plan: "GlobalShield Premium", treatment: "Spinal Surgery", hospId: hospMap["Fortis Hospital Delhi"], claimed: 45000.00, approved: null, status: "pending", docs: JSON.stringify(["Medical Report"]) },
    ];

    for (const c of claims) {
      await client.query(
        `INSERT INTO insurance_claims (patient_id, plan, treatment, hospital_id, amount_claimed, amount_approved, status, documents) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.patId, c.plan, c.treatment, c.hospId, c.claimed, c.approved, c.status, c.docs]
      );
    }

    await client.commit();
    console.log("Seed complete — demo data inserted successfully.");
  } catch (err) {
    await client.rollback();
    console.error("Seed error:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed().catch(() => process.exit(1));
}

module.exports = { seed };