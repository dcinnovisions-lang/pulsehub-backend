/**
 * Simple in-memory response cache middleware.
 *
 * Usage:
 *   const cache = require('../middleware/cache');
 *   router.get('/path', authenticate, cache(60), handler);  // 60 second TTL
 *
 * Invalidation:
 *   cache.invalidate('/search');  // clears all entries whose key contains the string
 */

const store = new Map();
const MAX_ENTRIES = 500;
const EVICT_OLDER_THAN_MS = 10 * 60 * 1000; // 10 minutes

// Periodically evict stale entries regardless of store size
setInterval(() => {
  const cutoff = Date.now() - EVICT_OLDER_THAN_MS;
  for (const [k, v] of store) {
    if (v.ts < cutoff) store.delete(k);
  }
}, EVICT_OLDER_THAN_MS).unref();

const cache = (ttlSeconds = 60) => (req, res, next) => {
  if (req.method !== 'GET') return next();

  const userId = req.user?.id || 'anon';
  const key = `${userId}:${req.originalUrl}`;
  const cached = store.get(key);

  if (cached && Date.now() - cached.ts < ttlSeconds * 1000) {
    return res.json(cached.data);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 200) {
      store.set(key, { data: body, ts: Date.now() });

      // Evict oldest entries if store exceeds hard limit
      if (store.size > MAX_ENTRIES) {
        const sortedKeys = [...store.entries()]
          .sort((a, b) => a[1].ts - b[1].ts)
          .slice(0, store.size - MAX_ENTRIES)
          .map(([k]) => k);
        for (const k of sortedKeys) store.delete(k);
      }
    }
    return originalJson(body);
  };

  next();
};

/**
 * Invalidate all cache entries whose key contains the given pattern string.
 * Call this after write operations to ensure stale data is cleared.
 *
 * @param {string} pattern - substring to match against cache keys
 */
cache.invalidate = (pattern) => {
  for (const key of store.keys()) {
    if (key.includes(pattern)) store.delete(key);
  }
};

module.exports = cache;
