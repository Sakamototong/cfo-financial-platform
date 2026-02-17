import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { FinancialStatement, LineItem } from '../financial/financial.service';
import { Scenario, Assumption } from '../scenario/scenario.service';

export interface ProjectionRequest {
  base_statement_id: string; // Historical statement to project from
  scenario_id: string; // Scenario with assumptions
  projection_periods: number; // Number of months to project
  period_type: 'monthly' | 'quarterly' | 'yearly';
}

export interface ProjectedStatement {
  id?: string;
  tenant_id: string;
  projection_id: string;
  statement_type: 'PL' | 'BS' | 'CF';
  period_number: number; // Period offset (1, 2, 3...)
  period_start: string;
  period_end: string;
  scenario_id: string;
  line_items: ProjectedLineItem[];
  created_at?: string;
}

export interface ProjectedLineItem {
  line_code: string;
  line_name: string;
  projected_amount: number;
  base_amount: number;
  variance: number;
  variance_percent: number;
  calculation_method: string; // 'growth_rate', 'fixed', 'formula', etc.
  notes?: string;
}

export interface FinancialRatios {
  // Profitability
  gross_margin?: number;
  operating_margin?: number;
  net_margin?: number;
  roi?: number; // Return on Investment
  roe?: number; // Return on Equity
  roic?: number; // Return on Invested Capital
  
  // Liquidity
  current_ratio?: number;
  quick_ratio?: number;
  
  // Efficiency
  asset_turnover?: number;
  inventory_turnover?: number;
  
  // Leverage
  debt_to_equity?: number;
  interest_coverage?: number;
  
  // Valuation
  wacc?: number; // Weighted Average Cost of Capital
  capm?: number; // Capital Asset Pricing Model
}

export interface CapexSchedule {
  period_number: number;
  capex_amount: number;
  depreciation_amount: number;
  accumulated_depreciation: number;
  net_book_value: number;
}

export interface CashFlowProjection {
  period_number: number;
  operating_cashflow: number;
  investing_cashflow: number;
  financing_cashflow: number;
  net_cashflow: number;
  beginning_cash: number;
  ending_cash: number;
}

