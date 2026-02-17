import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';

export interface VarianceReport {
  period: string;
  statement_type: 'PL' | 'BS' | 'CF';
  line_items: VarianceLineItem[];
  summary: VarianceSummary;
}

export interface VarianceLineItem {
  line_code: string;
  line_name: string;
  actual_amount: number;
  projected_amount: number;
  variance_amount: number;
  variance_percent: number;
  status: 'favorable' | 'unfavorable' | 'neutral';
}

export interface VarianceSummary {
  total_actual: number;
  total_projected: number;
  total_variance: number;
  total_variance_percent: number;
  favorable_count: number;
  unfavorable_count: number;
  accuracy_score: number; // How close projections were (0-100)
}

export interface ComparisonReport {
  comparison_id: string;
  tenant_id: string;
  actual_statement_id: string;
  projection_id: string;
  period_start: string;
  period_end: string;
  report_date: string;
  variance_report: VarianceReport;
  created_at?: string;
}

export interface TrendAnalysis {
  line_code: string;
  line_name: string;
  periods: TrendPeriod[];
  trend_direction: 'increasing' | 'decreasing' | 'stable';
  average_growth_rate: number;
  volatility: number; // Standard deviation
}

export interface TrendPeriod {
  period: string;
  actual: number;
  projected?: number;
  variance?: number;
  growth_rate?: number;
}

export interface BudgetVsActualReport {
  period: string;
  budget_id: string;
  budget_name: string;
  statement_id: string;
  statement_type: string;
  line_items: BudgetVsActualLineItem[];
  summary: BudgetVsActualSummary;
}

export interface BudgetVsActualLineItem {
  account_code: string;
  account_name: string;
  department?: string;
  budget_amount: number;
  actual_amount: number;
  variance_amount: number;
  variance_percent: number;
  status: 'favorable' | 'unfavorable' | 'neutral';
}

export interface BudgetVsActualSummary {
  total_budget: number;
  total_actual: number;
  total_variance: number;
  total_variance_percent: number;
  favorable_count: number;
  unfavorable_count: number;
  on_budget_count: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Compare actual statement with projected statement
   * Returns variance analysis
   */
  async compareActualVsProjected(
    tenantId: string,
    actualStatementId: string,
    projectionId: string,
    periodNumber: number,
  ): Promise<VarianceReport> {
    this.logger.info('Comparing actual vs projected', {
      tenantId,
      actualStatementId,
      projectionId,
      periodNumber,
    });

    // Load actual statement
    const actualResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_statements WHERE id = $1',
      [actualStatementId],
    );

    if (actualResult.rows.length === 0) {
      throw new Error('Actual statement not found');
    }

    const actualStatement = actualResult.rows[0];

