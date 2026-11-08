'use strict';
// Dev-only tool: plays a demo game against a throwaway local server and saves the README screenshots
// to docs/screenshots/. Playwright is NOT a project dependency. One-time setup (any folder outside the repo):
//
//   mkdir /tmp/gs-shots && cd /tmp/gs-shots && npm init -y && npm i playwright && npx playwright install chromium
//   (Linux without system browser libraries may also need them on LD_LIBRARY_PATH.)
//   For colour emoji on Linux, install a font such as Noto Color Emoji (fonts-noto-color-emoji, or copy the
//   .ttf into ~/.local/share/fonts and run fc-cache -f). ImageMagick (`convert`) is used to shrink PNGs and
//   to compose hero.png.
//
// Then, from the repo root:
//   PLAYWRIGHT_PATH=/tmp/gs-shots/node_modules/playwright npm run screenshots
//
// It starts `NODE_ENV=development node server.js` on a free port with a temporary questions folder
// (questions/ is never written), reads the one-time dev PIN from the server output, and kills only that
// child process when done. No secrets are used or stored.
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const GameNames = require('../public/shared/names.js');
const { io: ioc } = require('socket.io-client');

const log = (m) => console.log('[screenshots] ' + m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOST_VP = { width: 1280, height: 720 };
const PHONE_VP = { width: 390, height: 844 };

function loadPlaywright() {
  const p = process.env.PLAYWRIGHT_PATH;
  try { return require(p || 'playwright'); } catch (e) {
    console.error('Playwright not found. See the setup notes at the top of scripts/capture-screenshots.js (set PLAYWRIGHT_PATH).');
    process.exit(1);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on('error', reject);
  });
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l));
}

function makeQuestionsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-questions-'));
  for (const id of ['_template', '_reverent-test']) {
    fs.cpSync(path.join(ROOT, 'questions', id), path.join(dir, id), { recursive: true });
  }
  // Keep the demo game short: one of each of four formats, taken from the template pack.
  const lines = readJsonl(path.join(ROOT, 'questions', '_template', 'questions.jsonl'));
  const pick = (type, i = 0) => lines.filter((l) => l.type === type)[i];
  const demo = [pick('single'), pick('order', 2), pick('truefalse', 2), pick('multi')].filter(Boolean);
  fs.writeFileSync(path.join(dir, '_template', 'questions.jsonl'), demo.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // A Naw-Ruz themed pack for the themed lobby shot.
  const src = path.join(ROOT, 'questions', '_template');
  const nr = path.join(dir, 'naw-ruz-demo');
  fs.mkdirSync(nr);
  const meta = JSON.parse(fs.readFileSync(path.join(src, 'pack.json'), 'utf8'));
  meta.id = 'naw-ruz-demo'; meta.theme = 'naw-ruz'; meta.title = 'Naw-Ruz Demo Pack';
  fs.writeFileSync(path.join(nr, 'pack.json'), JSON.stringify(meta, null, 2));
  fs.copyFileSync(path.join(src, 'questions.jsonl'), path.join(nr, 'questions.jsonl'));
  return dir;
}

async function startServer(qdir) {
  const port = await freePort();
  const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), HOST: '127.0.0.1', QUESTIONS_DIR: qdir,
    PUBLIC_ORIGIN: 'https://game.example.org' }; // shown in the join hint and QR; dev mode still allows localhost sockets
  delete env.ADMIN_PIN_HASH; delete env.SESSION_SECRET;
  // cwd is an empty temp dir so dotenv cannot pick up a real .env from the repo.
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: qdir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = '';
  const pin = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start: ' + buf)), 15000);
    const onData = (d) => {
      buf += d;
      const m = /Development admin PIN \(shown once\): (\d+)/.exec(buf);
      if (m) { clearTimeout(t); resolve(m[1]); }
    };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.on('exit', (c) => { clearTimeout(t); reject(new Error('server exited early: ' + buf)); });
  });
  return { child, port, pin, url: `http://127.0.0.1:${port}` };
}

// ---- bots (socket.io-client players) ----
function badgeFor(i) {
  // Mix of emoji and number badges, deterministic.
  const adj = (i * 5 + 2) % GameNames.ADJECTIVES.length;
  const flower = (i * 7 + 3) % GameNames.FLOWERS.length;
  const badge = i % 2 === 0 ? { kind: 'emoji', value: i % GameNames.EMOJIS.length } : { kind: 'number', value: (i * 4 + 3) % 20 };
  return { adj, flower, badge };
}