@Injectable()
export class ProjectionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Generate financial projections based on scenario assumptions
   */
  async generateProjections(
    tenantId: string,
    request: ProjectionRequest,
  ): Promise<{
    projection_id: string;
    statements: ProjectedStatement[];
    ratios: FinancialRatios;
    capex_schedule?: CapexSchedule[];
    cashflow_projection?: CashFlowProjection[];
  }> {
    this.logger.info('Generating financial projections', {
      tenantId,
      baseStatementId: request.base_statement_id,
      scenarioId: request.scenario_id,
      periods: request.projection_periods,
    });

    // 1. Load base statement
    const baseStatement = await this.loadStatement(tenantId, request.base_statement_id);
    if (!baseStatement) {
      throw new Error('Base statement not found');
    }

    // 2. Load scenario with assumptions
    const scenario = await this.loadScenario(tenantId, request.scenario_id);
    if (!scenario) {
      throw new Error('Scenario not found');
    }

    // 3. Generate projection ID
    const projectionId = this.generateProjectionId();

    // 4. Project statements for each period
    const projectedStatements: ProjectedStatement[] = [];

    for (let period = 1; period <= request.projection_periods; period++) {
      const projected = await this.projectStatement(
        tenantId,
        baseStatement,
        scenario,
        projectionId,
        period,
        request.period_type,
      );
      projectedStatements.push(projected);
    }

    // 5. Generate CAPEX schedule if depreciation assumptions exist
    const capexSchedule = this.generateCapexSchedule(
      scenario.assumptions,
      request.projection_periods,
    );

    // 6. Generate Cash Flow projection
    const cashflowProjection = this.generateCashFlowProjection(
      projectedStatements,
      scenario.assumptions,
      request.projection_periods,
    );

    // 7. Calculate financial ratios
    const ratios = this.calculateRatios(
      projectedStatements,
      scenario.assumptions,
    );

    // 8. Persist projections (include request metadata)
    await this.saveProjections(tenantId, projectionId, projectedStatements, ratios, request);

    this.logger.info('Projections generated successfully', {
      projectionId,
      statementsCount: projectedStatements.length,
    });

    return {
      projection_id: projectionId,
      statements: projectedStatements,
      ratios,
      capex_schedule: capexSchedule,
      cashflow_projection: cashflowProjection,
    };
  }

  /**
   * Project single statement for one period
   */
  private async projectStatement(
    tenantId: string,
    baseStatement: FinancialStatement & { lineItems: LineItem[] },
    scenario: Scenario & { assumptions: Assumption[] },
    projectionId: string,
    periodNumber: number,
    periodType: 'monthly' | 'quarterly' | 'yearly',
  ): Promise<ProjectedStatement> {
    const { period_start, period_end } = this.calculatePeriodDates(
      baseStatement.period_end,
      periodNumber,
      periodType,
    );

    const projectedLineItems: ProjectedLineItem[] = [];

    // Get assumptions map for quick lookup
    const assumptionsMap = this.buildAssumptionsMap(scenario.assumptions);

    for (const lineItem of baseStatement.lineItems) {
      const projected = this.projectLineItem(
        lineItem,
        assumptionsMap,
        periodNumber,
      );
      projectedLineItems.push(projected);
    }

    return {
      tenant_id: tenantId,
      projection_id: projectionId,
      statement_type: baseStatement.statement_type,
      period_number: periodNumber,
      period_start,
      period_end,
      scenario_id: scenario.id!,
      line_items: projectedLineItems,
    };
  }

  /**
   * Project individual line item
   */
  private projectLineItem(
    lineItem: LineItem,
    assumptions: Map<string, Assumption>,
    periodNumber: number,
  ): ProjectedLineItem {
    const baseAmount = lineItem.amount;
    let projectedAmount = baseAmount;
    let calculationMethod = 'fixed';

    // Determine line item category
    const category = this.categorizeLineItem(lineItem.line_code);

    // Apply growth rate for revenue
    if (category === 'revenue') {
      const growthAssumption = assumptions.get('revenue.growth_rate');
      if (growthAssumption) {
        const growthRate = Number(growthAssumption.assumption_value);
        // Compound growth: amount * (1 + rate)^period
        projectedAmount = baseAmount * Math.pow(1 + growthRate, periodNumber);
        calculationMethod = 'compound_growth';
      }
    }

    // Apply cost assumptions for expenses
    if (category === 'expense' || category === 'cogs') {
      const costAssumption =
        assumptions.get('expense.cost_increase') ||
        assumptions.get('expense.cost_reduction');

      if (costAssumption) {
        const changeRate = Number(costAssumption.assumption_value);
        projectedAmount = baseAmount * Math.pow(1 + changeRate, periodNumber);
        calculationMethod = 'cost_adjustment';
      }
    }

    // Apply depreciation for assets
    if (category === 'depreciation') {
      const depreciationAssumption = assumptions.get('depreciation.rate');
      if (depreciationAssumption) {
        const depRate = Number(depreciationAssumption.assumption_value);
        projectedAmount = baseAmount * (1 + depRate);
        calculationMethod = 'depreciation';
      }
    }

    // Balance Sheet specific projections
    if (category === 'asset') {
      const assetGrowthAssumption = assumptions.get('asset.growth_rate') || assumptions.get('revenue.growth_rate');
      if (assetGrowthAssumption) {
        const growthRate = Number(assetGrowthAssumption.assumption_value);
        projectedAmount = baseAmount * Math.pow(1 + growthRate, periodNumber);
        calculationMethod = 'asset_growth';
      }
    }

    if (category === 'liability') {
      const liabilityAssumption = assumptions.get('liability.change_rate');
      if (liabilityAssumption) {
        const changeRate = Number(liabilityAssumption.assumption_value);
        projectedAmount = baseAmount * Math.pow(1 + changeRate, periodNumber);
        calculationMethod = 'liability_projection';
      }
    }

    if (category === 'equity') {
      // Equity typically grows with retained earnings
      const retainedEarningsGrowth = assumptions.get('equity.retained_earnings_rate');
      if (retainedEarningsGrowth) {
        const growthRate = Number(retainedEarningsGrowth.assumption_value);
        projectedAmount = baseAmount * Math.pow(1 + growthRate, periodNumber);
        calculationMethod = 'equity_accumulation';
      }
    }

    const variance = projectedAmount - baseAmount;
    const variancePercent = baseAmount !== 0 ? (variance / baseAmount) * 100 : 0;

    return {
      line_code: lineItem.line_code,
      line_name: lineItem.line_name,
      projected_amount: Math.round(projectedAmount * 100) / 100,
      base_amount: baseAmount,
      variance: Math.round(variance * 100) / 100,
      variance_percent: Math.round(variancePercent * 100) / 100,
      calculation_method: calculationMethod,
      notes: `Projected from ${lineItem.line_name} using ${calculationMethod}`,
    };
  }

  /**
   * Calculate financial ratios
   */
  private calculateRatios(
    statements: ProjectedStatement[],
    assumptions: Assumption[],
  ): FinancialRatios {
    // Get latest projected statements by type
    const latestPL = statements
      .filter((s) => s.statement_type === 'PL')
      .sort((a, b) => b.period_number - a.period_number)[0];

    const latestBS = statements
      .filter((s) => s.statement_type === 'BS')
      .sort((a, b) => b.period_number - a.period_number)[0];

    const latestCF = statements
      .filter((s) => s.statement_type === 'CF')
      .sort((a, b) => b.period_number - a.period_number)[0];

    const ratios: FinancialRatios = {};

    // P&L based ratios
    if (latestPL) {
      const revenue = this.sumLineItems(latestPL.line_items, 'REV');
      const cogs = this.sumLineItems(latestPL.line_items, 'COGS');
      const opex = this.sumLineItems(latestPL.line_items, 'OPEX');
      const netIncome = revenue - cogs - opex;

      const grossProfit = revenue - cogs;
      const operatingProfit = grossProfit - opex;

      // Profitability ratios
      ratios.gross_margin = revenue !== 0 ? (grossProfit / revenue) * 100 : 0;
      ratios.operating_margin = revenue !== 0 ? (operatingProfit / revenue) * 100 : 0;
      ratios.net_margin = revenue !== 0 ? (netIncome / revenue) * 100 : 0;
    }

    // Balance Sheet based ratios
    if (latestBS) {
      const currentAssets = this.sumLineItems(latestBS.line_items, 'CURRENT_ASSET') || 
                           this.sumLineItemsByPattern(latestBS.line_items, /CASH|AR|INVENTORY/i);
      const currentLiabilities = this.sumLineItems(latestBS.line_items, 'CURRENT_LIAB') ||
                                 this.sumLineItemsByPattern(latestBS.line_items, /AP|SHORT.*DEBT/i);
      const totalAssets = this.sumLineItemsByPattern(latestBS.line_items, /ASSET/i);
      const totalLiabilities = this.sumLineItemsByPattern(latestBS.line_items, /LIAB/i);
      const totalEquity = this.sumLineItemsByPattern(latestBS.line_items, /EQUITY/i);
      const cash = this.sumLineItemsByPattern(latestBS.line_items, /CASH/i);
      const inventory = this.sumLineItemsByPattern(latestBS.line_items, /INVENTORY/i);

      // Liquidity ratios
      if (currentLiabilities !== 0) {
        ratios.current_ratio = currentAssets / currentLiabilities;
        ratios.quick_ratio = (currentAssets - inventory) / currentLiabilities;
      }

      // Leverage ratios
      if (totalEquity !== 0) {
        ratios.debt_to_equity = totalLiabilities / totalEquity;
      }

      // Efficiency ratios
      if (latestPL && totalAssets !== 0) {
        const revenue = this.sumLineItems(latestPL.line_items, 'REV');
        ratios.asset_turnover = revenue / totalAssets;
      }

      // Return ratios
      if (latestPL) {
        const netIncome = this.sumLineItems(latestPL.line_items, 'NET') ||
                         this.getNetIncome(latestPL.line_items);
        
        if (totalAssets !== 0) {
          ratios.roi = (netIncome / totalAssets) * 100;
        }
        if (totalEquity !== 0) {
          ratios.roe = (netIncome / totalEquity) * 100;
        }
      }
    }

    // Calculate WACC if cost of capital assumptions exist
    const costOfEquity = assumptions.find(
      (a) => a.assumption_key === 'cost_of_equity',
    );
    const costOfDebt = assumptions.find(
      (a) => a.assumption_key === 'cost_of_debt',
    );
    const taxRate = assumptions.find((a) => a.assumption_key === 'tax_rate');

    if (costOfEquity && costOfDebt && taxRate) {
      // Simplified WACC: E/(D+E) * Re + D/(D+E) * Rd * (1-T)
      // Assume 50/50 debt-equity for simplicity
      const E = 0.5; // Equity weight
      const D = 0.5; // Debt weight
      const Re = Number(costOfEquity.assumption_value);
      const Rd = Number(costOfDebt.assumption_value);
      const T = Number(taxRate.assumption_value);

      ratios.wacc = (E * Re + D * Rd * (1 - T)) * 100;
    }

    // Calculate CAPM if risk-free rate and beta exist
    const riskFreeRate = assumptions.find(
      (a) => a.assumption_key === 'risk_free_rate',
    );
    const beta = assumptions.find((a) => a.assumption_key === 'beta');
    const marketReturn = assumptions.find(
      (a) => a.assumption_key === 'market_return',
    );

    if (riskFreeRate && beta && marketReturn) {
      // CAPM: Rf + β(Rm - Rf)
      const Rf = Number(riskFreeRate.assumption_value);
      const β = Number(beta.assumption_value);
      const Rm = Number(marketReturn.assumption_value);

      ratios.capm = (Rf + β * (Rm - Rf)) * 100;
    }

    return ratios;
  }

  private getNetIncome(lineItems: ProjectedLineItem[]): number {
    const revenue = this.sumLineItemsByPattern(lineItems, /REV/i);
    const cogs = this.sumLineItemsByPattern(lineItems, /COGS/i);
    const expenses = this.sumLineItemsByPattern(lineItems, /OPEX|EXP/i);
    const tax = this.sumLineItemsByPattern(lineItems, /TAX/i);
    return revenue - cogs - expenses - tax;
  }

  private sumLineItemsByPattern(lineItems: ProjectedLineItem[], pattern: RegExp): number {
    return lineItems
      .filter((item) => pattern.test(item.line_code) || pattern.test(item.line_name))
      .reduce((sum, item) => sum + Math.abs(item.projected_amount), 0);
  }

  /**
   * Generate CAPEX and Depreciation Schedule
   */
  private generateCapexSchedule(
    assumptions: Assumption[],
    periods: number,
  ): CapexSchedule[] {
    const capexAssumption = assumptions.find(
      (a) => a.assumption_key === 'capex_amount' || a.assumption_key === 'capital_expenditure',
    );
    const depreciationRateAssumption = assumptions.find(
      (a) => a.assumption_key === 'depreciation_rate',
    );
    const usefulLifeAssumption = assumptions.find(
      (a) => a.assumption_key === 'asset_useful_life',
    );

    if (!capexAssumption) {
      return [];
    }

    const annualCapex = Number(capexAssumption.assumption_value);
    const depreciationRate = Number(depreciationRateAssumption?.assumption_value) || 0.1; // 10% default
    const usefulLife = Number(usefulLifeAssumption?.assumption_value) || 10; // 10 years default

    const schedule: CapexSchedule[] = [];
    let accumulatedDepreciation = 0;
    let totalAssetValue = 0;

    for (let period = 1; period <= periods; period++) {
      // CAPEX may occur periodically (e.g., every year)
      const capexAmount = period % 12 === 0 ? annualCapex : 0; // Annual CAPEX
      totalAssetValue += capexAmount;

      // Straight-line depreciation
      const depreciationAmount = totalAssetValue * depreciationRate;
      accumulatedDepreciation += depreciationAmount;

      const netBookValue = Math.max(0, totalAssetValue - accumulatedDepreciation);

      schedule.push({
        period_number: period,
        capex_amount: capexAmount,
        depreciation_amount: depreciationAmount,
        accumulated_depreciation: accumulatedDepreciation,
        net_book_value: netBookValue,
      });
    }

    return schedule;
  }

  /**
   * Generate Cash Flow Projection
   */
  private generateCashFlowProjection(
    projectedStatements: ProjectedStatement[],
    assumptions: Assumption[],
    periods: number,
  ): CashFlowProjection[] {
    const cashflowProjections: CashFlowProjection[] = [];
    let beginningCash = 0;

    // Get initial cash from first balance sheet if available
    const firstBS = projectedStatements.find((s) => s.statement_type === 'BS' && s.period_number === 1);
    if (firstBS) {
      beginningCash = this.sumLineItemsByPattern(firstBS.line_items, /CASH/i);
    }

    for (let period = 1; period <= periods; period++) {
      const plStatement = projectedStatements.find(
        (s) => s.statement_type === 'PL' && s.period_number === period,
      );
      const bsStatement = projectedStatements.find(
        (s) => s.statement_type === 'BS' && s.period_number === period,
      );

      let operatingCF = 0;
      let investingCF = 0;
      let financingCF = 0;

      // Operating Cash Flow (indirect method)
      if (plStatement) {
        const netIncome = this.getNetIncome(plStatement.line_items);
        const depreciation = this.sumLineItemsByPattern(plStatement.line_items, /DEPR/i);
        
        // Add back non-cash expenses
        operatingCF = netIncome + depreciation;

        // Adjust for changes in working capital (simplified)
        if (bsStatement) {
          const arChange = this.sumLineItemsByPattern(bsStatement.line_items, /AR|RECEIVABLE/i) * -0.1; // Estimate
          const inventoryChange = this.sumLineItemsByPattern(bsStatement.line_items, /INVENTORY/i) * -0.1;
          const apChange = this.sumLineItemsByPattern(bsStatement.line_items, /AP|PAYABLE/i) * 0.1;
          
          operatingCF += arChange + inventoryChange + apChange;
        }
      }

      // Investing Cash Flow
      const capexAssumption = assumptions.find(
        (a) => a.assumption_key === 'capex_amount' || a.assumption_key === 'capital_expenditure',
      );
      if (capexAssumption && period % 12 === 0) {
        investingCF = -Number(capexAssumption.assumption_value); // Negative because it's cash outflow
      }

      // Financing Cash Flow
      const debtAssumption = assumptions.find(
        (a) => a.assumption_key === 'new_debt' || a.assumption_key === 'debt_issuance',
      );
      const dividendAssumption = assumptions.find(
        (a) => a.assumption_key === 'dividend_payout',
      );

      if (debtAssumption) {
        financingCF += Number(debtAssumption.assumption_value);
      }
      if (dividendAssumption && plStatement) {
        const netIncome = this.getNetIncome(plStatement.line_items);
        const dividendPayout = netIncome * Number(dividendAssumption.assumption_value);
        financingCF -= dividendPayout; // Negative because it's cash outflow
      }

      const netCashflow = operatingCF + investingCF + financingCF;
      const endingCash = beginningCash + netCashflow;

      cashflowProjections.push({
        period_number: period,
        operating_cashflow: Math.round(operatingCF * 100) / 100,
        investing_cashflow: Math.round(investingCF * 100) / 100,
        financing_cashflow: Math.round(financingCF * 100) / 100,
        net_cashflow: Math.round(netCashflow * 100) / 100,
        beginning_cash: Math.round(beginningCash * 100) / 100,
        ending_cash: Math.round(endingCash * 100) / 100,
      });

      beginningCash = endingCash;
    }

    return cashflowProjections;
  }

  // Helper methods

  private async loadStatement(
    tenantId: string,
    statementId: string,
  ): Promise<(FinancialStatement & { lineItems: LineItem[] }) | null> {
    const stmtResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_statements WHERE id = $1',
      [statementId],
    );

    if (stmtResult.rows.length === 0) {
      return null;
    }

    const lineItemsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM financial_line_items WHERE statement_id = $1 ORDER BY line_order',
      [statementId],
    );

    return {
      ...stmtResult.rows[0],
      lineItems: lineItemsResult.rows,
    };
  }

  private async loadScenario(
    tenantId: string,
    scenarioId: string,
  ): Promise<(Scenario & { assumptions: Assumption[] }) | null> {
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
      'SELECT * FROM scenario_assumptions WHERE scenario_id = $1',
      [scenarioId],
    );

    return {
      ...scenarioResult.rows[0],
      assumptions: assumptionsResult.rows,
    };
  }

  private buildAssumptionsMap(assumptions: Assumption[]): Map<string, Assumption> {
    const map = new Map<string, Assumption>();
    for (const assumption of assumptions) {
      const key = `${assumption.assumption_category}.${assumption.assumption_key}`;
      map.set(key, assumption);
    }
    return map;
  }

  private categorizeLineItem(lineCode: string): string {
    const prefix = lineCode.split('-')[0].toUpperCase();
    const code = lineCode.toUpperCase();
    
    // P&L items
    if (prefix.includes('REV') || code.includes('REVENUE')) return 'revenue';
    if (prefix.includes('COGS') || code.includes('COST_OF_GOODS')) return 'cogs';
    if (prefix.includes('OPEX') || prefix.includes('EXP') || code.includes('EXPENSE')) return 'expense';
    if (prefix.includes('DEPR') || code.includes('DEPRECIATION')) return 'depreciation';
    if (prefix.includes('TAX') || code.includes('TAX')) return 'tax';
    
    // Balance Sheet items
    if (prefix.includes('ASSET') || code.includes('ASSET') || code.includes('CASH') || code.includes('AR') || code.includes('INVENTORY')) return 'asset';
    if (prefix.includes('LIAB') || code.includes('LIABILITY') || code.includes('AP') || code.includes('DEBT') || code.includes('LOAN')) return 'liability';
    if (prefix.includes('EQUITY') || code.includes('EQUITY') || code.includes('CAPITAL') || code.includes('RETAINED')) return 'equity';
    
    // Cash Flow items
    if (code.includes('OPERATING_CF') || code.includes('OCF')) return 'operating_cashflow';
    if (code.includes('INVESTING_CF') || code.includes('ICF')) return 'investing_cashflow';
    if (code.includes('FINANCING_CF') || code.includes('FCF')) return 'financing_cashflow';
    
    return 'other';
  }

  private calculatePeriodDates(
    baseEndDate: string,
    periodNumber: number,
    periodType: 'monthly' | 'quarterly' | 'yearly',
  ): { period_start: string; period_end: string } {
    const baseDate = new Date(baseEndDate);
    
    let monthsToAdd = periodNumber;
    if (periodType === 'quarterly') monthsToAdd = periodNumber * 3;
    if (periodType === 'yearly') monthsToAdd = periodNumber * 12;

    const periodEnd = new Date(baseDate);
    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd);

    const periodStart = new Date(periodEnd);
    if (periodType === 'monthly') periodStart.setMonth(periodStart.getMonth() - 1);
    if (periodType === 'quarterly') periodStart.setMonth(periodStart.getMonth() - 3);
    if (periodType === 'yearly') periodStart.setMonth(periodStart.getMonth() - 12);
    periodStart.setDate(periodStart.getDate() + 1); // Start next day after previous period

    return {
      period_start: periodStart.toISOString().split('T')[0],
      period_end: periodEnd.toISOString().split('T')[0],
    };
  }

  private sumLineItems(lineItems: ProjectedLineItem[], prefix: string): number {
    return lineItems
      .filter((item) => item.line_code.startsWith(prefix))
      .reduce((sum, item) => sum + item.projected_amount, 0);
  }

  private generateProjectionId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async saveProjections(
    tenantId: string,
    projectionId: string,
    statements: ProjectedStatement[],
    ratios: FinancialRatios,
    request?: ProjectionRequest,
  ): Promise<void> {
    const client = await this.db.getTenantClient(tenantId);

    try {
      await client.query('BEGIN');

      // Store main projection record (include metadata if provided)
      await client.query(
        `INSERT INTO projections (id, tenant_id, base_statement_id, scenario_id, projection_periods, period_type, statement_count, ratios, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING`,
        [
          projectionId,
          statements[0]?.tenant_id || 'unknown',
          request?.base_statement_id || null,
          request?.scenario_id || null,
          request?.projection_periods || null,
          request?.period_type || null,
          statements.length,
          JSON.stringify(ratios),
        ],
      );

      // Store each projected statement
      for (const stmt of statements) {
        await client.query(
          `INSERT INTO projected_statements 
           (projection_id, statement_type, period_number, period_start, period_end, line_items)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            projectionId,
            stmt.statement_type,
            stmt.period_number,
            stmt.period_start,
            stmt.period_end,
            JSON.stringify(stmt.line_items),
          ],
        );
      }

      await client.query('COMMIT');

      this.logger.info('Projections saved', {
        projectionId,
        statementsCount: statements.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Failed to save projections', {
        error: (error as any).message,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get saved projection by ID with all statements
   */
  async getProjection(tenantId: string, projectionId: string): Promise<any> {
    const projResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM projections WHERE id = $1',
      [projectionId],
    );

    if (projResult.rows.length === 0) {
      return null;
    }

    const stmtsResult = await this.db.queryTenant(
      tenantId,
      'SELECT * FROM projected_statements WHERE projection_id = $1 ORDER BY period_number',
      [projectionId],
    );

    return {
      ...projResult.rows[0],
      statements: stmtsResult.rows.map((row) => ({
        ...row,
        line_items: row.line_items, // Already parsed by pg
      })),
    };
  }

  async listProjections(tenantId: string): Promise<any[]> {
    const res = await this.db.queryTenant(
      tenantId,
      `SELECT id, tenant_id, base_statement_id, scenario_id, projection_periods, period_type, statement_count, ratios, created_at
       FROM projections ORDER BY created_at DESC`
    );
    return res.rows;
  }
}