    // Load actual line items
    const actualItemsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_line_items WHERE statement_id = $1 ORDER BY line_order',
      [actualStatementId],
    );

    // Load projected statement for specific period
    const projectedResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM projected_statements WHERE projection_id = $1 AND period_number = $2',
      [projectionId, periodNumber],
    );

    if (projectedResult.rows.length === 0) {
      throw new Error('Projected statement not found');
    }

    const projectedStatement = projectedResult.rows[0];
    const projectedItems = projectedStatement.line_items || [];

    // Calculate variance for each line item
    const varianceLineItems: VarianceLineItem[] = [];
    let totalActual = 0;
    let totalProjected = 0;
    let favorableCount = 0;
    let unfavorableCount = 0;

    for (const actualItem of actualItemsResult.rows) {
      const projectedItem = projectedItems.find(
        (p: any) => p.line_code === actualItem.line_code,
      );

      if (projectedItem) {
        const actualAmount = parseFloat(actualItem.amount);
        const projectedAmount = projectedItem.projected_amount;
        const varianceAmount = actualAmount - projectedAmount;
        const variancePercent =
          projectedAmount !== 0
            ? (varianceAmount / Math.abs(projectedAmount)) * 100
            : 0;

        // Determine if variance is favorable or unfavorable
        // For revenue (REV-*), actual > projected is favorable
        // For expenses (COGS-*, OPEX-*), actual < projected is favorable
        let status: 'favorable' | 'unfavorable' | 'neutral' = 'neutral';
        if (Math.abs(variancePercent) > 5) {
          // Only flag if variance > 5%
          if (actualItem.line_code.startsWith('REV-')) {
            status = varianceAmount > 0 ? 'favorable' : 'unfavorable';
          } else if (
            actualItem.line_code.startsWith('COGS-') ||
            actualItem.line_code.startsWith('OPEX-') ||
            actualItem.line_code.startsWith('DEPR-')
          ) {
            status = varianceAmount < 0 ? 'favorable' : 'unfavorable';
          }
        }

        if (status === 'favorable') favorableCount++;
        if (status === 'unfavorable') unfavorableCount++;

        varianceLineItems.push({
          line_code: actualItem.line_code,
          line_name: actualItem.line_name,
          actual_amount: actualAmount,
          projected_amount: projectedAmount,
          variance_amount: varianceAmount,
          variance_percent: variancePercent,
          status,
        });

        totalActual += actualAmount;
        totalProjected += projectedAmount;
      }
    }

    const totalVariance = totalActual - totalProjected;
    const totalVariancePercent =
      totalProjected !== 0 ? (totalVariance / totalProjected) * 100 : 0;

    // Calculate accuracy score (100% - average absolute variance %)
    const avgAbsoluteVariance =
      varianceLineItems.reduce(
        (sum, item) => sum + Math.abs(item.variance_percent),
        0,
      ) / varianceLineItems.length;
    const accuracyScore = Math.max(0, 100 - avgAbsoluteVariance);

    const summary: VarianceSummary = {
      total_actual: totalActual,
      total_projected: totalProjected,
      total_variance: totalVariance,
      total_variance_percent: totalVariancePercent,
      favorable_count: favorableCount,
      unfavorable_count: unfavorableCount,
      accuracy_score: Math.round(accuracyScore * 100) / 100,
    };

    return {
      period: `${actualStatement.period_start} to ${actualStatement.period_end}`,
      statement_type: actualStatement.statement_type,
      line_items: varianceLineItems,
      summary,
    };
  }

  /**
   * Generate trend analysis for a specific line item across multiple periods
   */
  async getTrendAnalysis(
    tenantId: string,
    lineCode: string,
    startDate: string,
    endDate: string,
  ): Promise<TrendAnalysis> {
    this.logger.info('Generating trend analysis', {
      tenantId,
      lineCode,
      startDate,
      endDate,
    });

    // Get all actual statements in date range
    const statementsResult = await this.db.queryTenant(
      tenantId,
      `SELECT s.id, s.period_start, s.period_end, l.line_name, l.amount
       FROM financial_statements s
       JOIN financial_line_items l ON l.statement_id = s.id
       WHERE s.tenant_id = $1 
         AND l.line_code = $2
         AND s.period_start >= $3
         AND s.period_end <= $4
         AND s.scenario = 'actual'
       ORDER BY s.period_start`,
      [tenantId, lineCode, startDate, endDate],
    );

    if (statementsResult.rows.length === 0) {
      throw new Error('No data found for trend analysis');
    }

    const lineName = statementsResult.rows[0].line_name;
    const periods: TrendPeriod[] = [];
    const amounts: number[] = [];

    for (let i = 0; i < statementsResult.rows.length; i++) {
      const row = statementsResult.rows[i];
      const actual = parseFloat(row.amount);
      amounts.push(actual);

      const growthRate =
        i > 0 && amounts[i - 1] !== 0
          ? ((actual - amounts[i - 1]) / Math.abs(amounts[i - 1])) * 100
          : 0;

      periods.push({
        period: `${row.period_start} to ${row.period_end}`,
        actual,
        growth_rate: growthRate,
      });
    }

    // Calculate trend direction
    const firstAmount = amounts[0];
    const lastAmount = amounts[amounts.length - 1];
    let trendDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';

    const totalChange =
      ((lastAmount - firstAmount) / Math.abs(firstAmount)) * 100;
    if (Math.abs(totalChange) > 5) {
      trendDirection = totalChange > 0 ? 'increasing' : 'decreasing';
    }

    // Calculate average growth rate
    const growthRates = periods
      .slice(1)
      .map((p) => p.growth_rate!)
      .filter((r) => !isNaN(r));
    const avgGrowthRate =
      growthRates.length > 0
        ? growthRates.reduce((sum, r) => sum + r, 0) / growthRates.length
        : 0;

    // Calculate volatility (standard deviation)
    const mean =
      amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) /
      amounts.length;
    const volatility = Math.sqrt(variance);

    return {
      line_code: lineCode,
      line_name: lineName,
      periods,
      trend_direction: trendDirection,
      average_growth_rate: Math.round(avgGrowthRate * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
    };
  }

  /**
   * Get summary report for multiple periods
   */
  async getMultiPeriodSummary(
    tenantId: string,
    statementType: 'PL' | 'BS' | 'CF',
    startDate: string,
    endDate: string,
  ): Promise<any> {
    this.logger.info('Generating multi-period summary', {
      tenantId,
      statementType,
      startDate,
      endDate,
    });

    const result = await this.db.queryTenant(
      tenantId,
      `SELECT 
         s.id,
         s.period_start,
         s.period_end,
         s.scenario,
         jsonb_agg(
           jsonb_build_object(
             'line_code', l.line_code,
             'line_name', l.line_name,
             'amount', l.amount
           ) ORDER BY l.line_order
         ) as line_items
       FROM financial_statements s
       JOIN financial_line_items l ON l.statement_id = s.id
       WHERE s.tenant_id = $1
         AND s.statement_type = $2
         AND s.period_start >= $3
         AND s.period_end <= $4
       GROUP BY s.id, s.period_start, s.period_end, s.scenario
       ORDER BY s.period_start`,
      [tenantId, statementType, startDate, endDate],
    );

    return result.rows;
  }

  /**
   * Export variance report to structured format
   */
  async exportVarianceReport(
    tenantId: string,
    actualStatementId: string,
    projectionId: string,
    periodNumber: number,
    format: 'json' | 'csv',
  ): Promise<any> {
    const report = await this.compareActualVsProjected(
      tenantId,
      actualStatementId,
      projectionId,
      periodNumber,
    );

    if (format === 'csv') {
      // Convert to CSV format
      const headers = [
        'Line Code',
        'Line Name',
        'Actual',
        'Projected',
        'Variance Amount',
        'Variance %',
        'Status',
      ];

      const rows = report.line_items.map((item) => [
        item.line_code,
        item.line_name,
        item.actual_amount.toFixed(2),
        item.projected_amount.toFixed(2),
        item.variance_amount.toFixed(2),
        item.variance_percent.toFixed(2) + '%',
        item.status,
      ]);

      const csv =
        headers.join(',') +
        '\n' +
        rows.map((row) => row.join(',')).join('\n') +
        '\n\nSummary\n' +
        `Total Actual,${report.summary.total_actual.toFixed(2)}\n` +
        `Total Projected,${report.summary.total_projected.toFixed(2)}\n` +
        `Total Variance,${report.summary.total_variance.toFixed(2)}\n` +
        `Variance %,${report.summary.total_variance_percent.toFixed(2)}%\n` +
        `Accuracy Score,${report.summary.accuracy_score}%\n`;

      return { format: 'csv', data: csv };
    }

    return { format: 'json', data: report };
  }

  /**
   * Compare budget vs actual for a specific period
   * Supports monthly comparison within a fiscal year
   */
  async compareBudgetVsActual(
    tenantId: string,
    budgetId: string,
    statementId: string,
  ): Promise<BudgetVsActualReport> {
    this.logger.info('Comparing budget vs actual', {
      tenantId,
      budgetId,
      statementId,
    });

    // Load budget
    const budgetResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM budgets WHERE id = $1 AND tenant_id = $2',
      [budgetId, tenantId],
    );

    if (budgetResult.rows.length === 0) {
      throw new Error('Budget not found');
    }

    const budget = budgetResult.rows[0];

    // Load budget line items
    const budgetItemsResult = await this.db.queryTenant(
      tenantId,
      `SELECT bli.*, coa.account_name, coa.account_type
       FROM budget_line_items bli
       LEFT JOIN chart_of_accounts coa ON bli.account_code = coa.account_code AND coa.tenant_id = $2
       WHERE bli.budget_id = $1
       ORDER BY bli.account_code`,
      [budgetId, tenantId],
    );

    // Load actual statement
    const statementResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_statements WHERE id = $1 AND tenant_id = $2',
      [statementId, tenantId],
    );

    if (statementResult.rows.length === 0) {
      throw new Error('Financial statement not found');
    }

    const statement = statementResult.rows[0];

    // Determine which month to compare based on statement period
    const statementStartDate = new Date(statement.period_start);
    const month = statementStartDate.toLocaleString('en-US', { month: 'long' }).toLowerCase();

    // Load actual line items
    const actualItemsResult = await this.db.queryTenant(
      tenantId,
      `SELECT fli.*, coa.account_name, coa.account_type
       FROM financial_line_items fli
       LEFT JOIN chart_of_accounts coa ON fli.line_code = coa.account_code AND coa.tenant_id = $2
       WHERE fli.statement_id = $1
       ORDER BY fli.line_order`,
      [statementId, tenantId],
    );

    // Build comparison map by account_code
    const comparisonMap = new Map<string, BudgetVsActualLineItem>();
    let totalBudget = 0;
    let totalActual = 0;
    let favorableCount = 0;
    let unfavorableCount = 0;
    let onBudgetCount = 0;

    // Process budget items
    for (const budgetItem of budgetItemsResult.rows) {
      const budgetAmount = parseFloat(budgetItem[month] || '0');
      const key = `${budgetItem.account_code}_${budgetItem.department || ''}`;

      if (!comparisonMap.has(key)) {
        comparisonMap.set(key, {
          account_code: budgetItem.account_code,
          account_name: budgetItem.account_name || budgetItem.account_code,
          department: budgetItem.department,
          budget_amount: budgetAmount,
          actual_amount: 0,
          variance_amount: 0,
          variance_percent: 0,
          status: 'neutral',
        });
      }

      totalBudget += budgetAmount;
    }

    // Process actual items
    for (const actualItem of actualItemsResult.rows) {
      const actualAmount = parseFloat(actualItem.amount || '0');
      const accountCode = actualItem.line_code;
      const key = `${accountCode}_`;

      if (comparisonMap.has(key)) {
        const item = comparisonMap.get(key)!;
        item.actual_amount = actualAmount;
      } else {
        // Add items that appear in actual but not in budget
        comparisonMap.set(key, {
          account_code: accountCode,
          account_name: actualItem.account_name || accountCode,
          budget_amount: 0,
          actual_amount: actualAmount,
          variance_amount: 0,
          variance_percent: 0,
          status: 'neutral',
        });
      }

      totalActual += actualAmount;
    }

    // Calculate variances
    const lineItems: BudgetVsActualLineItem[] = [];
    for (const item of comparisonMap.values()) {
      item.variance_amount = item.actual_amount - item.budget_amount;
      item.variance_percent =
        item.budget_amount !== 0
          ? (item.variance_amount / Math.abs(item.budget_amount)) * 100
          : 0;

      // Determine status
      // For revenue accounts (4xxx), actual > budget is favorable
      // For expense accounts (6xxx, 7xxx), actual < budget is favorable
      const isRevenue = item.account_code.startsWith('4');
      const isExpense = item.account_code.startsWith('6') || item.account_code.startsWith('7');

      if (Math.abs(item.variance_percent) <= 5) {
        item.status = 'neutral';
        onBudgetCount++;
      } else if (isRevenue) {
        item.status = item.variance_amount > 0 ? 'favorable' : 'unfavorable';
        if (item.status === 'favorable') favorableCount++;
        else unfavorableCount++;
      } else if (isExpense) {
        item.status = item.variance_amount < 0 ? 'favorable' : 'unfavorable';
        if (item.status === 'favorable') favorableCount++;
        else unfavorableCount++;
      } else {
        item.status = 'neutral';
        onBudgetCount++;
      }

      lineItems.push(item);
    }

    const totalVariance = totalActual - totalBudget;
    const totalVariancePercent =
      totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;

    const summary: BudgetVsActualSummary = {
      total_budget: Math.round(totalBudget * 100) / 100,
      total_actual: Math.round(totalActual * 100) / 100,
      total_variance: Math.round(totalVariance * 100) / 100,
      total_variance_percent: Math.round(totalVariancePercent * 100) / 100,
      favorable_count: favorableCount,
      unfavorable_count: unfavorableCount,
      on_budget_count: onBudgetCount,
    };

    return {
      period: `${statement.period_start} to ${statement.period_end}`,
      budget_id: budgetId,
      budget_name: budget.budget_name,
      statement_id: statementId,
      statement_type: statement.statement_type,
      line_items: lineItems,
      summary,
    };
  }
}
