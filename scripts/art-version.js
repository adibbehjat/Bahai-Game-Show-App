'use strict';
/*
 * art-version.js - cache-busting for the art set.  npm run art-version
 * Hashes every file in public/theme/art/ and writes the short hash into
 *   - ART_VERSION in public/theme/flower.js (appended as ?v=<hash> to every art URL it builds)
 *   - the ?v=<hash> suffix of every /theme/art/ url() in public/theme/theme.css
 * Run it after replacing any art file.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..', 'public', 'theme');
const dir = path.join(root, 'art');
const h = crypto.createHash('sha1');
fs.readdirSync(dir).filter((f) => /\.(png|json)$/.test(f)).sort().forEach((f) => { h.update(f); h.update(fs.readFileSync(path.join(dir, f))); });
const v = h.digest('hex').slice(0, 8);
const js = path.join(root, 'flower.js');
fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replace(/var ART_VERSION = '[^']*';/, `var ART_VERSION = '${v}';`));
const css = path.join(root, 'theme.css');
fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replace(/(\/theme\/art\/[A-Za-z0-9@._-]+\.png)(\?v=[A-Za-z0-9]+)?/g, `$1?v=${v}`));
console.log('art version ' + v);