function emit(sock, ev, payload) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 4000);
    sock.emit(ev, payload, (r) => { clearTimeout(t); resolve(r); });
  });
}

async function joinBots(url, code, n, offset = 0) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    const sock = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise((res, rej) => { sock.once('connect', res); sock.once('connect_error', rej); });
    const bot = { sock, question: null, revealed: 0 };
    sock.on('question:show', (q) => { bot.question = q; });
    sock.on('question:reveal', () => { bot.revealed++; });
    const r = await emit(sock, 'player:join', { code, ...badgeFor(i + offset) });
    if (!r || !r.ok) throw new Error('bot join failed: ' + JSON.stringify(r));
    bots.push(bot);
  }
  return bots;
}

// Pick an answer for a question. `correct` chance is deterministic per bot index.
function answerFor(q, def, correct) {
  if (!def) return null;
  if (q.type === 'single') return correct ? def.answer : (def.answer + 1) % q.choices.length;
  if (q.type === 'multi') return correct ? def.answer : [def.answer[0]];
  if (q.type === 'truefalse') return correct ? def.answer : !def.answer;
  if (q.type === 'order') {
    if (correct) return def.answer;
    const a = def.answer.slice(); [a[0], a[1]] = [a[1], a[0]]; return a;
  }
  if (q.type === 'spell') return correct ? def.word : def.word.slice(0, -1);
  return null;
}

function findDef(defs, q) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return defs.find((d) => d.type === q.type && (
    (q.type === 'single' || q.type === 'multi') ? same(d.choices, q.choices)
      : q.type === 'order' ? same(d.items, q.items)
        : q.type === 'truefalse' ? (q.q ? d.q === q.q : true)
          : true));
}

