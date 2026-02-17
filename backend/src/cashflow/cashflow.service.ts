import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateCashFlowForecastDto, UpdateCashFlowForecastDto } from './dto/create-forecast.dto';
import { UpdateCashFlowLineItemDto, BulkUpdateLineItemsDto } from './dto/line-item.dto';

@Injectable()
export class CashflowService {
  constructor(private databaseService: DatabaseService) {}

  // ===== FORECAST CRUD =====

  async findAll(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM cash_flow_forecasts 
       WHERE tenant_id = $1 
       ORDER BY start_date DESC, created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async findOne(tenantId: string, forecastId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM cash_flow_forecasts 
       WHERE id = $1 AND tenant_id = $2`,
      [forecastId, tenantId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Cash flow forecast not found');
    }
    
    return result.rows[0];
  }

  async create(tenantId: string, dto: CreateCashFlowForecastDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check for duplicate name
    const existing = await pool.query(
      `SELECT id FROM cash_flow_forecasts 
       WHERE tenant_id = $1 AND forecast_name = $2`,
      [tenantId, dto.forecast_name]
    );
    
    if (existing.rows.length > 0) {
      throw new Error(`Forecast with name "${dto.forecast_name}" already exists`);
    }

    const weeks = dto.weeks || 13;
    const beginningCash = dto.beginning_cash || 0;

    // Create forecast header
    const forecastResult = await pool.query(
      `INSERT INTO cash_flow_forecasts 
       (tenant_id, forecast_name, start_date, weeks, beginning_cash, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, dto.forecast_name, dto.start_date, weeks, beginningCash, dto.notes, dto.created_by]
    );
    
    const forecast = forecastResult.rows[0];

    // Generate weekly line items
    const startDate = new Date(dto.start_date);
    const lineItems = [];

    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const lineItemResult = await pool.query(
        `INSERT INTO cash_flow_line_items 
         (forecast_id, week_number, week_start_date, week_end_date, beginning_cash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [forecast.id, i + 1, weekStart.toISOString().split('T')[0], weekEnd.toISOString().split('T')[0], i === 0 ? beginningCash : 0]
      );
      
      lineItems.push(lineItemResult.rows[0]);
    }

    // Recalculate cash positions
    await pool.query(`SELECT calculate_forecast_cash_positions($1)`, [forecast.id]);

    return {
      ...forecast,
      line_items: lineItems,
    };
  }

  async update(tenantId: string, forecastId: string, dto: UpdateCashFlowForecastDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Check if forecast exists
    await this.findOne(tenantId, forecastId);

    const fields = [];
    const values = [];
    let idx = 1;

    if (dto.forecast_name !== undefined) {
      fields.push(`forecast_name = $${idx++}`);
      values.push(dto.forecast_name);
    }
    if (dto.beginning_cash !== undefined) {
      fields.push(`beginning_cash = $${idx++}`);
      values.push(dto.beginning_cash);
    }
    if (dto.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(dto.status);
    }
    if (dto.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(dto.notes);
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    values.push(forecastId, tenantId);

    const result = await pool.query(
      `UPDATE cash_flow_forecasts 
       SET ${fields.join(', ')} 
       WHERE id = $${idx++} AND tenant_id = $${idx++} 
       RETURNING *`,
      values
    );

    // If beginning cash changed, recalculate positions
    if (dto.beginning_cash !== undefined) {
      await pool.query(`SELECT calculate_forecast_cash_positions($1)`, [forecastId]);
    }
    
    return result.rows[0];
  }

  async remove(tenantId: string, forecastId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    await this.findOne(tenantId, forecastId);

    await pool.query(
      `DELETE FROM cash_flow_forecasts 
       WHERE id = $1 AND tenant_id = $2`,
      [forecastId, tenantId]
    );
    
    return { message: 'Cash flow forecast deleted successfully' };
  }

  // ===== LINE ITEMS =====

  async getLineItems(tenantId: string, forecastId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Verify forecast exists and belongs to tenant
    await this.findOne(tenantId, forecastId);

    const result = await pool.query(
      `SELECT * FROM cash_flow_line_items 
       WHERE forecast_id = $1 
       ORDER BY week_number`,
      [forecastId]
    );
    
    return result.rows;
  }

  async updateLineItem(tenantId: string, forecastId: string, weekNumber: number, dto: UpdateCashFlowLineItemDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Verify forecast exists
    await this.findOne(tenantId, forecastId);

    const fields = [];
    const values = [];
    let idx = 1;

    if (dto.operating_cash_inflow !== undefined) {
      fields.push(`operating_cash_inflow = $${idx++}`);
      values.push(dto.operating_cash_inflow);
    }
    if (dto.operating_cash_outflow !== undefined) {
      fields.push(`operating_cash_outflow = $${idx++}`);
      values.push(dto.operating_cash_outflow);
    }
    if (dto.investing_cash_inflow !== undefined) {
      fields.push(`investing_cash_inflow = $${idx++}`);
      values.push(dto.investing_cash_inflow);
    }
    if (dto.investing_cash_outflow !== undefined) {
      fields.push(`investing_cash_outflow = $${idx++}`);
      values.push(dto.investing_cash_outflow);
    }
    if (dto.financing_cash_inflow !== undefined) {
      fields.push(`financing_cash_inflow = $${idx++}`);
      values.push(dto.financing_cash_inflow);
    }
    if (dto.financing_cash_outflow !== undefined) {
      fields.push(`financing_cash_outflow = $${idx++}`);
      values.push(dto.financing_cash_outflow);
    }
    
    if (dto.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(dto.notes);
    }
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    values.push(forecastId, weekNumber);

    const result = await pool.query(
      `UPDATE cash_flow_line_items 
       SET ${fields.join(', ')} 
       WHERE forecast_id = $${idx++} AND week_number = $${idx++} 
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error(`Week ${weekNumber} not found in forecast`);
    }

    // Trigger will automatically recalculate cash positions
    
    return result.rows[0];
  }

