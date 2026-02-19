import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * ThrottlerStorageRecord shape as defined by @nestjs/throttler
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed Throttler Storage
 * 
 * Provides persistent, shared rate limiting state across multiple server instances.
 * Falls back gracefully if Redis is unavailable.
 * 
 * Key benefits over in-memory storage:
 * - Survives server restarts
 * - Shared state across horizontally scaled instances
 * - Configurable memory limits via Redis maxmemory
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private isConnected = false;

  // In-memory fallback when Redis is unavailable
  private readonly memoryStore = new Map<string, { count: number; resetAt: number; blockedAt: number; blockExpiry: number }>();

  async onModuleInit() {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT || 6379);

    if (!host) {
      this.logger.warn('REDIS_HOST not set - using in-memory throttler storage (not recommended for production)');
      return;
    }

    try {
      this.redis = new Redis({
        host,
        port,
        retryStrategy: (times) => {
          // Retry up to 3 times, then fallback to in-memory
          if (times > 3) {
            this.logger.warn('Redis connection failed after 3 retries - falling back to in-memory storage');
            return null; // Stop retrying
          }
          return Math.min(times * 500, 2000);
        },
        lazyConnect: true,
        enableOfflineQueue: false,
        connectTimeout: 5000,
        commandTimeout: 3000,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      });

      this.redis.on('error', (err) => {
        if (this.isConnected) {
          this.logger.warn(`Redis error - falling back to in-memory: ${err.message}`);
        }
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
      });

      await this.redis.connect();
    } catch (err: any) {
      this.logger.warn(`Failed to connect to Redis: ${err.message} - using in-memory fallback`);
      this.redis = null;
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    // Use Redis if available, otherwise fallback to in-memory
    if (this.isConnected && this.redis) {
      return this.incrementRedis(key, ttl, limit, blockDuration);
    }
    return this.incrementMemory(key, ttl, limit, blockDuration);
  }

  private async incrementRedis(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const blockKey = `block:${key}`;
    const now = Date.now();

    try {
      // Check if blocked
      const blockExpiry = await this.redis!.pttl(blockKey);
      if (blockExpiry > 0) {
        // Count is over limit, return blocked record
        const totalHits = await this.redis!.get(key);
        return {
          totalHits: parseInt(totalHits || '0') + 1,
          timeToExpire: await this.redis!.pttl(key),
          isBlocked: true,
          timeToBlockExpire: blockExpiry,
        };
      }

      // Increment count with TTL
      const pipeline = this.redis!.pipeline();
      pipeline.incr(key);
      pipeline.pttl(key);
      const results = await pipeline.exec();

      const count = (results?.[0]?.[1] as number) || 0;
      let timeToExpire = (results?.[1]?.[1] as number) || 0;

      // Set TTL if this is the first hit
      if (count === 1 || timeToExpire < 0) {
        await this.redis!.pexpire(key, ttl);
        timeToExpire = ttl;
      }

      // Block if limit exceeded
      const isBlocked = count > limit;
      let timeToBlockExpire = 0;

      if (isBlocked && blockDuration > 0) {
        await this.redis!.set(blockKey, '1', 'PX', blockDuration);
        timeToBlockExpire = blockDuration;
      }

      return {
        totalHits: count,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      };
    } catch (err: any) {
      this.logger.warn(`Redis increment error, falling back to memory: ${err.message}`);
      this.isConnected = false;
      return this.incrementMemory(key, ttl, limit, blockDuration);
    }
  }

  private async incrementMemory(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    const blockKey = `block:${key}`;

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
      this.cleanupExpired();
    }

    // Check if blocked
    const blockRecord = this.memoryStore.get(blockKey);
    if (blockRecord && blockRecord.blockExpiry > now) {
      return {
        totalHits: (this.memoryStore.get(key)?.count || 0) + 1,
        timeToExpire: (this.memoryStore.get(key)?.resetAt || now + ttl) - now,
        isBlocked: true,
        timeToBlockExpire: blockRecord.blockExpiry - now,
      };
    }

    // Get or create record
    const record = this.memoryStore.get(key);

    if (!record || record.resetAt <= now) {
      // New window
      this.memoryStore.set(key, {
        count: 1,
        resetAt: now + ttl,
        blockedAt: 0,
        blockExpiry: 0,
      });
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }

    // Increment existing record
    record.count++;
    const timeToExpire = record.resetAt - now;
    const isBlocked = record.count > limit;
    let timeToBlockExpire = 0;

    if (isBlocked && blockDuration > 0 && !record.blockExpiry) {
      record.blockedAt = now;
      record.blockExpiry = now + blockDuration;

      this.memoryStore.set(blockKey, {
        count: 1,
        resetAt: now + blockDuration,
        blockedAt: now,
        blockExpiry: now + blockDuration,
      });

      timeToBlockExpire = blockDuration;
    } else if (isBlocked && record.blockExpiry) {
      timeToBlockExpire = Math.max(0, record.blockExpiry - now);
    }

    return {
      totalHits: record.count,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [key, value] of this.memoryStore.entries()) {
      if (value.resetAt <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * Get storage health status
   */
  getStatus() {
    return {
      type: this.isConnected ? 'redis' : 'memory',
      redisConnected: this.isConnected,
      memoryEntries: this.memoryStore.size,
    };
  }
}
