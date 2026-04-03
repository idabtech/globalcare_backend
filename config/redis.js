// ═══════════════════════════════════════════════════════
// Redis Configuration — Caching & Sessions
// ═══════════════════════════════════════════════════════

const { createClient } = require("redis");

let client = null;

const getRedisClient = async () => {
  if (client && client.isOpen) return client;
  client = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
  client.on("error", (err) => console.error("Redis error:", err));
  await client.connect();
  return client;
};

// Cache helper: get or compute
const cacheGet = async (key, computeFn, ttlSeconds = 300) => {
  try {
    const redis = await getRedisClient();
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const result = await computeFn();
    await redis.setEx(key, ttlSeconds, JSON.stringify(result));
    return result;
  } catch (err) {
    console.warn("Redis cache miss, computing directly:", err.message);
    return computeFn();
  }
};

const cacheInvalidate = async (pattern) => {
  try {
    const redis = await getRedisClient();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(keys);
  } catch (err) {
    console.warn("Cache invalidation error:", err.message);
  }
};

// const cacheInvalidate = async (pattern) => {
//   try {
//     const redis = await getRedisClient();
//     let cursor = 0;
//     do {
//       const res = await redis.scan(cursor, {
//         MATCH: pattern,
//         COUNT: 100,
//       });
//       cursor = res.cursor;

//       if (res.keys.length > 0) {
//         await redis.del(res.keys);
//       }
//     } while (cursor !== 0);
//   } catch (err) {
//     console.warn("Cache invalidation error:", err.message);
//   }
// };

// module.exports = { getRedisClient, cacheGet, cacheInvalidate };
