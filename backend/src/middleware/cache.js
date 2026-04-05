/**
 * Simple in-memory LRU-style cache middleware
 */

const cache = new Map();
const TTL = {
  short: 60 * 1000,       // 1 minute
  medium: 5 * 60 * 1000,  // 5 minutes
  long: 15 * 60 * 1000,   // 15 minutes
};

export function cacheMiddleware(ttlName = "medium") {
  const ttl = TTL[ttlName] || TTL.medium;

  return (req, res, next) => {
    // Skip cache for non-GET or requests with auth
    if (req.method !== "GET") return next();

    const key = `${req.originalUrl}`;
    const cached = cache.get(key);

    if (cached && Date.now() < cached.expiresAt) {
      res.set("X-Cache", "HIT");
      res.set("X-Cache-Age", Math.floor((Date.now() - cached.createdAt) / 1000) + "s");
      return res.json(cached.data);
    }

    // Wrap res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode === 200) {
        // Keep cache from growing unbounded
        if (cache.size > 500) {
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
        }

        cache.set(key, {
          data,
          createdAt: Date.now(),
          expiresAt: Date.now() + ttl,
        });
      }
      res.set("X-Cache", "MISS");
      return originalJson(data);
    };

    next();
  };
}

export function clearCache(pattern = null) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

export function getCacheStats() {
  return {
    size: cache.size,
    keys: [...cache.keys()].slice(0, 20),
  };
}
