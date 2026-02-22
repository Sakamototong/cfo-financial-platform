import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  private getTenantId(req: any): string {
    return (req.headers?.['x-tenant-id'] as string) || req.user?.preferred_username || req.user?.sub;
  }

  private getUser(req: any): string {
    return req.user?.email || req.user?.preferred_username || 'system';
  }

  /** Initialize billing schema and seed default plans */
  @Post('init')
  async init(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    await this.billingService.createBillingSchema(tenantId);
    return { message: 'Billing schema initialized successfully' };
  }

  /** Get billing dashboard summary */
  @Get('summary')
  async getSummary(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    // Auto-update overdue invoices before loading summary
    await this.billingService.updateOverdueInvoices(tenantId).catch(() => {});
    return this.billingService.getSummary(tenantId);
  }

  // ============ Plans ============

  /** List all available billing plans */
  @Get('plans')
  async listPlans(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.billingService.listPlans(tenantId);
  }

  // ============ Subscription ============

  /** Get current subscription */
  @Get('subscription')
  async getSubscription(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.billingService.getSubscription(tenantId);
  }

  /** Subscribe to a plan */
  @Post('subscription')
  async subscribe(@Req() req: any, @Body() body: { plan_code: string; billing_cycle: 'monthly' | 'annual' }) {
    const tenantId = this.getTenantId(req);
    return this.billingService.subscribe(tenantId, {
      ...body,
      created_by: this.getUser(req),
    });
  }

  /** Cancel subscription */
  @Put('subscription/cancel')
  async cancelSubscription(@Req() req: any, @Body() body: { reason?: string }) {
    const tenantId = this.getTenantId(req);
    return this.billingService.cancelSubscription(
      tenantId,
      body.reason || 'Cancelled by user',
      this.getUser(req),
    );
  }

  // ============ Invoices ============

  /** List all invoices */
  @Get('invoices')
  async listInvoices(@Req() req: any, @Query('status') status?: string) {
    const tenantId = this.getTenantId(req);
    return this.billingService.listInvoices(tenantId, status);
  }

  /** Get single invoice with line items */
  @Get('invoices/:id')
  async getInvoice(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.billingService.getInvoice(tenantId, id);
  }

  /** Create a new invoice */
  @Post('invoices')
  async createInvoice(@Req() req: any, @Body() body: {
    period_start: string;
    period_end: string;
    due_date: string;
    items: { description: string; quantity: number; unit_price: number }[];
    tax_rate?: number;
    notes?: string;
  }) {
    const tenantId = this.getTenantId(req);
    return this.billingService.createInvoice(tenantId, {
      ...body,
      created_by: this.getUser(req),
    });
  }

  /** Mark invoice as paid */
  @Put('invoices/:id/pay')
  async payInvoice(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.billingService.payInvoice(tenantId, id, this.getUser(req));
  }

  // ============ Payments ============

  /** List payment history */
  @Get('payments')
  async listPayments(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.billingService.listPayments(tenantId);
  }

  /** Record a payment */
  @Post('payments')
  async createPayment(@Req() req: any, @Body() body: {
    invoice_id?: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_number?: string;
    notes?: string;
  }) {
    const tenantId = this.getTenantId(req);
    return this.billingService.createPayment(tenantId, {
      ...body,
      created_by: this.getUser(req),
    });
  }

  // ============ Usage ============

  /** Get current/specified month usage */
  @Get('usage')
  async getUsage(@Req() req: any, @Query('year') year?: string, @Query('month') month?: string) {
    const tenantId = this.getTenantId(req);
    const y = year ? parseInt(year) : undefined;
    const m = month ? parseInt(month) : undefined;
    // If no specific period, take live snapshot
    if (!y && !m) {
      return this.billingService.snapshotCurrentUsage(tenantId);
    }
    return this.billingService.getUsage(tenantId, y, m);
  }

  /** Manually update usage metrics */
  @Post('usage')
  async upsertUsage(@Req() req: any, @Body() body: {
    period_year: number;
    period_month: number;
    users_count?: number;
    storage_used_gb?: number;
    api_calls_count?: number;
    reports_generated?: number;
    etl_imports?: number;
    scenarios_created?: number;
  }) {
    const tenantId = this.getTenantId(req);
    return this.billingService.upsertUsage(tenantId, { tenant_id: tenantId, ...body });
  }
}
