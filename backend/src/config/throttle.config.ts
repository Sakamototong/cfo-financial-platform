import { ThrottlerModuleOptions, ThrottlerOptions } from '@nestjs/throttler';

/**
 * Rate Limiting Configuration for CFO Platform
 * 
 * Protects API endpoints from abuse and DDoS attacks.
 * 
 * Configuration Philosophy:
 * - Default: Balanced limit for standard API operations
 * - Auth: Strict limit to prevent brute force attacks
 * - ETL: Higher limit for data import operations
 * 
 * Environment-based configuration:
 * - Development: More permissive for testing
 * - Production: Stricter limits for security
 * 
 * Custom limits can be applied per controller or route using @Throttle() decorator:
 * - @Throttle({ auth: { limit: 10, ttl: 60000 } })
 * - @Throttle({ etl: { limit: 30, ttl: 60000 } })
 * - @SkipThrottle() for health checks
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Throttler options array
 * Used as `throttlers` in ThrottlerModule configuration
 */
export const throttleConfig: ThrottlerOptions[] = [
  {
    name: 'default',
    ttl: 60000,  // 60 seconds in milliseconds
    // Development: 300 req/min (5 req/sec) - comfortable for testing
    // Production: 120 req/min (2 req/sec) - balanced security and UX
    limit: isDevelopment ? 300 : 120,
  },
  {
    name: 'auth',
    ttl: 60000,  // 60 seconds
    // Development: 20 attempts/min - easier testing
    // Production: 10 attempts/min - prevent brute force while allowing legitimate retries
    limit: isDevelopment ? 20 : 10,
  },
  {
    name: 'etl',
    ttl: 60000,  // 60 seconds
    // Development: 100 operations/min - no restrictions for testing
    // Production: 50 operations/min - balance protection with data import needs
    limit: isDevelopment ? 100 : 50,
  },
  {
    name: 'strict',
    ttl: 60000,  // 60 seconds
    // Very strict for sensitive operations
    limit: isDevelopment ? 20 : 5,
  },
];

/**
 * Rate Limit Presets
 * Use these constants with @Throttle() decorator for consistency
 */
export const RateLimitPresets = {
  DEFAULT: { default: { limit: isDevelopment ? 300 : 120, ttl: 60000 } },
  AUTH: { auth: { limit: isDevelopment ? 20 : 10, ttl: 60000 } },
  ETL: { etl: { limit: isDevelopment ? 100 : 50, ttl: 60000 } },
  STRICT: { strict: { limit: isDevelopment ? 20 : 5, ttl: 60000 } },
  RELAXED: { default: { limit: isDevelopment ? 500 : 200, ttl: 60000 } },
};

