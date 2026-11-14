# GEU Daily Reporting Portal

React/Vite frontend in `frontend/`; Express/MongoDB backend in `backend/`. The portal has three roles: the environment-seeded main admin, sub-admins, and employees.

## Run locally

1. Start MongoDB locally or use a MongoDB Atlas database.
2. In `backend/`, run `npm ci`, copy `.env.example` to `.env`, and set `MONGODB_URI`, `S3_BUCKET`, `AWS_REGION`, `SEED_ADMIN_EMAIL`, and a unique `SEED_ADMIN_PASSWORD` of at least 10 characters. AWS credentials must be available through an IAM role or the AWS SDK credential chain. The seed credentials create the main admin only on a new database; changing them later does not reset the account.
3. Run `npm start` in `backend/`.
4. In `frontend/`, run `npm ci` and `npm run dev`. Open `http://localhost:5173` and sign in with the seeded admin credentials. The initial password must be changed at first sign-in.

The frontend proxies `/api` to the backend. For production, serve both from one origin or configure `FRONTEND_ORIGIN` and secure cookies over HTTPS.

## Reporting workflow

- The main admin creates multiple sub-admins and employees in **Report Team**, assigning each employee to one active sub-admin.
- The main admin can open **Database** to search all account records, including the super-admin, and edit account details, reassign employees, change passwords, disable accounts, or delete sub-admin and employee accounts. A sub-admin must have all employees reassigned or deleted before their account can be deleted. Submitted reports remain in report history after an employee account is deleted.
- A sub-admin sees their assigned employees and can create additional employees assigned to themselves.
- An employee signs in with email and password and submits a daily event report. The server sets **Date** in the Asia/Kolkata time zone and **Name** from the signed-in account. The remaining fields are **Event Detail**, **City**, **Event Remarks**, **Additional Remarks**, and 1–8 **Event Pictures**. No browser location permission is needed.
- The main admin sees every report. A sub-admin sees reports sent to them; an employee uses the separate **My Reports** page to review their own submissions. Photos follow the same access rules. Date and employee filters, photo previews, CSV export, and today's submitted/pending employee indicator are included.

Report and account data, sessions, audit logs, and photo metadata are stored in MongoDB. New photo bytes are stored only in a private S3 bucket; the API will not start without `S3_BUCKET` and `AWS_REGION`. Previously stored MongoDB photos remain readable until migrated with `cd backend && npm run migrate:photos:s3 -- --apply` (omit `--apply` for a dry run). Images are limited to 5 MB each. Back up MongoDB and S3.

See [the EC2 and S3 deployment guide](deploy/README.md) for the `mktreport.geu.ac.in` setup.

## API and checks

The API prefix is `/api/v1`. Auth uses an HttpOnly session cookie. The active routes are `/auth`, `/report-team`, `/daily-reports`, `/uploads/report-photo`, `/admin/database`, and `/health`. The old ticket and general data-file endpoints are removed. Existing MongoDB records are left intact; this code does not delete stored records. On startup, legacy `LAB_ASSISTANT` accounts are reclassified as `EMPLOYEE`. Legacy read-only `ADMIN` accounts cannot sign in to this reporting portal.

Run `npm test` in `backend/` for the MongoDB-backed role and reporting integration test. It uses `MONGODB_TEST_URI` if set, otherwise a local `mongod` binary (`MONGOD_BINARY` can override the path). Run `npm run build` in `frontend/` to validate the UI.
