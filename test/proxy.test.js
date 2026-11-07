'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTrustProxy, clientIp } = require('../lib/proxy');
const { loadConfig } = require('../lib/config');

test('TRUST_PROXY parsing', () => {
  assert.deepEqual(parseTrustProxy(undefined), { ok: true, value: 'loopback' });
  assert.deepEqual(parseTrustProxy(''), { ok: true, value: 'loopback' });
  assert.deepEqual(parseTrustProxy('loopback'), { ok: true, value: 'loopback' });
  assert.equal(parseTrustProxy('1').value, 1);
  assert.equal(parseTrustProxy('3').value, 3);
  assert.deepEqual(parseTrustProxy('10.0.0.0/8, 192.168.1.5,::1,fd00::/8').value, ['10.0.0.0/8', '192.168.1.5', '::1', 'fd00::/8']);
  for (const bad of ['0', '4', '-1', 'true', 'false', 'all', '*', '1.2.3', '10.0.0.0/33', '::1/129', '10.0.0.0/8/2', '10.0.0.1,', 'loopback,10.0.0.1', 'example.com', '1.5']) {
    assert.equal(parseTrustProxy(bad).ok, false, bad);
  }
});

test('config rejects bad TRUST_PROXY and exposes the parsed value', () => {
  assert.equal(loadConfig({ NODE_ENV: 'development' }).TRUST_PROXY, 'loopback');
  assert.equal(loadConfig({ NODE_ENV: 'development', TRUST_PROXY: '2' }).TRUST_PROXY, 2);
  assert.throws(() => loadConfig({ NODE_ENV: 'development', TRUST_PROXY: 'true' }), /TRUST_PROXY/);
  assert.throws(() => loadConfig({ NODE_ENV: 'development', TRUST_PROXY: '9' }), /TRUST_PROXY/);
});

test('client IP: loopback mode', () => {
  assert.equal(clientIp('127.0.0.1', '203.0.113.7', 'loopback'), '203.0.113.7');
  assert.equal(clientIp('::ffff:127.0.0.1', '203.0.113.7', 'loopback'), '203.0.113.7');
  assert.equal(clientIp('::1', '1.1.1.1, 203.0.113.7', 'loopback'), '203.0.113.7'); // spoofed left entry ignored
  assert.equal(clientIp('127.0.0.1', undefined, 'loopback'), '127.0.0.1');
  assert.equal(clientIp('198.51.100.1', '1.2.3.4', 'loopback'), '198.51.100.1'); // untrusted peer: header ignored
  assert.equal(clientIp('127.0.0.1', 'not-an-ip', 'loopback'), '127.0.0.1');
});

test('client IP: hop-count mode', () => {
  assert.equal(clientIp('10.0.0.2', '203.0.113.7', 1), '203.0.113.7');
  assert.equal(clientIp('10.0.0.2', '6.6.6.6, 203.0.113.7', 1), '203.0.113.7');
  assert.equal(clientIp('10.0.0.2', '203.0.113.7, 10.0.0.1', 2), '203.0.113.7');
  assert.equal(clientIp('10.0.0.2', '6.6.6.6, 203.0.113.7, 10.0.0.1', 2), '203.0.113.7');
  assert.equal(clientIp('10.0.0.2', undefined, 1), '10.0.0.2');
  assert.equal(clientIp('10.0.0.2', 'garbage', 1), '10.0.0.2');
});

test('client IP: IP/CIDR list mode', () => {
  const list = parseTrustProxy('10.0.0.0/8,172.18.0.5').value;
  assert.equal(clientIp('10.1.1.1', '203.0.113.7', list), '203.0.113.7');
  assert.equal(clientIp('172.18.0.5', '9.9.9.9, 203.0.113.7, 10.2.2.2', list), '203.0.113.7');
  assert.equal(clientIp('8.8.8.8', '1.2.3.4', list), '8.8.8.8');
  assert.equal(clientIp('172.18.0.6', '1.2.3.4', list), '172.18.0.6');
  assert.equal(clientIp('10.1.1.1', undefined, list), '10.1.1.1');
});