  async bulkUpdateLineItems(tenantId: string, forecastId: string, dto: BulkUpdateLineItemsDto) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    // Verify forecast exists
    await this.findOne(tenantId, forecastId);

    const updatedItems = [];

    for (const update of dto.updates) {
      const item = await this.updateLineItem(tenantId, forecastId, update.week_number, update.data);
      updatedItems.push(item);
    }

    return {
      updated_count: updatedItems.length,
      items: updatedItems,
    };
  }

  // ===== SUMMARY & ANALYTICS =====

  async getForecastSummary(tenantId: string, forecastId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    
    const forecast = await this.findOne(tenantId, forecastId);
    const lineItems = await this.getLineItems(tenantId, forecastId);

    const summary = {
      forecast_id: forecastId,
      forecast_name: forecast.forecast_name,
      start_date: forecast.start_date,
      weeks: forecast.weeks,
      beginning_cash: parseFloat(forecast.beginning_cash),
      ending_cash: lineItems.length > 0 ? parseFloat(lineItems[lineItems.length - 1].ending_cash) : parseFloat(forecast.beginning_cash),
      total_operating_inflow: 0,
      total_operating_outflow: 0,
      total_investing_inflow: 0,
      total_investing_outflow: 0,
      total_financing_inflow: 0,
      total_financing_outflow: 0,
      net_change: 0,
      lowest_cash_balance: parseFloat(forecast.beginning_cash),
      lowest_cash_week: 0,
    };

    for (const item of lineItems) {
      summary.total_operating_inflow += parseFloat(item.operating_cash_inflow || 0);
      summary.total_operating_outflow += parseFloat(item.operating_cash_outflow || 0);
      summary.total_investing_inflow += parseFloat(item.investing_cash_inflow || 0);
      summary.total_investing_outflow += parseFloat(item.investing_cash_outflow || 0);
      summary.total_financing_inflow += parseFloat(item.financing_cash_inflow || 0);
      summary.total_financing_outflow += parseFloat(item.financing_cash_outflow || 0);

      const endingCash = parseFloat(item.ending_cash);
      if (endingCash < summary.lowest_cash_balance) {
        summary.lowest_cash_balance = endingCash;
        summary.lowest_cash_week = item.week_number;
      }
    }

    summary.net_change = summary.ending_cash - summary.beginning_cash;

    return summary;
  }

  // ===== CATEGORIES =====

  async getCategories(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM cash_flow_categories 
       WHERE tenant_id = $1 AND is_active = TRUE 
       ORDER BY category_type, display_order`,
      [tenantId]
    );
    
    return result.rows;
  }
}
