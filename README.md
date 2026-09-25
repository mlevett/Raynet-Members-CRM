# SE Hants RAYNET CRM

A self-contained web CRM prototype for managing members, end-user organisations and contacts, membership renewals, reminders, public events, and member availability.

## Quick start with Docker

This repository is packaged in the same style as the RAYNET Logger. Install Docker Desktop or Docker Engine, then run:

```bash
docker compose up -d --build
```

Open `http://localhost:4173` and create the first administrator account. Live records are kept in the host `data/` directory and are not included in the Docker image or Git repository.

To stop the application:

```bash
docker compose down
```

To update a GitHub deployment:

```bash
git pull
docker compose up -d --build
```

To view its status and logs:

```bash
docker compose ps
docker compose logs --tail=100 raynet-crm
```

## Run locally

The easiest option on Windows is to double-click `start_windows.bat` or `Start RAYNET CRM.cmd`. It finds an installed Node.js runtime, opens the browser, and keeps the server running in the command window. Close the window or press `Ctrl+C` to stop the CRM.

If you prefer Docker, double-click `start_windows_docker.bat` instead.

Use Node.js 18 or newer:

```powershell
npm start
```

Then open `http://localhost:4173`.

### Test from another device on your local network

Run `Start RAYNET CRM on network.cmd`. It listens on all network interfaces and displays a detected local-network address to open on another device. The standard launcher remains restricted to the local computer.

Windows may ask whether Node.js can communicate through the firewall. Allow access only on **Private networks**. This network launcher uses plain HTTP and is intended only for temporary testing on a trusted local network; use the HTTPS reverse-proxy deployment below for internet access.

Server-managed records are stored as JSON files in the configured data directory. Older browser-local events are imported into server storage the first time an administrator signs in after upgrading.

## Data storage

The default `json` storage driver keeps private server records in `RAYNET_DATA_DIR`. This includes users, members, end users, events, renewals, sessions, settings, and guest-helper offers.

An optional MySQL-backed document store is available for server records. Existing JSON installations remain compatible and the JSON files act as a local working cache when MySQL is enabled.

MySQL can be selected during the first-time setup wizard. On an existing installation, sign in as an administrator and open **Database settings**. Use **Test connection**, then **Save & migrate** to copy all existing JSON collections into MySQL and make it active. The JSON files are retained as a local recovery cache; the database password is masked in the interface and stored in the private data directory. Environment variables still take precedence for managed deployments.

After confirming that MySQL is active and backed up, **Remove local JSON files** verifies every CRM collection in MySQL before deleting the local record cache. The application then runs in MySQL-only mode and does not recreate JSON record files. Switching back to JSON explicitly restores the files from MySQL. Fresh installations that select MySQL use MySQL-only storage automatically after setup verifies the database.

1. Create a MySQL database and a restricted database user.
2. For a direct Node installation, run `npm install` once.
3. Set `STORAGE_DRIVER=mysql` and the `MYSQL_*` values shown in `.env.example`.
4. Start the CRM. It creates the `raynet_crm_store` table and imports existing JSON collections if the table is empty.

On later starts, MySQL is treated as the source of truth and its collections are loaded into the local cache. Back up the MySQL database in production. Never commit `.env` or database passwords to Git.

## First login and user accounts

On the first launch, the CRM asks you to create the first member profile and its linked administrator account. The password must contain at least 10 characters. New installations start empty; the setup page includes an optional checkbox for clearly labelled sample members, end users, and events.

After signing in, administrators can open **Users & access** from the sidebar to:

- Create administrator, coordinator, or viewer accounts
- Issue a temporary password
- Reset an account password
- Disable or re-enable an account

Account passwords are hashed with Node.js `scrypt` and are never saved as readable text. User records are kept in `data/users.json`, which is excluded from Git.

Login sessions last for up to eight hours. Only a SHA-256 hash of each random session token is stored in `data/sessions.json`, so sessions survive ordinary server restarts without storing the browser cookie itself.

## Branding

Administrators can open **Branding** to change the organisation name, short name, subtitle, primary colour, accent colour, and logo. Branding is applied to the login screen, staff CRM, and public member portal. The supplied South East Hampshire RAYNET logo and its navy/red colour scheme are the defaults.

## Included workflows

- Member records, status, role, renewal dates, search, filtering and CSV export
- End-user organisations with nested service contact counts and contact views
- Renewal responses (`Renewing`, `Not renewing`, `No response`)
- Initial and follow-up reminder logging
- Public calendar and event publishing
- Public member portal for event availability responses
- Responsive desktop and mobile layouts
- Secure first-run setup, login/logout, user roles and account administration
- Optional links between login accounts and member records
- Member/committee classification with configurable committee positions
