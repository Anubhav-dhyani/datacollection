# GEU Daily Reporting Portal

React/Vite frontend in `frontend/`; Express/MongoDB backend in `backend/`. The portal has three roles: the environment-seeded main admin, sub-admins, and employees.

## Run locally

1. Start MongoDB locally or use a MongoDB Atlas database.
2. In `backend/`, run `npm ci`, copy `.env.example` to `.env`, and set `MONGODB_URI`, `S3_BUCKET`, `AWS_REGION`, `SEED_ADMIN_EMAIL`, and a unique `SEED_ADMIN_PASSWORD` of at least 10 characters. AWS credentials must be available through an IAM role or the AWS SDK credential chain. The seed credentials create the main admin only on a new database; changing them later does not reset the account.
3. Run `npm start` in `backend/`.
4. In `frontend/`, run `npm ci` and `npm run dev`. Open `http://localhost:5173` and sign in with the seeded admin credentials. The initial password must be changed at first sign-in.

The frontend proxies `/api` to the backend. For production, serve both from one origin or configure `FRONTEND_ORIGIN` and secure cookies over HTTPS.

## Reporting workflow

- The main admin creates multiple sub-admins and employees in **Report Team**, assigning each employee to one active sub-admin. Account IDs are generated automatically; the creator enters no Employee ID.
- **Report Team** offers CSV templates and bulk import (up to 100 accounts per file). Admins can download employee (`name,email,sub_admin_emails,initial_password`), sub-admin (`name,email,initial_password`), or combined (`role,name,email,sub_admin_emails,initial_password`) templates. For an employee, put one or more sub-admin email addresses in `sub_admin_emails`, separated by semicolons (`lead@example.com;other@example.com`). In the combined template, use `SUB_ADMIN` or `EMPLOYEE`; an employee can reference sub-admins created in the same file. Sub-admins download the employee template (`name,email,initial_password`), and imported employees are assigned to them automatically. Each row must provide an initial password of at least 10 characters. Imports report success or error for each row; users must change their password at first sign-in. The admin can also select multiple sub-admins when creating or editing one employee; each assigned sub-admin can see that employee's reports and event pictures.
- The main admin can open **Database** to search all account records, including the super-admin, and edit account details, reassign employees, change passwords, disable accounts, or delete sub-admin and employee accounts. A sub-admin must have all employees reassigned or deleted before their account can be deleted. Submitted reports remain in report history after an employee account is deleted.
- A sub-admin sees their assigned employees and can create additional employees assigned to themselves.
- An employee signs in with email and password and submits a daily event report. The server sets **Date** in the Asia/Kolkata time zone and **Name** from the signed-in account. The remaining fields include **Event Detail**, **City**, **Students Attended**, **Data Collected**, and 1–8 **Event Pictures**. The two counts accept non-negative whole numbers or an explicit **N/A** selection. The **Remarks** section is hidden when both counts are numbers. Selecting N/A for either count shows that section and requires **Event remarks**; **Additional remarks** remain optional. No browser location permission is needed. Older reports display a dash for counts they did not record.
- The main admin sees every report. A sub-admin sees reports sent to them; an employee uses the separate **My Reports** page to review their own submissions. Photos follow the same access rules. A date-filtered spreadsheet-style table shows report rows with clickable picture previews for screenshots; the CSV export uses full portal URLs for pictures. Employee filters and today's submitted/pending indicator are included.

Report and account data, sessions, audit logs, and photo metadata are stored in MongoDB. New photo bytes are stored only in a private S3 bucket; the API will not start without `S3_BUCKET` and `AWS_REGION`. Previously stored MongoDB photos remain readable until migrated with `cd backend && npm run migrate:photos:s3 -- --apply` (omit `--apply` for a dry run). Images are limited to 15 MB each. Back up MongoDB and S3.

See [the EC2 and S3 deployment guide](deploy/README.md) for the `mktreport.geu.ac.in` setup.

## Employee photo collages

In **Daily Reports** (or **My Reports**), select a date and optionally an employee, then click **Create collages**. Each employee with a report in that selection appears exactly once, using the first photo from their latest report. Collages contain up to nine photos, with any remaining employees on the final collage. A full collage uses rows of two, three, and four photos like the reference. Photos are cropped centrally to fill their tiles without stretching or black padding, with thin black dividers. Only the city and attendance (e.g. **Jammu, 50**, or **Jammu, N/A**) appear directly on each photo. Employee names, headers, and dark caption bands are omitted. Open a preview or use **Download JPG** to save each collage. If a photo is missing or cannot load, generation stops with an error so an employee is never silently omitted.

Collage sources follow the same admin, sub-admin, and employee permissions as reports. They are fetched separately without the report table's 1,000-row cap. Images are composed in the browser; no generated collage is uploaded or stored on the server.

Each employee's name cell has an **Include in collage** switch, on by default. Switch it off to exclude that employee's photo and attendance from the generated collages. Multiple rows for the same employee share one selection. Changing a switch clears generated previews and download links; create the collages again to apply the selection. Selections remain while filtering employees and reset when selecting a date. These choices apply to the current page session and do not change saved reports.

## API and checks

The API prefix is `/api/v1`. Auth uses an HttpOnly session cookie. The active routes are `/auth`, `/report-team`, `/daily-reports`, `/uploads/report-photo`, `/admin/database`, and `/health`. The old ticket and general data-file endpoints are removed. Existing MongoDB records are left intact; this code does not delete stored records. On startup, legacy `LAB_ASSISTANT` accounts are reclassified as `EMPLOYEE`. Legacy read-only `ADMIN` accounts cannot sign in to this reporting portal.

Run `npm test` in `backend/` for the MongoDB-backed role and reporting integration test. It uses `MONGODB_TEST_URI` if set, otherwise a local `mongod` binary (`MONGOD_BINARY` can override the path). Run `npm run build` in `frontend/` to validate the UI.
