# CLAUDE.md - Operator and LLM guide

Guide for any engineer or LLM working on or deploying this repo. `CONTRACT.md` is the binding spec for protocol, scoring and security; if code and contract disagree, the contract wins until it is updated on purpose. Step-by-step installation lives in [DEPLOY.md](DEPLOY.md); do not duplicate it here.

Examples use placeholders: `game.example.org`, `<app-dir>` (for example `/srv/game_show`) and `<user>`. Never commit real domains, paths, usernames or IPs.

## Architecture

```
phones + big screen -> reverse proxy :443 (TLS) -> 127.0.0.1:3719 -> node server.js
```

- Node >= 20 (CommonJS), Express, Socket.IO, Helmet, dotenv, qrcode. No build step, no CDN, no inline script/style.
- Only `lib/config.js` reads `process.env`. `lib/proxy.js` parses `TRUST_PROXY`.
- Single process, state in memory: restarting ends all running games and rooms. No horizontal scaling.
- `HOST` defaults to 127.0.0.1. Docker needs `HOST=0.0.0.0` inside the container, with the port published only on the host's 127.0.0.1. Local-network mode (a laptop on a private LAN) is the other legitimate use of 0.0.0.0.
- The Socket.IO handshake must come from `PUBLIC_ORIGIN`; per-IP rate limits depend on `TRUST_PROXY` being right.
- Helmet sets the security headers (CSP, frame deny). Do not duplicate them in the proxy.
- Players never type names: they choose a generated "Adjective Flower" plus an emoji or number badge (`public/shared/names.js`). `player:join` takes indices only.
- Protocol notes: `host:create` takes an optional `gentle` flag (no speed bonus); `host:extend` adds 15s (max 3 per question) and `question:show` may be re-emitted for the same index afterwards; `host:speak` and `speakWord` are removed (no audio of any kind). UI microcopy stays warm and brief, with no banter.
- Phases: lobby -> question -> reveal -> question ... -> reveal -> over. There is no scoreboard screen; the host shows a live top-5 sidebar and phones show their own rank.

## File ownership (see CONTRACT.md)

- App: `server.js`, `package.json`, `lib/**`, `public/{index,host,play}.*`, `public/app.css`, `public/play.css`, `public/shared/{names,playstate}.js`, `scripts/hash-pin.js`, `test/**`.
- Design: `public/theme/**`, `public/styleguide.*`, `DESIGN.md`, `scripts/build-art.js`.
- Content: `public/shared/schema.js`, `lib/packs.js`, `scripts/validate-questions.js`, `public/kit.*`, `questions/**`.
- Deploy and docs: `DEPLOY.md`, `README.md`, `CLAUDE.md`, `SECURITY.md`, `deploy/*.template`, `scripts/render-deploy.js`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/**`.
- Orchestrator: `.gitignore`, `.githooks/`, `.env.example`, `CONTRACT.md`.

## Commands

- `npm run dev` - dev server (prints a one-time PIN; no `.env` needed)
- `npm test` - runs `node --test test/*.test.js`; run before every change is considered done
- `npm run validate-questions`, `npm run hash-pin`
- `npm run render-deploy -- --domain=game.example.org --proxy=apache|nginx|caddy` - writes templates to `deploy/local/` (gitignored) and prints next steps

## Deploying

Follow [DEPLOY.md](DEPLOY.md): local network, Linux VPS (Apache, nginx or Caddy; systemd or pm2), Docker, or a PaaS. Config reference and troubleshooting are there.

## Updating

```
git pull
npm ci --omit=dev        # only if package-lock.json changed
sudo systemctl restart game_show
```
Question packs load once at startup, so edits need a restart (run `npm run validate-questions` first). Do not restart during a game; rooms vanish.

## Logs

`journalctl -u game_show -f` (systemd), `pm2 logs game_show`, or `docker compose logs -f`. Logs contain room create/end events only, never PINs, secrets or spelling attempts.

## Post-reboot checklist

A healthy backend does not mean the site is up. Both the reverse proxy and the app service must be enabled AND active (use `apache2`, `nginx` or `caddy` as appropriate):
- `systemctl is-enabled <proxy> game_show` -> both `enabled`
- `systemctl is-active <proxy> game_show` -> both `active`
- `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3719/` -> `200`
- `curl -sI https://game.example.org/` -> `200`

For Docker: `docker compose ps` shows the container `healthy`, and the Docker service is enabled at boot.

## What NOT to do

- Never commit `.env` or any secret; keep the pre-commit hook enabled (`git config core.hooksPath .githooks`).
- Never bind to 0.0.0.0 on a public machine without a firewall; behind a proxy keep `HOST=127.0.0.1` (Docker: publish to `127.0.0.1:3719` only).
- Never set `TRUST_PROXY` to anything broader than your real proxy hops (it rejects `true`); a wrong value lets clients spoof IPs or collapses everyone into one rate-limit bucket.
- Never add upload or other write endpoints. The only HTTP routes are static files and the five pages.
- Never accept a free-text player name; never use `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `document.write`, `eval` or `new Function` in client code (a test enforces this).
- Never add inline scripts, inline styles, inline event handlers or CDN assets (CSP forbids them).
- Never log or store spelling attempts, and never send answers to clients before the reveal.
- Never weaken the production config checks or the Origin check to make something "just work".
- Never edit files outside your ownership area (above) without updating CONTRACT.md.
