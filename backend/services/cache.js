/**
 * CACHE SERVICE
 *
 * In-memory cache by default.
 * Switches to Redis automatically if REDIS_URL is configured.
 *
 * This file is additive only.
 */

const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes

class CacheClient {
  constructor() {
    this.memory = new Map();
    this.redis = null;
    this.redisUrl = process.env.REDIS_URL || '';
  }

  async connect() {
    if (this.redis || !this.redisUrl) {
      return;
    }

    try {
      const [{ Redis }] = await Promise.all([import('ioredis')]);
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });
    } catch (error) {
      console.warn('[Cache] Redis configured but failed to connect, using memory only:', error.message);
      this.redisUrl = '';
    }
  }

  async get(key) {
    if (!key) {
      return null;
    }

    if (this.redis) {
      const value = await this.redis.get(key);

      if (value !== null) {
        return JSON.parse(value);
      }

      return null;
    }

    const entry = this.memory.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key, value, ttlMs = DEFAULT_TTL_MS) {
    if (!key) {
      return;
    }

    if (this.redis) {
      await this.redis.set(key, JSON.stringify(value), 'PX', Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS));
      return;
    }

    this.memory.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, Number(ttlMs) || DEFAULT_TTL_MS),
    });
  }

  async del(key) {
    if (!key) {
      return;
    }

    if (this.redis) {
      await this.redis.del(key);
      return;
    }

    this.memory.delete(key);
  }

  async flush() {
    if (this.redis) {
      await this.redis.flushall();
      return;
    }

    this.memory.clear();
  }

  keys() {
    if (this.redis) {
      return this.redis.keys('*');
    }

    return Array.from(this.memory.keys());
  }
}

const cache = new CacheClient();

async function connectCache() {
  await cache.connect();
}

module.exports = {
  connectCache,
  cache,
  CacheClient,
  DEFAULT_TTL_MS,
};