// ---- main ----
async function main() {
  const pw = loadPlaywright();
  fs.mkdirSync(OUT, { recursive: true });
  const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'gs-raw-'));
  const qdir = makeQuestionsDir();
  const defs = readJsonl(path.join(ROOT, 'questions', '_template', 'questions.jsonl'));
  const server = await startServer(qdir);
  const shots = [];
  let browser; const allBots = [];
  try {
    browser = await pw.chromium.launch();
    const hostCtx = await browser.newContext({ viewport: HOST_VP, reducedMotion: 'reduce' });
    const phoneCtx = await browser.newContext({ viewport: PHONE_VP, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const host = await hostCtx.newPage();
    const phone = await phoneCtx.newPage();

    async function shot(page, name) {
      await page.evaluate(() => document.fonts && document.fonts.ready);
      await sleep(700);
      const file = path.join(raw, name + '.png');
      await page.screenshot({ path: file });
      shots.push(name);
      log('captured ' + name);
    }

    // Welcome page
    await host.goto(server.url + '/');
    await shot(host, 'host-welcome');

    // Kit (desktop with a filled single-choice question, the Format guide drawer, and the phone answers step)
    async function fillKit(page) {
      await page.fill('#fields-q textarea', 'Which season begins with Naw-Ruz?');
      const choices = ['Spring', 'Summer', 'Autumn', 'Winter'];
      for (let i = 0; i < choices.length; i++) await page.fill(`[aria-label="Choice ${i + 1} text"]`, choices[i]);
      await page.check('[aria-label="Choice 1 is correct"]');
    }
    const kit = await hostCtx.newPage();
    await kit.setViewportSize({ width: 1440, height: 900 });
    await kit.goto(server.url + '/kit');
    await kit.waitForSelector('.kit-type-btn');
    await fillKit(kit);
    await shot(kit, 'kit-desktop');
    await kit.click('#btn-guide');
    await kit.waitForSelector('#drawer:not([hidden])');
    await shot(kit, 'kit-guide');
    await kit.close();
    const kitPhone = await phoneCtx.newPage();
    await kitPhone.goto(server.url + '/kit');
    await kitPhone.waitForSelector('.kit-type-btn');
    await kitPhone.click('.kit-type-btn[data-type="single"]');
    await kitPhone.click('#bar-next');
    await kitPhone.fill('#fields-q textarea', 'Which season begins with Naw-Ruz?');
    await kitPhone.click('#bar-next');
    const choices = ['Spring', 'Summer', 'Autumn', 'Winter'];
    for (let i = 0; i < choices.length; i++) await kitPhone.fill(`[aria-label="Choice ${i + 1} text"]`, choices[i]);
    await kitPhone.check('[aria-label="Choice 1 is correct"]');
    await shot(kitPhone, 'kit-phone');
    await kitPhone.close();
    log('kit done');

    // Host signs in and creates a game
    async function hostCreate(packId, opts = {}) {
      await host.goto(server.url + '/host');
      await host.waitForSelector('#pin, .pack-card');
      if (await host.$('#pin')) { await host.fill('#pin', server.pin); await host.keyboard.press('Enter'); }
      await host.waitForSelector(`.pack-card[data-id="${packId}"]`);
      await host.click(`.pack-card[data-id="${packId}"]`);
      if (opts.count) await host.fill('#count', String(opts.count));
      if (!opts.reverent) { const g = await host.$('#gentle'); if (g && await g.isChecked()) await g.uncheck(); }
      await host.click('button:has-text("Create game")');
      await host.waitForSelector('.room-code');
      return (await host.textContent('.room-code')).trim();
    }
    async function hostNewGame() {
      await host.click('button:has-text("New game")');
      await host.waitForSelector('.pack-card');
    }
    async function hostSelectCreate(packId, opts = {}) {
      await host.click(`.pack-card[data-id="${packId}"]`);
      if (opts.count) await host.fill('#count', String(opts.count));
      await host.click('button:has-text("Create game")');
      await host.waitForSelector('.room-code');
      return (await host.textContent('.room-code')).trim();
    }

    // ---- Game 1: template pack, gentle scoring off ----
    const code = await hostCreate('_template', { count: 4 });
    const bots = await joinBots(server.url, code, 6);
    allBots.push(...bots);
    await sleep(500);

    // Phone join screen
    await phone.goto(`${server.url}/play?room=${code}`);
    await phone.waitForSelector('.segmented__btn');
    await phone.click('.segmented__btn:has-text("Emoji")');
    await phone.click('.badge[aria-label="Badge 2"]'); // 🌹
    await shot(phone, 'phone-join');
    await phone.click('button:has-text("Join")');
    await phone.waitForSelector('#bar:not([hidden])', { timeout: 10000 });
    await sleep(800);
    await shot(host, 'host-lobby');
    // The phone shows a short "How to play" screen; dismiss it.
    if (await phone.$('button:has-text("Got it")')) await phone.click('button:has-text("Got it")');
    await host.click('button:has-text("Start game")');

    const taken = new Set();
    let played = 0;
    for (let guard = 0; guard < 15; guard++) {
      await phone.waitForSelector('.choice, .order-item, .spell-input, input[type=text]', { timeout: 15000 });
      await sleep(400);
      const q = bots[0].question;
      const def = findDef(defs, q);
      const first = (k) => !taken.has(k) && taken.add(k);
      const botAnswer = async (b, idx, upto) => {
        const v = answerFor(q, def, idx % 3 !== 2);
        if (v !== null) await emit(b.sock, 'player:answer', { value: v });
      };
      // most bots answer first so the host shows progress
      for (let i = 0; i < 4; i++) await botAnswer(bots[i], i);
      await sleep(300);
      const isSingleShot = q.type === 'single' && first('single');
      const isOrderShot = q.type === 'order' && first('order');
      if (isSingleShot) { await shot(host, 'host-question'); await shot(phone, 'phone-question'); }
      if (isOrderShot) { await shot(host, 'host-question-order'); }

      // phone answers
      const correct = def ? answerFor(q, def, true) : null;
      if (q.type === 'single') await phone.click(`.choice[data-i="${correct}"]`);
      else if (q.type === 'truefalse') await phone.click(`.choice[data-i="${correct ? 0 : 1}"]`);
      else if (q.type === 'multi') { for (const i of correct) await phone.click(`.choice[data-i="${i}"]`); await phone.click('button:has-text("Submit")'); }
      else if (q.type === 'order') {
        for (let k = 0; k < correct.length; k++) {
          await phone.click(`.order-item >> nth=${correct[k]}`);
          if (isOrderShot && k === 1) await shot(phone, 'phone-order');
        }
        await phone.click('button:has-text("Submit")');
      } else if (q.type === 'spell') { await phone.fill('input[type=text]', def.word); await phone.click('button:has-text("Submit")'); }
      await sleep(500);
      if (isSingleShot) await shot(phone, 'phone-locked');
      for (let i = 4; i < bots.length; i++) await botAnswer(bots[i], i);

      await host.waitForSelector('.reveal-banner', { timeout: 30000 });
      await sleep(500);
      if (isSingleShot) { await shot(host, 'host-reveal'); await shot(phone, 'phone-result'); }
      played++;
      const done = ['single', 'order'].every((k) => taken.has(k)) && played >= 3;
      if (done) { await host.click('button:has-text("End game")'); break; }
      await host.click('button:has-text("Next question")');
    }
    await host.waitForSelector('.podium');
    await phone.waitForSelector('.podium, .final, h1', { timeout: 10000 });
    await shot(host, 'host-podium');
    await shot(phone, 'phone-final');
    bots.forEach((b) => b.sock.close());

    // ---- Game 2: reverent pack ----
    await hostNewGame();
    const code2 = await hostSelectCreate('_reverent-test', { count: 5 });
    const bots2 = await joinBots(server.url, code2, 4, 10);
    allBots.push(...bots2);
    await host.click('button:has-text("Start game")');
    await host.waitForSelector('.big-question, .q-body', { timeout: 10000 });
    await sleep(500);
    const q2 = bots2[0].question;
    const def2 = findDef(readJsonl(path.join(ROOT, 'questions', '_reverent-test', 'questions.jsonl')), q2);
    for (let i = 0; i < 2; i++) { const v = answerFor(q2, def2, true); if (v !== null) await emit(bots2[i].sock, 'player:answer', { value: v }); }
    await shot(host, 'host-question-reverent');
    await host.click('button:has-text("End game")');
    await host.waitForSelector('.podium, .over', { timeout: 10000 });
    bots2.forEach((b) => b.sock.close());

    // ---- Game 3: Naw-Ruz themed lobby ----
    await hostNewGame();
    const code3 = await hostSelectCreate('naw-ruz-demo', { count: 5 });
    const bots3 = await joinBots(server.url, code3, 6, 20);
    allBots.push(...bots3);
    await sleep(800);
    await shot(host, 'host-lobby-naw-ruz');
    bots3.forEach((b) => b.sock.close());

    await browser.close(); browser = null;

    // ---- optimise ----
    for (const name of shots) {
      const phoneShot = name.startsWith('phone-') || name === 'kit-phone';
      execFileSync('convert', [path.join(raw, name + '.png'), ...(phoneShot ? ['-resize', '75%'] : []), '-strip', '+dither', '-colors', '128',
        '-define', 'png:compression-level=9', 'PNG8:' + path.join(OUT, name + '.png')]);
    }
    buildHero(raw);
    const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
    console.log(`Wrote ${shots.length + 1} images to docs/screenshots (${(total / 1048576).toFixed(2)} MB)`);
  } finally {
    allBots.forEach((b) => { try { b.sock.close(); } catch (e) { /* ignore */ } });
    if (browser) await browser.close().catch(() => {});
    server.child.kill('SIGTERM');
    fs.rmSync(qdir, { recursive: true, force: true });
    fs.rmSync(raw, { recursive: true, force: true });
  }
}

// Banner for the README: host stage plus two phone frames on an eggshell background.
function buildHero(raw) {
  const r = (n) => path.join(raw, n + '.png');
  const rounded = (src, w, h, radius, dst) => execFileSync('convert', [
    src, '-resize', `${w}x${h}!`,
    '(', '+clone', '-alpha', 'extract', '-fill', 'black', '-colorize', '100', '-fill', 'white',
    '-draw', `roundrectangle 0,0 ${w - 1},${h - 1} ${radius},${radius}`, ')',
    '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', 'PNG32:' + dst]);
  const tmp = (n) => path.join(raw, 'hero-' + n + '.png');
  rounded(r('host-question'), 960, 540, 18, tmp('host'));
  rounded(r('phone-question'), 262, 568, 30, tmp('p1'));
  rounded(r('phone-order'), 262, 568, 30, tmp('p2'));
  const shadow = (n) => ['(', tmp(n), '(', '+clone', '-background', 'rgba(60,50,30,0.35)', '-shadow', '60x14+0+10', ')', '+swap', '-background', 'none', '-layers', 'merge', '+repage', ')'];
  execFileSync('convert', [
    '-size', '1600x700', 'xc:#F6F1E3',
    ...shadow('host'), '-geometry', '+50+75', '-composite',
    ...shadow('p1'), '-geometry', '+1060+55', '-composite',
    ...shadow('p2'), '-geometry', '+1300+95', '-composite',
    '-strip', '+dither', '-colors', '256', 'PNG8:' + path.join(OUT, 'hero.png')]);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
