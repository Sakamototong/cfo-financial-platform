import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate Limiting Configuration for CFO Platform
 * 
 * Protects API endpoints from abuse and DDoS attacks.
 * 
 * Configuration:
 * - Default: 60 requests per minute for standard endpoints
 * - Short TTL: 60 seconds (1 minute)
 * 
 * Custom limits can be applied per controller or route using @Throttle() decorator:
 * - Auth endpoints: @Throttle({ default: { limit: 5, ttl: 60000 } })
 * - ETL endpoints: @Throttle({ default: { limit: 20, ttl: 60000 } })
 * - Public endpoints: @SkipThrottle()
 */
export const throttleConfig: ThrottlerModuleOptions = [
  {
    name: 'default',
    ttl: 60000, // 60 seconds in milliseconds
    limit: 60,  // 60 requests per minute
  },
  {
    name: 'auth',
    ttl: 60000, // 60 seconds
    limit: 5,   // 5 login attempts per minute
  },
  {
    name: 'etl',
    ttl: 60000, // 60 seconds
    limit: 20,  // 20 ETL operations per minute (uploads can be large)
  },
];

/**
 * Rate Limit Presets
 * Use these constants with @Throttle() decorator
 */
export const RateLimitPresets = {
  DEFAULT: { default: { limit: 60, ttl: 60000 } },
  AUTH: { auth: { limit: 5, ttl: 60000 } },
  ETL: { etl: { limit: 20, ttl: 60000 } },
  STRICT: { strict: { limit: 10, ttl: 60000 } },
  RELAXED: { relaxed: { limit: 100, ttl: 60000 } },
};
