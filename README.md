# Centre Point Hospitality — Leads CRM

A lead-management platform for Centre Point Hospitality. Capture and track leads through a
sales pipeline, manage follow-ups / action points / instructions, with role-based access,
dashboards, and a full audit trail.

## Kits (proposals & contracts)

Each lead can have **kits** — the documents sent to a client:

- **Event Kit** — generates a *Proposal* and a *Confirmation Contract* PDF (guest/function
  info, billing, room requirements, event & meal details, session timings, estimated revenue).
  A contract number is auto-assigned.
- **Corporate Rate Kit** — generates the corporate room-rate agreement letter (rate tables
  per property plus the standard terms).

Flow: create the kit on the lead → fill the details → download or **email the PDF** to the
client (SMTP must be configured, see below) → once signed, **upload the signed confirmation**
(photos or PDF, stored in MongoDB GridFS). Uploading flips the kit to *confirmed* and the
lead to *Contracted*.

Emailing requires SMTP settings in `backend/.env` (see `backend/.env.example`):
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and optionally `SMTP_SECURE` / `MAIL_FROM`.
For Gmail, use an [App Password](https://myaccount.google.com/apppasswords), not the account password.

## Previous proposal and contract versions

Banquet enquiries show **Documents and versions** inside **Life cycle**, with numbered
proposal, contract and pro-forma versions and Preview/Download actions. Edits preserve the previous document
inputs as JSON in MongoDB; PDF files are generated in memory when opened, not stored.
Newly rendered documents also capture the guest details, preparer and configured session
timings so later changes do not alter archived versions. JSON uses a small amount of database
space. Historical versions that were never captured cannot be recovered; older saved versions
use the information available in their snapshots. Uploaded and digitally signed copies retain
their existing storage behavior.

**At a glance** belongs to each enquiry and holds its follow-ups, visits, action points,
instructions and internal notes. Opening a lead or enquiry automatically assigns older
unlinked activity when that lead has exactly one enquiry. For leads with zero or multiple
enquiries, the existing records remain under **Unlinked lead activity** on the lead page.
Follow-up lists and reminders link to the enquiry that owns the activity.

## Stack

- **Frontend:** React 18 + Vite, Tailwind CSS, ShadCN-style UI (Radix), React Hook Form + Zod, Recharts
- **Backend:** Node.js + Express (services layer, Zod validation, Helmet, rate limiting), pdfmake (PDF generation), Nodemailer (email), Multer + GridFS (signed-confirmation uploads)
- **Database:** MongoDB + Mongoose
- **Auth:** JWT access token (15 min) + rotating refresh token (httpOnly cookie, 7 days) with reuse detection

## Project layout
```
Leads CP/
  backend/    Express + Mongoose API
  frontend/   React + Vite client
```

## Prerequisites
- Node.js 18+ (tested on 25)
- A local MongoDB running at `mongodb://127.0.0.1:27017` (or set `MONGODB_URI` in `backend/.env`)

## Run it (two terminals)

**1. Backend**
```bash
cd backend
npm install
npm run seed     # creates the admin user
npm run dev      # http://localhost:5000
```

**2. Frontend**
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173  (proxies /api -> backend :5000)
```

Open http://localhost:5173.

## Default credentials (from `npm run seed`)
| Role  | Email           | Password  |
| ----- | --------------- | --------- |
| Admin | admin@cph.local | Admin@123 |

Override with `ADMIN_EMAIL`, `ADMIN_PASSWORD` (and optionally `ADMIN_NAME`) env vars
when seeding. Sales executive accounts are created by the admin from the Users page.

## Roles and section access

Create or edit accounts from **Users**, choose **Executive**, **Manager**, or **Admin**, and assign the required sections. Existing `sales_exec` accounts remain Executives.

| Section | Executive | Manager |
| --- | --- | --- |
| Leads CRM | Works on assigned leads and their enquiries, contracts and follow-ups | Sees all executives' leads, dashboards and reports |
| Function Prospectus | Prepares sheets for assigned leads; sees sheets they made or sheets on their assigned leads | Sees all sheets, approves them, and prints/downloads/emails approved FPs |
| Estimate Accounts | Prepares the existing estimate for accessible FP sheets; sees estimates they made or estimates on assigned leads | Sees all FPs, estimates and confirmed functions; approves estimates |

Admins retain full access and manage users and settings. A Manager's access is limited to assigned sections; an Accounts Manager can review FP sheets through Estimate Accounts without acquiring FP editing or printing permissions.

FP changes or a refresh from the booking reset approval. Existing sheets without an approval are drafts and must be approved before printing. PDF preview is also manager-only because it supplies a printable file. Approved estimates remain final and locked, as before. The existing handwritten consumption and bill break-up tables are unchanged.

Run the API permission regression tests with `cd backend` and `npm test` (`npm.cmd test` in PowerShell if script execution is restricted). These tests exercise routes and services with isolated model stubs and generate an approved FP PDF; they do not change the application database.

## Lead reference
Every lead gets an auto reference: `CPH-[CITY]-[DDMMYY]-[###]` (e.g. `CPH-MUMBAI-300626-001`).

## Pipeline stages
`New → Contacted → Qualified → Proposal → Negotiation → Won / Lost`

## Deploy (Docker / Railway)

The repo root has a `Dockerfile` that builds the React app and runs it together
with the API in one Node process, so a single Railway service hosts the whole
CRM. The image includes LibreOffice Writer, which converts uploaded Word
agreements to PDF before they are emailed.

Local check of the production image (needs Docker Desktop):

```bash
docker compose up --build
# open http://localhost:5000
```

Railway:

1. New project → Deploy from GitHub repo → pick this repo. `railway.json`
   tells Railway to build the `Dockerfile` and to health-check `/api/health`.
2. Add a MongoDB (Railway plugin or MongoDB Atlas) and set these variables on
   the service:

   | Variable | Value |
   | --- | --- |
   | `MONGODB_URI` | connection string, including the database name |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | long random strings |
   | `CRED_ENCRYPTION_KEY` | long random string (encrypts linked mailbox passwords) |
   | `CLIENT_ORIGIN` | the service's public URL, e.g. `https://cp-leads-v2.up.railway.app` (used for e-sign links in emails) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional shared mailbox for proposals |

   `PORT`, `NODE_ENV` and `SERVE_CLIENT_DIR` are set by the Dockerfile and
   Railway; do not override them.
3. Settings → Networking → Generate Domain, then put that URL in
   `CLIENT_ORIGIN` and redeploy.
4. Create the first admin from your machine against the same database:

   ```bash
   cd backend
   MONGODB_URI="<the same connection string>" npm run seed        # admin only (wipes users/leads)
   MONGODB_URI="<the same connection string>" node scripts/seed-demo.mjs   # additive demo data
   ```

Splitting the app across two hosts still works: build the frontend with
`VITE_API_BASE_URL` pointing at the API and set `CLIENT_ORIGIN` on the API to
the frontend's origin. `backend/nixpacks.toml` and `frontend/vercel.json`
remain for that layout.
