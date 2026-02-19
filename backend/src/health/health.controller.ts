import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

/**
 * Health Check Controller
 * 
 * Provides endpoints for monitoring application health and readiness.
 * These endpoints are exempt from rate limiting and authentication.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle() // Health checks should not be rate limited
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness Probe
   * 
   * Returns 200 if the application is alive and can accept requests.
   * Used by container orchestrators (Kubernetes) to determine if pod should be restarted.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe - check if application is alive' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  async liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      message: 'Service is alive'
    };
  }

  /**
   * Readiness Probe
   * 
   * Returns 200 if the application is ready to handle requests.
   * Checks database connectivity and other critical dependencies.
   * Used by load balancers to determine if traffic should be routed here.
   */
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe - check if application is ready to serve traffic' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  @ApiResponse({ status: 503, description: 'Application is not ready' })
  async readiness() {
    const health = await this.healthService.checkHealth();
    
    if (!health.healthy) {
      // Return 503 Service Unavailable if not ready
      return {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks: health
      };
    }

    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: health
    };
  }

  /**
   * Detailed Health Check
   * 
   * Returns detailed health information including:
   * - Database connection status
   * - Connection pool statistics
   * - System memory and uptime
   */
  @Get('details')
  @ApiOperation({ summary: 'Detailed health check with system metrics' })
  @ApiResponse({ status: 200, description: 'Detailed health information' })
  async details() {
    const health = await this.healthService.checkHealth();
    const poolStats = this.healthService.getPoolStats();
    
    return {
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
        unit: 'MB'
      },
      database: {
        healthy: health.healthy,
        mainPool: health.mainPool,
        tenantPools: health.tenantPools
      },
      connectionPools: poolStats,
      version: process.env.npm_package_version || '2.0.0'
    };
  }
}
