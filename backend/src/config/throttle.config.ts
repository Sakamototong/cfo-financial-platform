import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate Limiting Configuration for CFO Platform
 * 
 * Protects API endpoints from abuse and DDoS attacks.
 * 
 * Configuration (Adjusted for Development/UAT):
 * - Default: 300 requests per minute for standard endpoints (increased for UAT)
 * - Short TTL: 60 seconds (1 minute)
 * 
 * NOTE: For production, reduce default limit to 100 req/min
 * 
 * Custom limits can be applied per controller or route using @Throttle() decorator:
 * - Auth endpoints: @Throttle({ auth: { limit: 10, ttl: 60000 } })
 * - ETL endpoints: @Throttle({ etl: { limit: 30, ttl: 60000 } })
 * - Public endpoints: @SkipThrottle()
 */
export const throttleConfig: ThrottlerModuleOptions = [
  {
    name: 'default',
    ttl: 60000,  // 60 seconds in milliseconds
    limit: 300,  // 300 requests per minute (5 req/sec) - Development/UAT friendly
  },
  {
    name: 'auth',
    ttl: 60000,  // 60 seconds
    limit: 10,   // 10 login attempts per minute (increased from 5)
  },
  {
    name: 'etl',
    ttl: 60000,  // 60 seconds
    limit: 30,   // 30 ETL operations per minute (uploads can be large)
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
