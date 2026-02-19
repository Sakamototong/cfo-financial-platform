import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Health Service
 * 
 * Provides health check functionality for monitoring application health.
 * Checks database connectivity and connection pool status.
 */
@Injectable()
export class HealthService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check overall health of the application
   */
  async checkHealth() {
    return await this.db.healthCheck();
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    return this.db.getPoolStats();
  }
}
