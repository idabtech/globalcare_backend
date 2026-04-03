# Global Care — Backend API

Medical Tourism Management Platform — RESTful API built with **Node.js**, **Express**, **MySQL**, and **Redis**.

## Architecture

```
backend/
├── server.js                # Entry point — Express app, middleware, route mounting
├── package.json             # Dependencies & scripts
├── .env.example             # Environment variables template
├── config/
│   ├── database.js          # MySQL connection pool
│   └── redis.js             # Redis cache client
├── middleware/
│   ├── auth.js              # JWT authentication + RBAC authorization
│   └── errorHandler.js      # Global error handler + ApiError class
├── migrations/
│   ├── run.js               # Database schema (up/down)
│   └── seed.js              # Demo data seeder
├── routes/
│   ├── auth.js              # Login, register, refresh, me
│   ├── patients.js          # Patient CRUD + filtering
│   ├── appointments.js      # Booking + confirm/cancel/complete
│   ├── hospitals.js         # Hospital CRUD + departments + beds
│   ├── doctors.js           # Doctor CRUD + schedule + patients
│   ├── labs.js              # Lab reports + process → complete
│   ├── travel.js            # Travel bookings + visa + pickup
│   ├── prescriptions.js     # Write → dispense workflow
│   ├── insurance.js         # Claims submit → review → approve → settle
│   ├── notifications.js     # User notifications
│   └── analytics.js         # Dashboard stats, revenue, audit log
└── utils/
    ├── auditLogger.js       # Audit trail for all actions
    └── notifications.js     # In-app + email notification service
```

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL 8+
- Redis 7+ (optional, for caching)

### Setup

```bash
# 1. Clone and install
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database credentials

# 3. Create database
mysql -u root -p -e "CREATE DATABASE globalcare;"

# 4. Run migrations (creates all tables)
npm run migrate

# 5. Seed demo data
npm run seed

# 6. Start server
npm run dev     # Development (hot reload)
npm start       # Production
```

Server runs on `http://localhost:5000` by default.

## Authentication

All API endpoints (except `/auth/login` and `/auth/register`) require a JWT Bearer token.

```bash
# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@globalcare.com","password":"admin123"}'

# Response: { user, accessToken, refreshToken }

# Use token in subsequent requests
curl http://localhost:5000/api/v1/patients \
  -H "Authorization: Bearer <accessToken>"
```

### Demo Credentials

| Role        | Email                      | Password     |
|-------------|----------------------------|--------------|
| Super Admin | admin@globalcare.com       | admin123     |
| Hospital    | hospital@globalcare.com    | hospital123  |
| Doctor      | doctor@globalcare.com      | doctor123    |
| Patient     | patient@globalcare.com     | patient123   |
| Lab         | lab@globalcare.com         | lab123       |
| Travel      | travel@globalcare.com      | travel123    |
| Pharmacy    | pharma@globalcare.com      | pharma123    |
| Insurance   | insurance@globalcare.com   | insure123    |

## Role-Based Access Control (RBAC)

| Endpoint Group  | superadmin | hospital | doctor | patient | lab | travel | pharmacy | insurance |
|-----------------|:----------:|:--------:|:------:|:-------:|:---:|:------:|:--------:|:---------:|
| Patients CRUD   | ✅ Full    | ✅ Own   | ✅ Own | 🔒 Self | ❌  | ❌     | ❌       | ❌        |
| Appointments    | ✅ Full    | ✅ Own   | ✅ Own | ✅ Own  | ❌  | ❌     | ❌       | ❌        |
| Hospitals       | ✅ Full    | ✅ Own   | ✅ Read| ✅ Read | ✅R | ❌     | ❌       | ❌        |
| Doctors         | ✅ Full    | ✅ Own   | ✅ Own | ✅ Read | ❌  | ❌     | ❌       | ❌        |
| Lab Reports     | ✅ Full    | ✅ Read  | ✅ Own | ✅ Own  | ✅  | ❌     | ❌       | ❌        |
| Travel          | ✅ Full    | ✅ Create| ❌     | ✅ Own  | ❌  | ✅     | ❌       | ❌        |
| Prescriptions   | ✅ Full    | ❌       | ✅ Write| ✅ Own | ❌  | ❌     | ✅ Disp  | ❌        |
| Insurance       | ✅ Full    | ✅ Submit| ❌     | ✅ Own  | ❌  | ❌     | ❌       | ✅ Full   |
| Analytics       | ✅ Full    | ✅ Trend | ❌     | ❌      | ❌  | ❌     | ❌       | ❌        |
| Notifications   | ✅ Own     | ✅ Own   | ✅ Own | ✅ Own  | ✅  | ✅     | ✅       | ✅        |

