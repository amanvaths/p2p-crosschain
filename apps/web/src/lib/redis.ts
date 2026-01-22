// =============================================================================
// P2P Exchange - Redis Client
// =============================================================================

import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

function createRedisClient(): Redis | null {
  if (process.env.SKIP_REDIS === 'true') {
    return null;
  }
  try {
    return new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null, // Don't retry in dev if Redis unavailable
    });
  } catch {
    console.warn('Redis unavailable, continuing without caching');
    return null;
  }
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

// -----------------------------------------------------------------------------
// Rate Limiting
// -----------------------------------------------------------------------------

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 100; // requests per window

export async function checkRateLimit(key: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetIn: number;
}> {
  // If Redis is not available, allow all requests
  if (!redis) {
    return { allowed: true, remaining: RATE_LIMIT_MAX, resetIn: RATE_LIMIT_WINDOW };
  }

  const now = Math.floor(Date.now() / 1000);
  const windowKey = `ratelimit:${key}:${Math.floor(now / RATE_LIMIT_WINDOW)}`;

  try {
    const count = await redis.incr(windowKey);

    if (count === 1) {
      await redis.expire(windowKey, RATE_LIMIT_WINDOW);
    }

    const ttl = await redis.ttl(windowKey);

    return {
      allowed: count <= RATE_LIMIT_MAX,
      remaining: Math.max(0, RATE_LIMIT_MAX - count),
      resetIn: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Fail open - allow request if Redis is down
    return { allowed: true, remaining: RATE_LIMIT_MAX, resetIn: RATE_LIMIT_WINDOW };
  }
}

// -----------------------------------------------------------------------------
// Caching
// -----------------------------------------------------------------------------

export async function getCached<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const data = await redis.get(`cache:${key}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Cache get failed:', error);
    return null;
  }
}

export async function setCache(
  key: string,
  data: unknown,
  ttlSeconds: number = 60
): Promise<void> {
  if (!redis) return;
  try {
    await redis.setex(`cache:${key}`, ttlSeconds, JSON.stringify(data));
  } catch (error) {
    console.error('Cache set failed:', error);
  }
}

export async function invalidateCache(pattern: string): Promise<void> {
  if (!redis) return;
  try {
    const keys = await redis.keys(`cache:${pattern}`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Cache invalidation failed:', error);
  }
}

export default redis;

