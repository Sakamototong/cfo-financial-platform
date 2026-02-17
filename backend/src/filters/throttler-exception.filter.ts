import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

/**
 * Custom Exception Filter for Rate Limiting
 * 
 * Provides user-friendly error messages when rate limits are exceeded.
 * Returns 429 (Too Many Requests) with Retry-After header.
 */
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    // Calculate retry-after time (default to 60 seconds)
    const retryAfter = 60;

    // Set Retry-After header before sending response
    response.header('Retry-After', retryAfter.toString());

    response.status(HttpStatus.TOO_MANY_REQUESTS).json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message: 'คุณส่งคำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง (You have made too many requests. Please wait and try again.)',
      path: request.url,
      timestamp: new Date().toISOString(),
      retryAfter: `${retryAfter} seconds`,
    });
  }
}
