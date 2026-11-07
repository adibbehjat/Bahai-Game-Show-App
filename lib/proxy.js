'use strict';
// TRUST_PROXY parsing and client-IP selection. Never supports "trust everything".
const net = require('node:net');

// Returns { ok: true, value } where value is 'loopback' | integer 1..3 | frozen array of IP/CIDR strings,
// or { ok: false, error }.
function parseTrustProxy(raw) {
  const s = raw === undefined || raw === null || String(raw).trim() === '' ? 'loopback' : String(raw).trim();
  if (s.toLowerCase() === 'loopback') return { ok: true, value: 'loopback' };
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 3 ? { ok: true, value: n } : { ok: false, error: 'TRUST_PROXY hop count must be 1 to 3' };
  }
  const items = s.split(',').map((x) => x.trim());
  if (items.length > 20 || items.some((x) => !x)) return { ok: false, error: 'TRUST_PROXY list is invalid' };
  for (const it of items) {
    const [ip, prefix, extra] = it.split('/');
    const fam = net.isIP(ip);
    if (!fam || extra !== undefined) return { ok: false, error: 'TRUST_PROXY must be loopback, 1-3, or a list of IPs/CIDRs' };
    if (prefix !== undefined) {
      if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > (fam === 4 ? 32 : 128)) return { ok: false, error: 'TRUST_PROXY has an invalid CIDR prefix' };
    }
  }
  return { ok: true, value: Object.freeze(items) };
}

function normalize(addr) {
  if (typeof addr !== 'string') return '';
  const a = addr.trim();
  return a.toLowerCase().startsWith('::ffff:') && net.isIP(a.slice(7)) === 4 ? a.slice(7) : a;
}

function makeTrustedFn(setting) {
  if (setting === 'loopback') {
    return (a) => a === '::1' || (net.isIP(a) === 4 && a.startsWith('127.'));
  }
  const bl = new net.BlockList();
  for (const it of setting) {
    const [ip, prefix] = it.split('/');
    const fam = net.isIP(ip) === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) bl.addAddress(ip, fam); else bl.addSubnet(ip, Number(prefix), fam);
  }
  return (a) => {
    const fam = net.isIP(a);
    return fam !== 0 && bl.check(a, fam === 4 ? 'ipv4' : 'ipv6');
  };
}

// Picks the client IP given the socket peer address, the X-Forwarded-For header and the setting.
function clientIp(remoteAddress, xff, setting) {
  const remote = normalize(remoteAddress);
  const forwarded = typeof xff === 'string' && xff.length < 1000
    ? xff.split(',').map((x) => normalize(x)).filter(Boolean) : [];
  const chain = forwarded.concat(remote); // leftmost = claimed client, rightmost = direct peer
  if (typeof setting === 'number') {
    return pickValid(chain, Math.max(0, chain.length - 1 - setting), remote);
  }
  const trusted = makeTrustedFn(setting);
  let i = chain.length - 1;
  while (i > 0 && trusted(chain[i])) i--;
  return pickValid(chain, i, remote);
}

function pickValid(chain, i, remote) {
  const c = chain[i];
  return net.isIP(c) ? c : remote;
}

module.exports = { parseTrustProxy, clientIp };
