'use strict';
// In-memory sliding-window limiter with periodic cleanup.
function createLimiter({ windowMs, max, cleanupMs = 60000, now = Date.now }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = now() - windowMs;
    for (const [k, arr] of hits) {
      while (arr.length && arr[0] <= cutoff) arr.shift();
      if (!arr.length) hits.delete(k);
    }
  }, cleanupMs);
  if (timer.unref) timer.unref();

  return {
    // Records an attempt; returns true if allowed, false if over the limit.
    hit(key) {
      const t = now();
      let arr = hits.get(key);
      if (!arr) { arr = []; hits.set(key, arr); }
      while (arr.length && arr[0] <= t - windowMs) arr.shift();
      if (arr.length >= max) return false;
      arr.push(t);
      return true;
    },
    // True when the key has already used up its allowance (does not record a hit).
    isLimited(key) {
      const arr = hits.get(key);
      if (!arr) return false;
      const t = now();
      while (arr.length && arr[0] <= t - windowMs) arr.shift();
      return arr.length >= max;
    },
    size() { return hits.size; },
    close() { clearInterval(timer); hits.clear(); },
  };
}

module.exports = { createLimiter };
