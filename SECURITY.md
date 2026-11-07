# Security

## Threat model

The game is a public web app: anyone who knows the address can open it, and anyone with a room code can try to join. The assets worth protecting are the host controls (creating and running games), the server secrets (admin PIN hash, token-signing secret) and the players' browsers. There are no player accounts, players never type anything about themselves, and the app stores no personal data: the only player data is a generated display name held in memory for the current game.

Threats considered: guessing the host PIN, guessing room codes, a player pretending to be the host, one room reading another's traffic, script injection, cross-site WebSocket hijacking, flooding, leaked secrets in git, and leaking answers early.

## Controls

**Configuration and secrets**
- Only `lib/config.js` reads the environment. In production the server refuses to start unless `ADMIN_PIN_HASH`, `SESSION_SECRET` (at least 64 hex characters) and `PUBLIC_ORIGIN` are set to real values; placeholders are rejected. Anything other than `NODE_ENV=development` or `test` is treated as production.
- The PIN is stored only as an scrypt hash and compared with `crypto.timingSafeEqual`. Secrets and PINs are never logged.
- `.env` and other secret files are in `.gitignore` and `.dockerignore`. A pre-commit hook (`.githooks/pre-commit`) scans staged changes; enable it with `git config core.hooksPath .githooks`. CI runs gitleaks on every push and pull request. Forks should also enable GitHub secret scanning and push protection.
- `HOST` defaults to 127.0.0.1, meant to sit behind a TLS reverse proxy.

**Generated player names**
- There is no free-text name field. A player picks an "Adjective Flower" (from fixed lists) plus an emoji badge (a curated allowlist with no faces, people or rude symbols, enforced by tests) or a number from 1 to 99. `player:join` carries indices only; the server validates them and composes the name itself, so a client can never inject text. Duplicate names get "Name taken".

**Input validation**
- Every Socket.IO event is validated for exact keys and types; invalid payloads are dropped silently. Frames over 2 KB are refused.
- Clients build the page with `textContent` and `createElement` only; `innerHTML` and similar sinks are banned and checked by a test.

**Browser protections**
- Content Security Policy: `default-src 'self'`, no inline scripts or styles, `object-src 'none'`, `frame-ancestors 'none'`, and no network access at all for the question kit page. Helmet adds the other standard headers.
- The WebSocket handshake must come from `PUBLIC_ORIGIN` (any localhost origin in development only).
- No third-party scripts, fonts or CDNs.

**Rooms and sessions**
- Only a host who has entered the PIN can create a room. Room codes are random 6-character codes. Tokens are HMAC-signed, expire, and are bound to one room. Each socket is bound server-side to one room and the room is never read from a payload again.
- Answers are never sent to clients before the reveal. Spelling attempts are scored and discarded immediately.
- Rooms are destroyed 10 minutes after the game ends or after 30 minutes idle. Room and player counts are capped.

**Rate limits and proxies**
- Host PIN attempts: 5 per IP per 10 minutes.
- Failed joins (unknown code, bad payload): 20 per IP per 10 minutes, plus 5 attempts per socket. Successful joins and "Name taken" do not count, so a whole room sharing one Wi-Fi network can join.
- All events: 20 per socket per second, then the socket is disconnected.
- Limits are per client IP, so the app must see real IPs. `TRUST_PROXY` controls which proxies are believed for `X-Forwarded-For`: `loopback` (default, proxy on the same machine), a hop count of 1 to 3, or a comma-separated IP/CIDR list. Anything else, including `true`, fails at startup. Behind Docker or a PaaS use `1` or the proxy's IP/CIDR. Setting it too wide lets clients spoof their IP; too narrow puts everyone in one bucket.

**Surface**
- The only HTTP routes are static files and the pages `/`, `/host`, `/play`, `/kit`, `/styleguide`. There are no upload or write endpoints.

## Deployment hardening

See [DEPLOY.md](DEPLOY.md) for the full guide. The essentials: a strong host PIN, `chmod 600 .env`, never commit `.env`, bind to 127.0.0.1 behind a TLS proxy (or publish Docker ports on 127.0.0.1 only), use HTTPS, set `PUBLIC_ORIGIN` exactly, set `TRUST_PROXY` correctly, enable secret scanning and push protection on your fork, and keep Node and dependencies updated. The Docker image runs as a non-root user and the provided Compose file drops all capabilities and uses a read-only filesystem.

## Reporting a vulnerability

Please open a private GitHub security advisory on this repository. Do not file a public issue for security problems.
