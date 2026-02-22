import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface BillingPlan {
  id: string;
  plan_code: string;
  plan_name: string;
  description: string;
  price_monthly: number;
  price_annual: number;
  currency: string;
  max_users: number | null;
  max_storage_gb: number | null;
  max_api_calls_day: number | null;
  features: string[];
  is_active: boolean;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_code: string;
  plan_name: string;
  billing_cycle: 'monthly' | 'annual';
  status: 'active' | 'inactive' | 'cancelled' | 'trial' | 'suspended';
  trial_ends_at: string | null;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string | null;
  amount: number;
  currency: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  due_date: string;
  status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  notes: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface BillingInvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface BillingPayment {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
  payment_date: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference_number: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  notes: string | null;
  created_by: string;
  created_at: string;
}

export interface BillingUsage {
  id: string;
  tenant_id: string;
  period_year: number;
  period_month: number;
  users_count: number;
  storage_used_gb: number;
  api_calls_count: number;
  reports_generated: number;
  etl_imports: number;
  scenarios_created: number;
  recorded_at: string;
}

@Injectable()
export class BillingService {
  constructor(private databaseService: DatabaseService) {}

  // ============ Schema Init ============

  async createBillingSchema(tenantId: string): Promise<void> {
    const pool = await this.databaseService.getTenantPool(tenantId);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS billing_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plan_code VARCHAR(50) UNIQUE NOT NULL,
        plan_name VARCHAR(100) NOT NULL,
        description TEXT,
        price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
        price_annual NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'THB',
        max_users INTEGER,
        max_storage_gb INTEGER,
        max_api_calls_day INTEGER,
        features JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tenant_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        plan_code VARCHAR(50) NOT NULL,
        plan_name VARCHAR(100) NOT NULL,
        billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
        status VARCHAR(30) NOT NULL DEFAULT 'trial',
        trial_ends_at TIMESTAMPTZ,
        current_period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        current_period_end TIMESTAMPTZ,
        next_billing_date TIMESTAMPTZ,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'THB',
        cancelled_at TIMESTAMPTZ,
        cancel_reason TEXT,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS billing_invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        due_date DATE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 7,
        tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'THB',
        notes TEXT,
        paid_at TIMESTAMPTZ,
        paid_by VARCHAR(255),
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS billing_invoice_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12, 2) NOT NULL,
        amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS billing_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        invoice_id UUID REFERENCES billing_invoices(id) ON DELETE SET NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        amount NUMERIC(12, 2) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'THB',
        payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer',
        reference_number VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        notes TEXT,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS billing_usage (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        period_year INTEGER NOT NULL,
        period_month INTEGER NOT NULL,
        users_count INTEGER NOT NULL DEFAULT 0,
        storage_used_gb NUMERIC(10, 3) NOT NULL DEFAULT 0,
        api_calls_count INTEGER NOT NULL DEFAULT 0,
        reports_generated INTEGER NOT NULL DEFAULT 0,
        etl_imports INTEGER NOT NULL DEFAULT 0,
        scenarios_created INTEGER NOT NULL DEFAULT 0,
        recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, period_year, period_month)
      );

      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON tenant_subscriptions(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON billing_invoices(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON billing_invoices(status);
      CREATE INDEX IF NOT EXISTS idx_payments_tenant ON billing_payments(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_tenant_period ON billing_usage(tenant_id, period_year, period_month);
    `);

    // Seed default plans
    await pool.query(`
      INSERT INTO billing_plans (plan_code, plan_name, description, price_monthly, price_annual, max_users, max_storage_gb, max_api_calls_day, features) VALUES
        ('free_trial', 'Free Trial', 'ทดลองใช้ฟรี 30 วัน เหมาะสำหรับการทดสอบระบบ', 0, 0, 3, 1, 1000,
          '["Dashboard & Reports", "Financial Statements", "Basic ETL Import", "Up to 3 Users", "1 GB Storage", "Email Support"]'::jsonb),
        ('starter', 'Starter', 'สำหรับธุรกิจขนาดเล็กถึงกลาง เริ่มต้นจัดการการเงินอย่างมืออาชีพ', 990, 9900, 10, 5, 10000,
          '["ทุกอย่างใน Free Trial", "Scenarios & Projections", "Budget Management", "Cash Flow Forecast", "Up to 10 Users", "5 GB Storage", "Chart of Accounts", "Priority Email Support"]'::jsonb),
        ('professional', 'Professional', 'สำหรับองค์กรที่ต้องการระบบ CFO ครบวงจร', 2990, 29900, 50, 20, 100000,
          '["ทุกอย่างใน Starter", "Consolidation Module", "Advanced Analytics", "Workflow & Approvals", "API Access", "Up to 50 Users", "20 GB Storage", "Audit Logs", "Phone & Chat Support"]'::jsonb),
        ('enterprise', 'Enterprise', 'สำหรับองค์กรขนาดใหญ่ พร้อม SLA และ Dedicated Support', 8990, 89900, NULL, NULL, NULL,
          '["ทุกอย่างใน Professional", "Unlimited Users", "Unlimited Storage", "Unlimited API", "Custom Integrations", "Dedicated Account Manager", "SLA 99.9%", "On-premise Option", "Custom Training"]'::jsonb)
      ON CONFLICT (plan_code) DO NOTHING;
    `);

    // Create default subscription if none exists
    const existing = await pool.query(
      'SELECT id FROM tenant_subscriptions WHERE tenant_id = $1 LIMIT 1',
      [tenantId]
    );
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO tenant_subscriptions
          (tenant_id, plan_code, plan_name, billing_cycle, status, trial_ends_at,
           current_period_start, current_period_end, amount, currency, created_by)
         VALUES ($1, 'free_trial', 'Free Trial', 'monthly', 'trial',
           CURRENT_TIMESTAMP + INTERVAL '30 days',
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP + INTERVAL '30 days',
           0, 'THB', 'system')`,
        [tenantId]
      );
    }
  }

  // ============ Plans ============

  async listPlans(tenantId: string): Promise<BillingPlan[]> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM billing_plans WHERE is_active = true ORDER BY price_monthly ASC`
    );
    return result.rows.map(r => ({ ...r, features: r.features || [] }));
  }

  // ============ Subscription ============

  async getSubscription(tenantId: string): Promise<TenantSubscription | null> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT * FROM tenant_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    return result.rows[0] || null;
  }

  async subscribe(tenantId: string, dto: {
    plan_code: string;
    billing_cycle: 'monthly' | 'annual';
    created_by: string;
  }): Promise<TenantSubscription> {
    const pool = await this.databaseService.getTenantPool(tenantId);

    const planResult = await pool.query(
      `SELECT * FROM billing_plans WHERE plan_code = $1 AND is_active = true`,
      [dto.plan_code]
    );
    if (planResult.rows.length === 0) throw new Error('Plan not found');
    const plan = planResult.rows[0];

    const amount = dto.billing_cycle === 'annual' ? plan.price_annual : plan.price_monthly;
    const periodMonths = dto.billing_cycle === 'annual' ? 12 : 1;

    // Deactivate current subscription
    await pool.query(
      `UPDATE tenant_subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $1 AND status IN ('active', 'trial')`,
      [tenantId]
    );

    const result = await pool.query(
      `INSERT INTO tenant_subscriptions
        (tenant_id, plan_code, plan_name, billing_cycle, status,
         current_period_start, current_period_end, next_billing_date,
         amount, currency, created_by)
       VALUES ($1, $2, $3, $4, 'active',
         CURRENT_TIMESTAMP,
         CURRENT_TIMESTAMP + ($5 || ' months')::INTERVAL,
         CURRENT_TIMESTAMP + ($5 || ' months')::INTERVAL,
         $6, 'THB', $7)
       RETURNING *`,
      [tenantId, dto.plan_code, plan.plan_name, dto.billing_cycle, periodMonths, amount, dto.created_by]
    );
    return result.rows[0];
  }

  async cancelSubscription(tenantId: string, reason: string, cancelledBy: string): Promise<TenantSubscription> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `UPDATE tenant_subscriptions
       SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
           cancel_reason = $2, updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND status IN ('active', 'trial')
       RETURNING *`,
      [tenantId, reason]
    );
    if (result.rows.length === 0) throw new Error('No active subscription to cancel');
    return result.rows[0];
  }

  // ============ Invoices ============

  async listInvoices(tenantId: string, status?: string): Promise<BillingInvoice[]> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    let query = `SELECT * FROM billing_invoices WHERE tenant_id = $1`;
    const params: any[] = [tenantId];
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    return result.rows;
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<{ invoice: BillingInvoice; items: BillingInvoiceItem[] }> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const invResult = await pool.query(
      `SELECT * FROM billing_invoices WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId]
    );
    if (invResult.rows.length === 0) throw new Error('Invoice not found');
    const itemsResult = await pool.query(
      `SELECT * FROM billing_invoice_items WHERE invoice_id = $1 ORDER BY created_at`,
      [invoiceId]
    );
    return { invoice: invResult.rows[0], items: itemsResult.rows };
  }

  async createInvoice(tenantId: string, dto: {
    period_start: string;
    period_end: string;
    due_date: string;
    items: { description: string; quantity: number; unit_price: number }[];
    tax_rate?: number;
    notes?: string;
    created_by: string;
  }): Promise<BillingInvoice> {
    const pool = await this.databaseService.getTenantPool(tenantId);

    // Generate invoice number
    const countResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM billing_invoices WHERE tenant_id = $1`,
      [tenantId]
    );
    const seq = parseInt(countResult.rows[0].cnt) + 1;
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

    const subtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const taxRate = dto.tax_rate ?? 7;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invResult = await client.query(
        `INSERT INTO billing_invoices
          (tenant_id, invoice_number, period_start, period_end, due_date,
           subtotal, tax_rate, tax_amount, total_amount, currency, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'THB', $10, $11)
         RETURNING *`,
        [tenantId, invoiceNumber, dto.period_start, dto.period_end, dto.due_date,
         subtotal, taxRate, taxAmount, totalAmount, dto.notes || null, dto.created_by]
      );
      const invoice = invResult.rows[0];

      for (const item of dto.items) {
        await client.query(
          `INSERT INTO billing_invoice_items (invoice_id, description, quantity, unit_price, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoice.id, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price]
        );
      }
      await client.query('COMMIT');
      return invoice;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async payInvoice(tenantId: string, invoiceId: string, paidBy: string): Promise<BillingInvoice> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `UPDATE billing_invoices
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, paid_by = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND tenant_id = $2 AND status IN ('pending', 'overdue')
       RETURNING *`,
      [invoiceId, tenantId, paidBy]
    );
    if (result.rows.length === 0) throw new Error('Invoice not found or already paid');
    return result.rows[0];
  }

  async updateOverdueInvoices(tenantId: string): Promise<number> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `UPDATE billing_invoices
       SET status = 'overdue', updated_at = CURRENT_TIMESTAMP
       WHERE tenant_id = $1 AND status = 'pending' AND due_date < CURRENT_DATE
       RETURNING id`,
      [tenantId]
    );
    return result.rowCount ?? 0;
  }

  // ============ Payments ============

  async listPayments(tenantId: string): Promise<BillingPayment[]> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `SELECT bp.*, bi.invoice_number
       FROM billing_payments bp
       LEFT JOIN billing_invoices bi ON bi.id = bp.invoice_id
       WHERE bp.tenant_id = $1
       ORDER BY bp.payment_date DESC, bp.created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async createPayment(tenantId: string, dto: {
    invoice_id?: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_number?: string;
    notes?: string;
    created_by: string;
  }): Promise<BillingPayment> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `INSERT INTO billing_payments
        (tenant_id, invoice_id, payment_date, amount, currency, payment_method, reference_number, notes, created_by)
       VALUES ($1, $2, $3, $4, 'THB', $5, $6, $7, $8)
       RETURNING *`,
      [tenantId, dto.invoice_id || null, dto.payment_date, dto.amount,
       dto.payment_method, dto.reference_number || null, dto.notes || null, dto.created_by]
    );
    return result.rows[0];
  }

  // ============ Usage ============

  async getUsage(tenantId: string, year?: number, month?: number): Promise<BillingUsage | null> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? (now.getMonth() + 1);
    const result = await pool.query(
      `SELECT * FROM billing_usage WHERE tenant_id = $1 AND period_year = $2 AND period_month = $3`,
      [tenantId, y, m]
    );
    return result.rows[0] || null;
  }

  async upsertUsage(tenantId: string, dto: Partial<BillingUsage> & { period_year: number; period_month: number }): Promise<BillingUsage> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const result = await pool.query(
      `INSERT INTO billing_usage
        (tenant_id, period_year, period_month, users_count, storage_used_gb,
         api_calls_count, reports_generated, etl_imports, scenarios_created)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, period_year, period_month) DO UPDATE SET
         users_count = EXCLUDED.users_count,
         storage_used_gb = EXCLUDED.storage_used_gb,
         api_calls_count = EXCLUDED.api_calls_count,
         reports_generated = EXCLUDED.reports_generated,
         etl_imports = EXCLUDED.etl_imports,
         scenarios_created = EXCLUDED.scenarios_created,
         recorded_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [tenantId, dto.period_year, dto.period_month,
       dto.users_count ?? 0, dto.storage_used_gb ?? 0,
       dto.api_calls_count ?? 0, dto.reports_generated ?? 0,
       dto.etl_imports ?? 0, dto.scenarios_created ?? 0]
    );
    return result.rows[0];
  }

  // Snapshot current usage dynamically from other tables
  async snapshotCurrentUsage(tenantId: string): Promise<BillingUsage> {
    const pool = await this.databaseService.getTenantPool(tenantId);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // Count users
    const usersResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM users WHERE tenant_id = $1`,
      [tenantId]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    // Count reports this month
    const reportsResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM financial_statements
       WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
      [tenantId, year, month]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    // Count ETL imports this month
    const etlResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM etl_transactions
       WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
      [tenantId, year, month]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    // Count scenarios this month
    const scenariosResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM scenarios
       WHERE tenant_id = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
      [tenantId, year, month]
    ).catch(() => ({ rows: [{ cnt: 0 }] }));

    return this.upsertUsage(tenantId, {
      period_year: year,
      period_month: month,
      users_count: parseInt(usersResult.rows[0].cnt) || 0,
      storage_used_gb: 0.1, // placeholder
      api_calls_count: 0,
      reports_generated: parseInt(reportsResult.rows[0].cnt) || 0,
      etl_imports: parseInt(etlResult.rows[0].cnt) || 0,
      scenarios_created: parseInt(scenariosResult.rows[0].cnt) || 0,
    });
  }

  // ============ Summary ============

  async getSummary(tenantId: string) {
    const pool = await this.databaseService.getTenantPool(tenantId);

    const [subResult, invoicesResult, paymentsResult, usageResult, overdueResult] = await Promise.all([
      pool.query(`SELECT * FROM tenant_subscriptions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`, [tenantId]),
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as total FROM billing_invoices WHERE tenant_id = $1 GROUP BY status`, [tenantId]),
      pool.query(`SELECT COALESCE(SUM(amount), 0) as total_paid FROM billing_payments WHERE tenant_id = $1 AND status = 'completed' AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)`, [tenantId]),
      pool.query(`SELECT * FROM billing_usage WHERE tenant_id = $1 ORDER BY period_year DESC, period_month DESC LIMIT 1`, [tenantId]),
      pool.query(`SELECT COUNT(*) as cnt FROM billing_invoices WHERE tenant_id = $1 AND status = 'overdue'`, [tenantId]),
    ]);

    const subscription = subResult.rows[0] || null;
    const invoiceStats: Record<string, { cnt: number; total: number }> = {};
    invoicesResult.rows.forEach((r: any) => {
      invoiceStats[r.status] = { cnt: parseInt(r.cnt), total: parseFloat(r.total) };
    });

    const outstandingAmount =
      ((invoiceStats['pending']?.total || 0) + (invoiceStats['overdue']?.total || 0));
    const totalInvoices = Object.values(invoiceStats).reduce((s, v) => s + v.cnt, 0);

    return {
      subscription,
      invoiceStats,
      totalInvoices,
      outstandingAmount,
      totalPaidYtd: parseFloat(paymentsResult.rows[0].total_paid) || 0,
      overdueCount: parseInt(overdueResult.rows[0].cnt) || 0,
      latestUsage: usageResult.rows[0] || null,
    };
  }
}
