import { Module, Global } from '@nestjs/common';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Redis Throttler Storage Module
 * 
 * Provides Redis-backed storage for rate limiting.
 * Must be imported before ThrottlerModule.
 */
@Global()
@Module({
  providers: [RedisThrottlerStorage],
  exports: [RedisThrottlerStorage],
})
export class RedisThrottlerStorageModule {}
