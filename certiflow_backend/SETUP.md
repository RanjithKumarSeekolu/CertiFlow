# CertiFlow: Fresh Clone Local Setup Guide

This guide enables any evaluator or teammate to go from a fresh clone to a running system with seeded demo data and passing automated tests in under 2 minutes.

---

## Prerequisites

* **Node.js**: v20 or higher
* **npm**: v10 or higher
* *(Optional)* **Docker & Docker Compose** (for running local PostgreSQL & Redis)

---

## 1. Quick Start (Using Configured Cloud Supabase)

The repository is pre-configured to connect directly to the live Supabase PostgreSQL database.

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env` (already pre-filled with credentials):
```bash
cp .env.example .env
```

### Step 3: Run Database Migrations & Seed Demo Data
```bash
npx prisma db push
npm run seed
```

This seeds the 6 required demo personas:
| Persona | Role | Email | Password |
| :--- | :--- | :--- | :--- |
| **Anika Sharma** | Training Centre | `anika@skills.pragati.gov.in` | `Password123!` |
| **Dev Patel** | District Officer 1 | `dev@district.pragati.gov.in` | `Password123!` |
| **Meera Nair** | District Officer 2 | `meera@district.pragati.gov.in` | `Password123!` |
| **Kabir Khan** | District Officer 3 | `kabir@district.pragati.gov.in` | `Password123!` |
| **Neha Gupta** | Quality Team | `neha@quality.pragati.gov.in` | `Password123!` |
| **Farah Sheikh** | State Office | `farah@state.pragati.gov.in` | `Password123!` |

### Step 4: Run Automated Tests
Execute the test suite proving all 6 mandatory hackathon moments:
```bash
npm test
```

### Step 5: Start the Development Server
```bash
npm run dev
```

The server will be available at:
* **API Root**: `http://localhost:8081/`
* **Healthcheck**: `http://localhost:8081/`
* **Public Verification**: `http://localhost:8081/api/verify/:certificateNumber`

---

## 2. Alternative: Single-Command Local Setup (Docker)

If you prefer to run completely locally without Supabase:

```bash
docker compose up -d
```

This starts:
* PostgreSQL on port `5432`
* Redis on port `6379`
* CertiFlow Backend API on port `8081`

---

## 3. Fast Persona Login for Reviewers

Reviewers can switch accounts instantly using the demo login endpoint without manual password entry:

```bash
# Login as Anika (Training Centre)
curl -X POST http://localhost:8081/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"persona": "anika"}'

# Login as Dev (District Officer)
curl -X POST http://localhost:8081/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"persona": "dev"}'

# Login as Farah (State Office)
curl -X POST http://localhost:8081/api/auth/demo-login \
  -H "Content-Type: application/json" \
  -d '{"persona": "farah"}'
```

Returns the JWT bearer token and user role profile.
