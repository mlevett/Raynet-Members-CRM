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

When Codex manages the running server, its process ID and output logs are kept in the `logs` directory. You can ask Codex to start, stop, restart, or check the CRM.

Use Node.js 18 or newer:

```powershell
npm start
```

Then open `http://localhost:4173`.

Server-managed records are stored as JSON files in the configured data directory. Some demonstration calendar content is still initialised in the browser; do not import real member data into a public review instance until the remaining event migration is complete.

## First login and user accounts

On the first launch, the CRM asks you to create the initial administrator account. The password must contain at least 10 characters.

After signing in, administrators can open **Users & access** from the sidebar to:

- Create administrator, coordinator, or viewer accounts
- Issue a temporary password
- Reset an account password
- Disable or re-enable an account

Account passwords are hashed with Node.js `scrypt` and are never saved as readable text. User records are kept in `data/users.json`, which is excluded from Git.

Login sessions last for up to eight hours. Only a SHA-256 hash of each random session token is stored in `data/sessions.json`, so sessions survive ordinary server restarts without storing the browser cookie itself.

## Deploy on Virtualmin

The recommended address is a dedicated subdomain such as `members.sehantsraynet.org.uk`. Apache or Nginx handles public HTTPS and reverse-proxies requests to Docker's localhost-only port `127.0.0.1:4173`.

### Docker/GitHub deployment—the same workflow as RAYNET Logger

After creating the subdomain and installing its SSL certificate, connect by SSH and clone the GitHub repository outside `public_html`:

```bash
cd /home/VIRTUALMIN_USER
git clone https://github.com/YOUR_GITHUB_ACCOUNT/YOUR_CRM_REPOSITORY.git raynet-crm
cd raynet-crm
cp .env.example .env
```

Edit `.env` so at minimum it contains:

```ini
APP_URL=https://members.sehantsraynet.org.uk
TRUSTED_ORIGINS=
PUID=1000
PGID=1000
```

Replace `PUID` and `PGID` with the results of these commands so the container can write backups and records as the Virtualmin account:

```bash
id -u
id -g
```

The Compose file supplies the container-only host, port, proxy and data-directory settings. Start it with:

```bash
docker compose up -d --build
docker compose ps
```

The port mapping deliberately begins with `127.0.0.1`; the CRM is not directly exposed to the internet and must be reached through Virtualmin's HTTPS proxy.

### 1. Create the subdomain and certificate

In Virtualmin, create a **Sub-server** named `members.sehantsraynet.org.uk`. Ensure its DNS record points to the Virtualmin server. Select the new virtual server, open **Manage Virtual Server → Setup SSL Certificate → SSL Providers**, request a Let's Encrypt certificate, and enable automatic renewal. Enable the HTTP-to-HTTPS redirect in **Web Configuration → Website Options**.

### 2. Install Node.js

Open a Virtualmin terminal or connect to the server with SSH and check:

```bash
node --version
```

This application requires Node.js 18 or newer. On a current Debian/Ubuntu server, install the distribution package if it is sufficiently recent:

```bash
sudo apt update
sudo apt install nodejs
node --version
```

### 3. Upload the application without Docker (alternative)

Upload the project to `/home/VIRTUALMIN_USER/raynet-crm` rather than `public_html`. Create a separate private data folder:

```bash
mkdir -p /home/VIRTUALMIN_USER/hub-data
chmod 700 /home/VIRTUALMIN_USER/hub-data
```

Copy `.env.example` to `/home/VIRTUALMIN_USER/raynet-crm.env`, set `APP_URL`, `RAYNET_DATA_DIR`, and replace the example home-directory name. Protect it with:

```bash
chmod 600 /home/VIRTUALMIN_USER/raynet-crm.env
```

### 4. Install the service without Docker

Edit `deploy/raynet-crm.service` and replace every `VIRTUALMIN_USER` with the Unix username shown by Virtualmin. As root:

```bash
sudo cp deploy/raynet-crm.service /etc/systemd/system/raynet-crm.service
sudo systemctl daemon-reload
sudo systemctl enable --now raynet-crm
sudo systemctl status raynet-crm
```

To view errors:

```bash
sudo journalctl -u raynet-crm -n 100 --no-pager
```

### 5. Add the reverse proxy

From a root shell, ask Virtualmin to proxy the subdomain root to the local Node service:

```bash
sudo virtualmin create-proxy \
  --domain members.sehantsraynet.org.uk \
  --path / \
  --url http://127.0.0.1:4173
```

Then visit `https://members.sehantsraynet.org.uk`. Do not open port 4173 in the firewall; only Apache/Nginx should reach it locally.

### Production environment example

```ini
APP_URL=https://members.sehantsraynet.org.uk
HOST=127.0.0.1
PORT=4173
TRUST_PROXY=1
TRUSTED_ORIGINS=
RAYNET_DATA_DIR=/home/VIRTUALMIN_USER/hub-data
```

Back up `hub-data` regularly. It contains account, member, contact, renewal, email, and session records. Use anonymised information for the first colleague review.

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

## Production next steps

Before real member data is used, connect the interface to an authenticated server and database, add role-based permissions and audit logs, configure a transactional email provider, and agree data-retention/privacy policies.
