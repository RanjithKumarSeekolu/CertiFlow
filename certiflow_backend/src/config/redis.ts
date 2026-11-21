import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

class InMemoryCache {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<"OK"> {
    let expiry: number | undefined;
    if (mode === "EX" && typeof duration === "number") {
      expiry = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiry });
    return "OK";
  }

  async del(key: string): Promise<number> {
    const deleted = this.store.delete(key);
    return deleted ? 1 : 0;
  }
}

class CacheManager {
  private inMemory = new InMemoryCache();
  private redis: Redis | null = null;
  private isRedisConnected = false;

  constructor() {
    try {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });

      this.redis.on("connect", () => {
        this.isRedisConnected = true;
      });

      this.redis.on("error", () => {
        this.isRedisConnected = false;
      });

      this.redis.connect().catch(() => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isRedisConnected && this.redis) {
      try {
        return await this.redis.get(key);
      } catch {
        this.isRedisConnected = false;
      }
    }
    return this.inMemory.get(key);
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string> {
    if (this.isRedisConnected && this.redis) {
      try {
        if (mode && duration) {
          return await this.redis.set(key, value, mode as any, duration);
        }
        return await this.redis.set(key, value);
      } catch {
        this.isRedisConnected = false;
      }
    }
    return this.inMemory.set(key, value, mode, duration);
  }

  async del(key: string): Promise<number> {
    if (this.isRedisConnected && this.redis) {
      try {
        return await this.redis.del(key);
      } catch {
        this.isRedisConnected = false;
      }
    }
    return this.inMemory.del(key);
  }
}

export const cache = new CacheManager();
export default cache;