## API Endpoints Reference

### Auth (`/api/v1/auth`)
| Method | Path       | Description               |
|--------|------------|---------------------------|
| POST   | /login     | Login → JWT tokens        |
| POST   | /register  | Register new user         |
| POST   | /refresh   | Refresh access token      |
| GET    | /me        | Get authenticated user    |

### Patients (`/api/v1/patients`)
| Method | Path  | Query Params                                    |
|--------|-------|-------------------------------------------------|
| GET    | /     | status, country, hospital, doctor, search, page |
| GET    | /:id  |                                                 |
| POST   | /     | Body: name, email, country, age, ...            |
| PUT    | /:id  | Body: partial update fields                     |
| DELETE | /:id  | Admin only                                      |

### Appointments (`/api/v1/appointments`)
| Method | Path              | Description                    |
|--------|-------------------|--------------------------------|
| GET    | /                 | List (auto-scoped by role)     |
| GET    | /:id              | Details with joins              |
| POST   | /                 | Book (checks conflicts)        |
| PATCH  | /:id/confirm      | Hospital/doctor confirms       |
| PATCH  | /:id/cancel       | Anyone can cancel own          |
| PATCH  | /:id/complete     | Doctor marks completed         |

### Labs (`/api/v1/labs`)
| Method | Path                    | Description              |
|--------|-------------------------|--------------------------|
| GET    | /reports                | List reports             |
| GET    | /reports/:id            | Report details + results |
| POST   | /reports                | Order test (doctor)      |
| PATCH  | /reports/:id/process    | Start processing (lab)   |
| PATCH  | /reports/:id/complete   | Upload results (lab)     |

### Insurance (`/api/v1/insurance`)
| Method | Path                  | Description                    |
|--------|-----------------------|--------------------------------|
| GET    | /claims               | List claims                    |
| POST   | /claims               | Submit new claim               |
| PATCH  | /claims/:id/review    | Start review                   |
| PATCH  | /claims/:id/approve   | Approve with amount            |
| PATCH  | /claims/:id/reject    | Reject with reason             |
| PATCH  | /claims/:id/settle    | Mark payment settled           |
| GET    | /summary              | Aggregate statistics           |

## Data Flow

```
Patient Registers → Insurance Pre-Auth → Book Appointment → Travel Booked
                                              ↓
                                    Hospital Admission
                                     ↙           ↘
                              Consultation     Lab Tests
                                     ↘           ↙
                                    Lab Results → Doctor Review
                                         ↓
                                    Prescription → Pharmacy Dispenses
                                         ↓
                                Insurance Claim → Review → Approve → Settle
                                         ↓
                                    Discharge → Travel Home
```

## Key Features

- **JWT Authentication** with access + refresh tokens
- **Role-Based Access** — 8 roles, each scoped to their data
- **Pagination** on all list endpoints
- **Full-text Search** on patients, doctors, hospitals
- **Audit Trail** — every action logged with user, IP, timestamp
- **In-app Notifications** triggered on state changes
- **Email Notifications** via SMTP (configurable)
- **Redis Caching** for analytics and frequent queries
- **Input Validation** with express-validator
- **Rate Limiting** — general + stricter on auth endpoints
- **Transaction Support** for multi-table operations (prescriptions)
- **Scheduling Conflict Detection** for appointments
