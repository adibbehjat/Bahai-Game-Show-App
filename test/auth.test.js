'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/auth');

test('scrypt hash format and verify', async () => {
  const h = auth.hashPinSync('hunter22', { N: 1024 });
  assert.match(h, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await auth.verifyPin('hunter22', h), true);
  assert.equal(await auth.verifyPin('hunter23', h), false);
  assert.equal(await auth.verifyPin('', h), false);
  assert.equal(await auth.verifyPin('x', 'garbage'), false);
  assert.equal(await auth.verifyPin('x', 'scrypt$3$8$1$AAAA$AAAA'), false);
  assert.notEqual(auth.hashPinSync('hunter22', { N: 1024 }), h); // random salt
  assert.equal(auth.isValidHashFormat(h), true);
  assert.equal(auth.isValidHashFormat('<run npm run hash-pin>'), false);
});

test('host tokens: valid, tampered, expired, wrong secret', () => {
  const secret = 'cd'.repeat(32);
  const { token, hid } = auth.issueHostToken(secret);
  const p = auth.verifyHostToken(secret, token);
  assert.equal(p.hid, hid);
  assert.ok(p.exp - p.iat === 12 * 3600 * 1000);
  assert.equal(auth.verifyHostToken('ef'.repeat(32), token), null);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), exp: Date.now() + 1e12 })).toString('base64url');
  assert.equal(auth.verifyHostToken(secret, forged + '.' + sig), null);
  assert.equal(auth.verifyHostToken(secret, body + '.' + sig.slice(0, -2) + 'AA'), null);
  assert.equal(auth.verifyHostToken(secret, 'nonsense'), null);
  assert.equal(auth.verifyHostToken(secret, token, Date.now() + 13 * 3600 * 1000), null);
});

test('player tokens are bound to a room key', () => {
  const kA = auth.deriveKey('s'.repeat(64), 'room:AAAAAA:n1');
  const kB = auth.deriveKey('s'.repeat(64), 'room:BBBBBB:n2');
  const t = auth.issuePlayerToken(kA, { room: 'AAAAAA', pid: 'abcd1234' });
  assert.equal(auth.verifyPlayerToken(kA, t, 'AAAAAA').pid, 'abcd1234');
  assert.equal(auth.verifyPlayerToken(kB, t, 'BBBBBB'), null);
  assert.equal(auth.verifyPlayerToken(kA, t, 'BBBBBB'), null);
  const old = auth.issuePlayerToken(kA, { room: 'AAAAAA', pid: 'x', now: 0, ttlMs: 1000 });
  assert.equal(auth.verifyPlayerToken(kA, old, 'AAAAAA'), null);
  // a host token must not verify as a player token
  const { token } = auth.issueHostToken('s'.repeat(64));
  assert.equal(auth.verifyPlayerToken(kA, token, 'AAAAAA'), null);
});
