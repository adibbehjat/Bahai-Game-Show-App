# Deploying Holy Day Game Show

Everything below uses placeholders: `game.example.org` is your domain, `/srv/game_show` is where you put the app, and `<user>` is a normal (non-root) account that runs it. Replace them with your own.

## Which option is right for you?

| Situation | Option |
|---|---|
| One-off event, no server, no domain | [A. Local network](#a-local-network-mode-laptop-at-the-venue) |
| You have a cheap Linux server (VPS) and a domain | [B. VPS + reverse proxy](#b-linux-vps--reverse-proxy) (Apache, nginx or Caddy) |
| You already use Docker | [C. Docker / Compose](#c-docker--docker-compose) |
| You want a hosted platform, no server admin | [D. PaaS](#d-paas-render-flyio-railway) |

Not sure? Choose **A** for a single gathering, **Caddy in B** for a permanent site (it handles HTTPS for you).

## What you need to know first

- The game is one Node.js process with all rooms **in memory**. There is no database.
- It needs a **host PIN hash** (`npm run hash-pin`), a **session secret** (random 64+ hex characters) and, in production, the exact **public URL** (`PUBLIC_ORIGIN`). It refuses to start in production without them.
- Phones use WebSockets, so any proxy in front must pass them through.

---

## A. Local-network mode (laptop at the venue)

1. Install Node.js 20 or newer from <https://nodejs.org> (installers for Windows, macOS and Linux; choose the LTS version). Check with `node -v`.
2. Get the code (`git clone <your-fork-url>` or download the ZIP from GitHub) and in that folder run `npm ci --omit=dev`.
3. Find the laptop's LAN IP address:
   - **Windows**: open Command Prompt, run `ipconfig`, and read "IPv4 Address" under your Wi-Fi adapter.
   - **macOS**: `ipconfig getifaddr en0` (or System Settings > Wi-Fi > Details).
   - **Linux**: `hostname -I` (first address) or `ip -4 addr`.
   It looks like `192.168.1.23` or `10.0.0.12`.
4. Create the secrets. Get a PIN hash (you will be asked for the PIN twice; at least 6 characters):
   ```
   npm run hash-pin
   ```
   And a session secret:
   ```
   openssl rand -hex 32
   ```
   On Windows (or without openssl):
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. Create a file named `.env` in the app folder (copy `.env.example`) containing:
   ```
   NODE_ENV=production
   HOST=0.0.0.0
   PORT=3719
   PUBLIC_ORIGIN=http://192.168.1.23:3719
   ADMIN_PIN_HASH=scrypt$...paste the line from hash-pin...
   SESSION_SECRET=...64 hex characters...
   ```
   Use your own IP in `PUBLIC_ORIGIN`. It must match exactly what people type, including `http://` and the port.
6. Start it: `npm start`. Allow it through the firewall if your OS asks (Windows shows a prompt; choose **Private networks**).
7. On the big-screen computer open `http://192.168.1.23:3719/host`. Players must be on the **same Wi-Fi** and scan the QR code.

Notes:
- `HOST=0.0.0.0` makes the game reachable from other devices. That is fine on a private LAN you trust, but never do this on a machine directly exposed to the internet without a proxy and firewall.
- Many venue and guest Wi-Fi networks use "client isolation" so devices cannot see each other. If phones cannot connect, switch everyone to a phone hotspot (the laptop joins the hotspot too, and you update `PUBLIC_ORIGIN` to its new IP).
- If the laptop's IP changes, update `PUBLIC_ORIGIN` and restart.
- Without HTTPS some browser features (such as the clipboard) may be limited. The game itself works.
- Do not restart the server during a game; rooms are lost.

---

## B. Linux VPS + reverse proxy

Commands assume Debian/Ubuntu. The app listens on `127.0.0.1:3719`; a proxy on ports 80/443 terminates HTTPS and forwards to it.

### B0. Prerequisites (all proxies)

1. A VPS with a public IP, and a DNS **A record** for `game.example.org` pointing at it. Open ports 80 and 443 in the firewall.
2. Install Node 20+ (from <https://nodejs.org> or NodeSource) and git. Create an unprivileged user, e.g. `<user>`, to run the app.
3. Install the app as `<user>`:
   ```
   sudo mkdir -p /srv/game_show && sudo chown <user>: /srv/game_show
   git clone <your-fork-url> /srv/game_show
   cd /srv/game_show
   npm ci --omit=dev
   cp .env.example .env
   chmod 600 .env
   npm run hash-pin            # copy the ADMIN_PIN_HASH=... line into .env
   openssl rand -hex 32        # use as SESSION_SECRET in .env
   ```
4. Edit `.env`:
   ```
   NODE_ENV=production
   HOST=127.0.0.1
   PORT=3719
   PUBLIC_ORIGIN=https://game.example.org
   ADMIN_PIN_HASH=scrypt$...
   SESSION_SECRET=...
   TRUST_PROXY=loopback
   ```
5. Render the config files for your proxy (written to `deploy/local/`, which git ignores):
   ```
   npm run render-deploy -- --domain=game.example.org --proxy=apache   # or nginx, or caddy
   ```
   It prints the next commands. (The older `DOMAIN=game.example.org npm run render-deploy` still works and defaults to Apache.)

### B1. Process manager

**systemd (recommended).** The renderer wrote `deploy/local/game_show.service` (it runs as the user who rendered it; edit `User=` if needed):
```
sudo cp deploy/local/game_show.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now game_show
systemctl status game_show
journalctl -u game_show -f
```

**pm2 (alternative).**
```
sudo npm install -g pm2
pm2 start server.js --name game_show
pm2 save
pm2 startup        # run the command it prints, with sudo
```

Check the app alone: `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3719/` should print `200`.

### B2. Apache

```
sudo apt install apache2 certbot python3-certbot-apache
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl
sudo cp deploy/local/game.example.org.conf /etc/apache2/sites-available/
sudo a2ensite game.example.org
sudo apache2ctl configtest && sudo systemctl reload apache2
sudo certbot --apache -d game.example.org
```
certbot adds the HTTPS virtual host and the redirect, and renews automatically.

### B3. nginx

```
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/local/game.example.org.nginx.conf /etc/nginx/sites-available/game.example.org
sudo ln -s /etc/nginx/sites-available/game.example.org /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d game.example.org
```
The template uses `map $http_upgrade $connection_upgrade`, `proxy_http_version 1.1`, `Upgrade`/`Connection`, `X-Forwarded-For`/`X-Forwarded-Proto`, and a long `proxy_read_timeout` so WebSockets stay open.

### B4. Caddy

Install Caddy from <https://caddyserver.com/docs/install>, then:
```
sudo cp deploy/local/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Caddy gets and renews the HTTPS certificate itself and proxies WebSockets natively. (If you already have other sites in your Caddyfile, append the rendered block instead of replacing the file.)

### B5. Verify

```
curl -sI https://game.example.org/ | head -1        # HTTP/2 200
```
Open `https://game.example.org/host`, log in, create a game, and join from a phone on mobile data (not your Wi-Fi) to prove it works from outside. Then reboot-proof it: both the proxy and the app must be enabled and active.
```
systemctl is-enabled apache2 game_show     # or nginx / caddy; both "enabled"
systemctl is-active  apache2 game_show     # both "active"
```

---

## C. Docker / Docker Compose

1. Create `.env` as in B0 step 4, but for Docker use:
   ```
   NODE_ENV=production
   PUBLIC_ORIGIN=https://game.example.org
   ADMIN_PIN_HASH='scrypt$...'
   SESSION_SECRET=...
   TRUST_PROXY=1
   ```
   `HOST` and `PORT` are set for you (`0.0.0.0` inside the container). With **Compose**, wrap the PIN hash in single quotes as shown, because it contains `$` characters. With plain `docker run --env-file`, do **not** add quotes. Run `chmod 600 .env`.
2. Compose (recommended):
   ```
   docker compose up -d --build
   docker compose ps          # should become "healthy"
   docker compose logs -f
   ```
   The provided `docker-compose.yml` publishes the port on **127.0.0.1:3719 only**, restarts automatically, uses a read-only filesystem, drops all capabilities, and runs as a non-root user.
   Plain Docker equivalent:
   ```
   docker build -t game_show .
   docker run -d --name game_show --restart unless-stopped --env-file .env \
     -p 127.0.0.1:3719:3719 --read-only --tmpfs /tmp --cap-drop ALL \
     --security-opt no-new-privileges game_show
   ```
3. Put a reverse proxy in front (section B2, B3 or B4; skip the systemd/pm2 step) pointing at `127.0.0.1:3719`.
4. **TRUST_PROXY**: with a proxy on the Docker host forwarding into a published port, the container sees the Docker bridge gateway as the client. Set `TRUST_PROXY=1` (one proxy hop) so the real client IP from `X-Forwarded-For` is used, or the Docker gateway/proxy IP or CIDR (for example `172.17.0.0/16`). Leaving the default makes everyone share one rate-limit bucket.
5. Update:
   ```
   git pull
   docker compose up -d --build
   ```
   This restarts the container and ends running games.

---

## D. PaaS (Render, Fly.io, Railway)

Any platform works if it offers all of these:
- **WebSocket support** (Socket.IO needs it).
- **Exactly one always-on instance.** Rooms are in memory, so do not scale horizontally and do not use plans that put the service to sleep when idle.
- A way to set environment variables as secrets.

Steps, described generically (menus differ by vendor):
1. Fork the repo and create a new web service from it. Use the repo's `Dockerfile`, or a Node build with build command `npm ci --omit=dev` and start command `npm start`.
2. The app reads `PORT` from the environment and the Dockerfile sets `HOST=0.0.0.0`; on a Node (non-Docker) build also set `HOST=0.0.0.0`. Make sure the platform's internal port matches `PORT` (3719 by default, or whatever port the platform assigns).
3. In the dashboard's **environment/secrets settings** (never in the repo) set: `NODE_ENV=production`, `ADMIN_PIN_HASH`, `SESSION_SECRET`, `TRUST_PROXY=1`, and `PUBLIC_ORIGIN`.
4. `PUBLIC_ORIGIN` must be the exact URL the platform gives you (for example `https://your-app.example-platform.app`), or your custom domain if you add one. If you only learn the URL after the first deploy, deploy once, then set it and redeploy.
5. Check the platform's health check path is `/`.

---

## Configuration reference

Set these in `.env` (or the platform's environment). Only `lib/config.js` reads them.

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | production (anything except `development`/`test`) | `production` enforces the secret checks and the strict Origin check. |
| `HOST` | `127.0.0.1` | Interface to bind. Use `0.0.0.0` only in Docker (with the port published to 127.0.0.1) or local-network mode. |
| `PORT` | `3719` | Port to listen on. |
| `PUBLIC_ORIGIN` | none (required in production) | Exact origin people use, e.g. `https://game.example.org`. Used for the WebSocket Origin check and the QR join link. Scheme, host and port must match. |
| `ADMIN_PIN_HASH` | none (required in production) | scrypt hash of the host PIN, from `npm run hash-pin`. |
| `SESSION_SECRET` | none (required in production) | At least 64 hex characters; signs host and player tokens. |
| `TRUST_PROXY` | `loopback` | Which proxies to believe for client IPs: `loopback`, a hop count `1` to `3`, or a comma-separated list of IPs/CIDRs. Anything else (including `true`) fails at startup. |
| `MAX_ROOMS` | `20` | Maximum simultaneous games. |
| `MAX_PLAYERS_PER_ROOM` | `60` | Maximum players per game. |
| `SHOW_SAMPLE_PACKS` | off | `1` or `true` shows sample packs (ids starting with `_`, such as `_template`) to hosts in production. They are always visible in development. A fresh production deploy with no real packs shows an empty list: add packs under `questions/` (see `/kit` and `docs/QUESTION-FORMAT.md`), or set this temporarily to try the game. |
| `QUESTIONS_DIR` | `questions/` | Optional alternative folder of question packs. |

In development (`NODE_ENV=development`) missing secrets are generated at startup and the PIN is printed once.

## Security checklist before going live

- [ ] A strong host PIN (not `123456`; 8+ characters, not reused elsewhere).
- [ ] `chmod 600 .env`; never commit `.env` (it is in `.gitignore`).
- [ ] Behind a proxy, `HOST=127.0.0.1` (Docker: publish on `127.0.0.1` only).
- [ ] HTTPS with a valid certificate, and `PUBLIC_ORIGIN` starts with `https://`.
- [ ] `TRUST_PROXY` matches your setup.
- [ ] On GitHub, enable secret scanning and push protection on your fork (Settings > Code security), and keep the pre-commit hook on: `git config core.hooksPath .githooks`.
- [ ] Keep Node (security releases) and `npm` dependencies updated; rebuild the Docker image periodically.
- [ ] Only the proxy ports (80/443) are open on the firewall, not 3719.

See also [SECURITY.md](SECURITY.md).

## Updating

```
cd /srv/game_show
git pull
npm ci --omit=dev          # only if package-lock.json changed
sudo systemctl restart game_show     # or: pm2 restart game_show
```
Wait until no game is running first. New or edited question packs also need the restart.

## Adding your community's questions

Fresh installs show no packs in production until you add your own (or set `SHOW_SAMPLE_PACKS=1` to try the sample ones). Open `/kit` on your running site for a form that builds valid question lines, add them to `questions/<pack-id>/questions.jsonl` (see `questions/_template`), run `npm run validate-questions`, and restart. Cite an authoritative source in each question's `source` field.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Server exits at startup with "Invalid configuration" | In production, `ADMIN_PIN_HASH`, `SESSION_SECRET` (64+ hex) or `PUBLIC_ORIGIN` is missing or still a placeholder (like `<openssl rand -hex 32>`). Fix `.env`. Check `TRUST_PROXY` is valid too. |
| Hash rejected under Compose | Wrap `ADMIN_PIN_HASH` in single quotes in `.env` for Compose. |
| Phone cannot connect, or keeps reconnecting | The proxy is not passing WebSocket headers (see the nginx/Apache templates), or `PUBLIC_ORIGIN` does not exactly match the address in the browser: `http` vs `https`, `www.` vs none, or a missing port. Fix `.env` and restart. |
| "Game not found" | Wrong room code, the game ended or timed out, or the server restarted (rooms are in memory). Start a new game. |
| 502 Bad Gateway | The app is not running (`systemctl status game_show`, `docker compose ps`) or the proxy points at the wrong port. Test `curl http://127.0.0.1:3719/`. |
| Players are blocked from joining after a few mistakes | Behind Docker or a PaaS every user shares the proxy's IP. Set `TRUST_PROXY=1` (or the proxy IP/CIDR). |
| The QR code opens the wrong address | `PUBLIC_ORIGIN` is wrong. Set it to the public URL (in local mode, the laptop's LAN IP) and restart. |
| Site down after a reboot | The proxy or the app is not enabled. Run `systemctl enable` for both. A healthy backend does not mean the site is up. |
| Works on your Wi-Fi, not for guests | Venue Wi-Fi client isolation; use a phone hotspot (local mode). |

## Scale and limits

One process, all state in memory. Rooms vanish when the server restarts, so do not restart (or deploy) in the middle of a game. A single small server comfortably handles a community event (defaults: 20 rooms, 60 players per room). To run many unrelated communities, run one separate instance per community.
