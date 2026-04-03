# Global Care Backend - Knowledge Transfer (KT) Document

## 1. Executive Summary & Purpose
The Global Care application is a comprehensive **Medical Tourism Management Platform**. It orchestrates the entire lifecycle of a medical tourist's journey: from patient registration and visa/travel bookings to hospital admissions, lab tests, doctor consultations, prescriptions, and insurance claims.

This backend serves as the core RESTful API, facilitating role-based access for diverse stakeholders (Patients, Doctors, Hospitals, Labs, Pharmacies, Travel Agencies, Insurance, and Superadmins).

## 2. Technology Stack
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js 4.x
- **Database:** MySQL 8+ (Recently migrated from PostgreSQL; uses a custom wrapper to emulate `RETURNING` clauses)
- **Cache:** Redis 7+ (Optional, used for caching and performance optimization)
- **Authentication:** JWT (JSON Web Tokens) with both Access and Refresh token strategies
- **Environment Management:** `dotenv`
- **Security Middleware:** Helmet, CORS, express-rate-limit
- **Process Manager:** PM2 (via `ecosystem.config.js`)

## 3. Architecture Overview
The application follows a standard modular RESTful API architecture.

### Key Directories
- **`config/`**: Contains core configurations like MySQL database connection pool (`database.js`) and Redis caching. Note: The MySQL driver uses `mysql2/promise` and has a special `query()` function wrapper that adapts PostgreSQL-style parameterized queries (`$1`, `$2`) to MySQL (`?`) and somewhat simulates the `RETURNING` functionality for `INSERT`/`UPDATE` operations.
- **`middleware/`**: 
  - `auth.js`: Implements JWT verification and Role-Based Access Control (RBAC).
  - `errorHandler.js`: Provides central error capturing, formatting, and consistent HTTP error responses.
- **`routes/`**: Distinct route files per domain (auth, patients, appointments, hospitals, labs, travel, etc.).
- **`migrations/`**: Contains raw SQL or JavaScript scripts (`run.js`, `convert_schema.js`) used to construct and tear down the schemas. Run via `npm run migrate`.
- **`utils/`**: Shared services such as the audit logger (which tracks who did what) and the notification engines (email & in-app).

## 4. Role-Based Access Control (RBAC) Architecture
Security and data privacy are paramount in Global Care. The system handles 8 distinct user roles:
1. **Super Admin**: Ultimate platform control (CRUD on everything).
2. **Hospital**: Can manage their own doctors, beds, and read assigned patient details.
3. **Doctor**: Has access to their specific schedule, assigned patients, and writes lab requests/prescriptions.
4. **Patient**: Can manage their own profile, appointments, and view their lab reports/prescriptions.
5. **Lab**: Manages lab orders, sets processing stats, and uploads final results.
6. **Travel**: Handles travel bookings, visa tracking, and pickup services.
7. **Pharmacy**: Dispenses written prescriptions.
8. **Insurance**: Reviews, approves/rejects, and settles claims.

*RBAC implementation*: Checked typically within individual route setups utilizing a middleware (e.g., `requireRole(['admin', 'doctor'])`).

## 5. Core Workflows
1. **Patient Onboarding**: Registration -> Auth Token generation -> Profile completion.
2. **Medical Journey Coordination**: 
   - Patient books an Appointment -> Conflict detection runs.
   - Doctor sees patient -> Requests Labs -> Lab updates status -> Doctor Reviews.
   - Doctor issues Prescription -> Pharmacy processes.
3. **Billing & Insurance**:
   - Treatment completed -> Insurance claim created -> Review -> Approval -> Settlement.
4. **Travel Management**:
   - Intertwined with appointment dates to issue Visa and arrange transport.

## 6. Migration to MySQL Notes
The backend was recently converted from PostgreSQL to MySQL. 
**Important implementation details for developers:**
- **Sequences / Auto Increment**: Uses MySQL `AUTO_INCREMENT` on primary keys.
- **Database Driver (`config/database.js`)**: The team implemented an adapter that intercepts queries containing `$1`, `$2` bindings and translates them into `?` bindings for `mysql2`.
- **RETURNING Simulation**: Since MySQL does not natively support `RETURNING *` like PostgreSQL, the `query` wrapper parses `INSERT/UPDATE/DELETE` statements containing `RETURNING`, captures the `insertId` (or extracts IDs from the `WHERE` clause), and performs subsequent `SELECT` queries to simulate the expected return object. Keep this in mind when debugging database transactions or writing complex SQL queries.

## 7. Development & Deployment Procedures

### Development Iterations
```bash
npm install
npm run migrate # Builds the MySQL tables
npm run seed    # Generates initial data (admin, hospitals, demo patients)
npm run dev     # Begins nodemon server with hot-reloads
```

### Production Deployment
The application utilizes PM2 for process management and zero-downtime reloads.
```bash
npm run build       # Clean & output to /dist
npm run deploy      # Calls pm2 start ecosystem.config.js
```

## 8. Common Troubleshooting & Known Issues
- **CORS Errors**: Check `process.env.CORS_ORIGIN` in `.env`. By default, it expects `http://localhost:5173`. Ensure exact matching (no trailing slashes).
- **MySQL "Access Denied"**: If encountering root password issues after resetting MySQL, ensure that the `.env` DB credentials exactly match the current MySQL internal permissions. Wait to spin up the Node API until the DB is fully initialized.
- **Missing Redis**: If Redis is not running locally, comment out Redis features in `config/redis.js` or define fallback behavior, otherwise the `redisClient.connect()` block may hang or throw connection refused errors.

## 9. Contacts & Ownership
- Ensure API endpoints align conceptually with the Front-End components (e.g., React/Tailwind application). 
- For frontend logic, refer to the `Global_Care_Single_page` relative UI structure.
