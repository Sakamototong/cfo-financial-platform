import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface Scenario {
  id?: string;
  tenant_id: string;
  scenario_name: string;
  scenario_type: 'best' | 'base' | 'worst' | 'custom' | 'ai_generated';
  description?: string;
  is_active: boolean;
  created_by?: string;
}

export interface Assumption {
  id?: string;
  scenario_id: string;
  assumption_category: 'revenue' | 'expense' | 'asset' | 'liability' | 'depreciation' | 'tax' | 'other';
  assumption_key: string;
  assumption_value: number;
  assumption_unit: string;
  notes?: string;
}

@Injectable()
export class ScenarioService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Create a new scenario with assumptions
   */
  async createScenario(
    tenantId: string,
    scenario: Scenario,
    assumptions: Assumption[],
  ): Promise<{ scenario: Scenario; assumptions: Assumption[] }> {
    this.logger.info('Creating scenario', {
      tenantId,
      scenarioName: scenario.scenario_name,
    });

    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Insert scenario
      const scenarioResult = await client.query(
        `INSERT INTO scenarios 
         (tenant_id, scenario_name, scenario_type, description, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          tenantId,
          scenario.scenario_name,
          scenario.scenario_type,
          scenario.description || null,
          scenario.is_active !== undefined ? scenario.is_active : true,
          scenario.created_by,
        ],
      );

      const createdScenario = scenarioResult.rows[0];

      // Insert assumptions
      const createdAssumptions: Assumption[] = [];
      for (const assumption of assumptions) {
        const assumptionResult = await client.query(
          `INSERT INTO scenario_assumptions
           (scenario_id, assumption_category, assumption_key, assumption_value, assumption_unit, notes)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            createdScenario.id,
            assumption.assumption_category,
            assumption.assumption_key,
            assumption.assumption_value,
            assumption.assumption_unit,
            assumption.notes || null,
          ],
        );
        createdAssumptions.push(assumptionResult.rows[0]);
      }

      await client.query('COMMIT');

      this.logger.info('Scenario created successfully', {
        scenarioId: createdScenario.id,
        assumptionsCount: createdAssumptions.length,
      });

      return {
        scenario: createdScenario,
        assumptions: createdAssumptions,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to create scenario', {
        error: (error as any).message,
        tenantId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get scenario by ID with assumptions
   */
  async getScenario(
    tenantId: string,
    scenarioId: string,
  ): Promise<{ scenario: Scenario; assumptions: Assumption[] } | null> {
    const scenarioResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM scenarios WHERE id = $1',
      [scenarioId],
    );

    if (scenarioResult.rows.length === 0) {
      return null;
    }

    const assumptionsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM scenario_assumptions WHERE scenario_id = $1 ORDER BY assumption_category, assumption_key',
      [scenarioId],
    );

    return {
      scenario: scenarioResult.rows[0],
      assumptions: assumptionsResult.rows,
    };
  }

  /**
   * List scenarios for tenant
   */
  async listScenarios(
    tenantId: string,
    filters?: {
      scenario_type?: string;
      is_active?: boolean;
    },
  ): Promise<Scenario[]> {
    let query = 'SELECT * FROM scenarios WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.scenario_type) {
      query += ` AND scenario_type = $${paramIndex}`;
      params.push(filters.scenario_type);
      paramIndex++;
    }

    if (filters?.is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(filters.is_active);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.db.queryTenant(tenantId, query, params);
    return result.rows;
  }

  /**
   * Update scenario (toggle active status, change description)
   */
  async updateScenario(
    tenantId: string,
    scenarioId: string,
    updates: Partial<Pick<Scenario, 'description' | 'is_active'>>,
  ): Promise<Scenario> {
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex}`);
      params.push(updates.description);
      paramIndex++;
    }

    if (updates.is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex}`);
      params.push(updates.is_active);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE scenarios 
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;    params.push(scenarioId);

    const result = await this.db.queryTenant(tenantId, query, params);

    if (result.rows.length === 0) {
      throw new Error('Scenario not found');
    }

    this.logger.info('Scenario updated', { scenarioId });

    return result.rows[0];
  }

  /**
   * Delete scenario (cascade deletes assumptions)
   */
  async deleteScenario(tenantId: string, scenarioId: string): Promise<void> {
    await this.db.queryTenant(tenantId, 'DELETE FROM scenarios WHERE id = $1', [scenarioId]);
    this.logger.info('Scenario deleted', { scenarioId });
  }

  /**
   * Create default scenarios for new tenant (Best/Base/Worst)
   */
  async createDefaultScenarios(tenantId: string, userId: string): Promise<void> {
    this.logger.info('Creating default scenarios', { tenantId });

    const defaultScenarios = [
      {
        scenario_name: 'Best Case',
        scenario_type: 'best' as const,
        description: 'Optimistic scenario with strong revenue growth and controlled costs',
        assumptions: [
          { category: 'revenue' as const, key: 'growth_rate', value: 0.20, unit: '%' },
          { category: 'expense' as const, key: 'cost_reduction', value: 0.10, unit: '%' },
        ],
      },
      {
        scenario_name: 'Base Case',
        scenario_type: 'base' as const,
        description: 'Most likely scenario based on current trends',
        assumptions: [
          { category: 'revenue' as const, key: 'growth_rate', value: 0.10, unit: '%' },
          { category: 'expense' as const, key: 'cost_increase', value: 0.05, unit: '%' },
        ],
      },
      {
        scenario_name: 'Worst Case',
        scenario_type: 'worst' as const,
        description: 'Conservative scenario with revenue decline and cost pressures',
        assumptions: [
          { category: 'revenue' as const, key: 'growth_rate', value: -0.05, unit: '%' },
          { category: 'expense' as const, key: 'cost_increase', value: 0.15, unit: '%' },
        ],
      },
    ];

    for (const def of defaultScenarios) {
      const scenario: Scenario = {
        tenant_id: tenantId,
        scenario_name: def.scenario_name,
        scenario_type: def.scenario_type,
        description: def.description,
        is_active: true,
        created_by: userId,
      };

      const assumptions: Assumption[] = def.assumptions.map((a) => ({
        scenario_id: '', // Will be filled by createScenario
        assumption_category: a.category,
        assumption_key: a.key,
        assumption_value: a.value,
        assumption_unit: a.unit,
      }));

      await this.createScenario(tenantId, scenario, assumptions);
    }

    this.logger.info('Default scenarios created', { tenantId, count: 3 });
  }
}
