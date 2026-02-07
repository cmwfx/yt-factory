# YT Factory — VPS Deployment Guide

Deploy YT Factory to your VPS at `167.86.90.225`, accessible via `https://25466.xyz`.

Everything runs on a single VPS: the Next.js app, PostgreSQL, Nginx, and SSL.

---

## Prerequisites

- Ubuntu 22.04+ on VPS (167.86.90.225)
- Domain `25466.xyz` A record pointing to `167.86.90.225` (already done)
- Root or sudo SSH access

---

## 1. SSH into the VPS

```bash
ssh root@167.86.90.225
```

---

## 2. Install System Dependencies

```bash
# Update packages
apt update && apt upgrade -y

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify Node
node -v   # should show v20.x
npm -v    # should show 10.x

# FFmpeg (required for video rendering)
apt install -y ffmpeg

# Git
apt install -y git

# Nginx (reverse proxy)
apt install -y nginx

# Certbot (SSL certificates via Let's Encrypt)
apt install -y certbot python3-certbot-nginx
```

---

## 3. Install & Configure PostgreSQL

```bash
# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Start and enable on boot
systemctl start postgresql
systemctl enable postgresql
```

Create the database and user:

```bash
sudo -u postgres psql
```

Inside the PostgreSQL shell, run:

```sql
CREATE USER ytfactory WITH PASSWORD 'replace_with_a_strong_password';
CREATE DATABASE youtube_factory OWNER ytfactory;
GRANT ALL PRIVILEGES ON DATABASE youtube_factory TO ytfactory;
\q
```

Remember the password — you'll need it for the `.env` file.

---

## 4. Clone the Repository

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/cmwfx/yt-factory.git
cd yt-factory
```

---

## 5. Configure Environment Variables

Generate a JWT secret first:

```bash
openssl rand -hex 32
```

Copy the output, then create the `.env` file:

```bash
nano /var/www/yt-factory/.env
```

Paste the following (replace all placeholder values):

```env
# Database
DATABASE_URL="postgresql://ytfactory:replace_with_a_strong_password@localhost:5432/youtube_factory"

# Google AI (Gemini API key)
GOOGLE_GENAI_API_KEY=your_google_genai_api_key_here

# AssemblyAI (for audio transcription)
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# Assets
STYLE_REFERENCE_PATH=./assets/style-reference.jpeg

# Configuration
GENERATE_IDEAS=0
TEST_MODE=false
JOBS_OUTPUT_DIR=./public/jobs

# Auth (paste the output from openssl rand -hex 32)
JWT_SECRET=paste_your_generated_secret_here

# Telegram Notifications (optional — remove if not using)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

---

## 6. Install Dependencies & Build

```bash
cd /var/www/yt-factory

# Install all dependencies
npm install

# Push the database schema to PostgreSQL
npx prisma db push

# Generate Prisma client
npx prisma generate

# Build the Next.js production app
npm run build
```

You should see all 28 routes compile successfully.

If the build fails with a memory error, add swap space first:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Then re-run `npm run build`.

---

## 7. Create Jobs Output Directory

```bash
mkdir -p /var/www/yt-factory/public/jobs
```

---

## 8. Set Up systemd Service

This ensures the app starts on boot and auto-restarts if it crashes.

```bash
nano /etc/systemd/system/yt-factory.service
```

Paste:

```ini
[Unit]
Description=YT Factory
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/yt-factory
ExecStart=/usr/bin/node /var/www/yt-factory/node_modules/.bin/next start --port 3000
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/var/www/yt-factory/.env

# High file descriptor limit for concurrent jobs
LimitNOFILE=65535

# Give renders time to finish before force-killing
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable yt-factory
systemctl start yt-factory
```

Verify it's running:

```bash
systemctl status yt-factory
```

You should see `active (running)`. Test locally on the VPS:

```bash
curl http://localhost:3000
```

---

## 9. Configure Nginx Reverse Proxy

