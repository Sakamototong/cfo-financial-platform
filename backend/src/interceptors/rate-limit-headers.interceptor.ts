import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

/**
 * Rate Limit Headers Interceptor
 * 
 * Adds standard rate limit headers to all responses:
 * - X-RateLimit-Limit: Maximum requests allowed in the time window
 * - X-RateLimit-Remaining: Requests remaining in current window
 * - X-RateLimit-Reset: Unix timestamp when the limit resets
 * 
 * These headers help clients implement proper rate limiting behavior.
 */
@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  private readonly DEFAULT_LIMIT = 60;
  private readonly DEFAULT_TTL = 60; // seconds

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();

    // Get throttler metadata if available
    const limit = this.DEFAULT_LIMIT;
    const ttl = this.DEFAULT_TTL;

    // Calculate reset time (current time + TTL)
    const resetTime = Math.floor(Date.now() / 1000) + ttl;

    return next.handle().pipe(
      tap(() => {
        // Add headers if not already present
        if (!response.headersSent) {
          response.setHeader('X-RateLimit-Limit', limit.toString());
          
          // Note: Calculating accurate "remaining" requires tracking state
          // For now, we set a placeholder. In production, integrate with throttler storage.
          const remaining = limit - 1; // Simplified
          response.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
          
          response.setHeader('X-RateLimit-Reset', resetTime.toString());
        }
      }),
    );
  }
}
