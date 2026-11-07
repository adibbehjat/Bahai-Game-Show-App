'use strict';
// Renders deploy templates into deploy/local/ only.
// Usage: node scripts/render-deploy.js --domain=game.example.org [--proxy=apache|nginx|caddy]
//    or: DOMAIN=game.example.org node scripts/render-deploy.js   (legacy; also accepts a positional domain)
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig } = require('../lib/config');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'deploy', 'local');
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function render(template, vars) {
  return template.replace(/\$\{([A-Z_]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
}

function safeWrite(name, content) {
  const target = path.resolve(OUT_DIR, name);
  if (path.dirname(target) !== OUT_DIR) throw new Error('Refusing to write outside deploy/local');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(target, content, { mode: 0o644 });
  return target;
}

const PROXIES = {
  apache: { template: 'apache.conf.template', out: (d) => `${d}.conf` },
  nginx: { template: 'nginx.conf.template', out: (d) => `${d}.nginx.conf` },
  caddy: { template: 'Caddyfile.template', out: () => 'Caddyfile' },
};

function parseArgs(argv, env) {
  let proxy = 'apache';
  let domain = env.DOMAIN || '';
  for (const a of argv.slice(2)) {
    let m;
    if ((m = /^--proxy=(.*)$/.exec(a))) proxy = m[1];
    else if ((m = /^--domain=(.*)$/.exec(a))) domain = m[1];
    else if (!a.startsWith('-')) domain = a; // legacy: first positional argument
    else throw new Error('Unknown option: ' + a);
  }
  proxy = String(proxy).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PROXIES, proxy)) throw new Error('--proxy must be one of: apache, nginx, caddy');
  domain = String(domain).trim().toLowerCase();
  if (!DOMAIN_RE.test(domain)) throw new Error('Provide a valid domain (--domain=game.example.org, env DOMAIN=..., or first argument)');
  return { proxy, domain };
}

function main(argv, env) {
  const { proxy, domain } = parseArgs(argv, env);
  let port;
  try { port = loadConfig({ ...env, NODE_ENV: 'development' }).PORT; } catch { port = 3719; }
  const vars = {
    DOMAIN: domain, PORT: String(port), USER: env.USER || 'www-data',
    APP_DIR: ROOT, NODE_BIN: process.execPath,
  };
  const P = PROXIES[proxy];
  const out = [];
  out.push(safeWrite(P.out(domain), render(fs.readFileSync(path.join(ROOT, 'deploy', P.template), 'utf8'), vars)));
  out.push(safeWrite('game_show.service', render(fs.readFileSync(path.join(ROOT, 'deploy', 'game_show.service.template'), 'utf8'), vars)));
  return out;
}

function nextSteps(proxy, domain) {
  const steps = [
    '',
    'Next steps (see DEPLOY.md for details):',
    '  sudo cp deploy/local/game_show.service /etc/systemd/system/',
    '  sudo systemctl daemon-reload && sudo systemctl enable --now game_show',
  ];
  if (proxy === 'apache') {
    steps.push(
      '  sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers ssl',
      `  sudo cp deploy/local/${domain}.conf /etc/apache2/sites-available/ && sudo a2ensite ${domain}`,
      '  sudo apache2ctl configtest && sudo systemctl reload apache2',
      `  sudo certbot --apache -d ${domain}`);
  } else if (proxy === 'nginx') {
    steps.push(
      `  sudo cp deploy/local/${domain}.nginx.conf /etc/nginx/sites-available/${domain}`,
      `  sudo ln -s /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/`,
      '  sudo nginx -t && sudo systemctl reload nginx',
      `  sudo certbot --nginx -d ${domain}`);
  } else {
    steps.push(
      '  sudo cp deploy/local/Caddyfile /etc/caddy/Caddyfile',
      '  sudo systemctl reload caddy');
  }
  return steps;
}

if (require.main === module) {
  try {
    const files = main(process.argv, process.env);
    files.forEach((f) => console.log('wrote ' + path.relative(ROOT, f)));
    const { proxy, domain } = parseArgs(process.argv, process.env);
    nextSteps(proxy, domain).forEach((l) => console.log(l));
  } catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { main, render, parseArgs };