```bash
nano /etc/nginx/sites-available/yt-factory
```

Paste:

```nginx
server {
    listen 80;
    server_name 25466.xyz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # Required for SSE (live progress updates)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for SSE streams
        proxy_buffering off;
        proxy_cache off;

        # Long timeouts for SSE connections and video renders
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Allow uploads up to 50MB
    client_max_body_size 50M;
}
```

Enable the site:

```bash
# Symlink to sites-enabled
ln -s /etc/nginx/sites-available/yt-factory /etc/nginx/sites-enabled/

# Remove the default site
rm -f /etc/nginx/sites-enabled/default

# Test config for syntax errors
nginx -t

# Reload Nginx
systemctl reload nginx
```

At this point `http://25466.xyz` should load the app (without SSL).

---

## 10. Enable SSL with Let's Encrypt

```bash
certbot --nginx -d 25466.xyz
```

When prompted:
1. Enter your email address
2. Agree to terms of service
3. Choose **redirect HTTP to HTTPS** (option 2)

Certbot will automatically update the Nginx config with SSL certificates.

Verify auto-renewal works:

```bash
certbot renew --dry-run
```

Now open **https://25466.xyz** — you should see the login page.

---

## 11. First Login

1. Go to `https://25466.xyz`
2. You'll see the **"Create Admin Account"** screen (since no users exist yet)
3. Pick a username and password — this creates your admin account
4. You'll be redirected to the dashboard

---

## 12. Firewall (Optional but Recommended)

```bash
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (redirects to HTTPS)
ufw allow 443/tcp    # HTTPS
ufw enable
```

Do NOT open port 3000 — Nginx handles all external traffic.

---

## Common Operations

### View live app logs

```bash
journalctl -u yt-factory -f
```

### Restart the app

```bash
systemctl restart yt-factory
```

### Pull updates and redeploy

```bash
cd /var/www/yt-factory
git pull origin master
npm install
npx prisma db push
npm run build
systemctl restart yt-factory
```

### Run a video job manually

```bash
cd /var/www/yt-factory
npx tsx scripts/runJob.ts                   # Normal run
npx tsx scripts/runJob.ts --test            # Test mode
npx tsx scripts/runJob.ts --generate-ideas  # Generate ideas first
```

### Browse the database with Prisma Studio

```bash
cd /var/www/yt-factory
npx prisma studio
```

This opens on port 5555. To access it from your local machine, use an SSH tunnel:

```bash
# Run this on your LOCAL machine
ssh -L 5555:localhost:5555 root@167.86.90.225
```

Then open `http://localhost:5555` in your browser.

### Check PostgreSQL directly

```bash
sudo -u postgres psql -d youtube_factory
```

```sql
SELECT id, title, status, "createdAt" FROM "Video" ORDER BY "createdAt" DESC LIMIT 10;
```

### View Nginx logs

```bash
# Access logs
tail -f /var/log/nginx/access.log

# Error logs
tail -f /var/log/nginx/error.log
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **502 Bad Gateway** | App crashed or isn't running. Run `systemctl status yt-factory` and check logs with `journalctl -u yt-factory -f` |
| **Build fails (out of memory)** | Add swap space (see Step 6) |
| **FFmpeg not found** | `apt install -y ffmpeg` |
| **Database connection refused** | Check PostgreSQL: `systemctl status postgresql`. Verify `DATABASE_URL` in `.env` matches your credentials |
| **SSL certificate expired** | `certbot renew` |
| **SSE/live progress not updating** | Ensure `proxy_buffering off;` is in your Nginx config and reload: `systemctl reload nginx` |
| **Permission denied on /public/jobs** | `chown -R root:root /var/www/yt-factory/public/jobs` |
| **Login page won't load** | Check the app is running and JWT_SECRET is set in `.env` |
| **Telegram notifications not sending** | Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`. These are optional — remove them if not using Telegram |
