--
-- PostgreSQL database dump
--

\restrict SskoQnvkRgj1AzsOTd9vO5yg9RPIIqEBDqZpPHlfBLUY4gYqZ1oXHjT65RMakr0

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 15.15 (Debian 15.15-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: calculate_forecast_cash_positions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_forecast_cash_positions(p_forecast_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_beginning_cash NUMERIC(20,2);
  v_running_cash NUMERIC(20,2);
  rec RECORD;
BEGIN
  -- Get forecast beginning cash
  SELECT beginning_cash INTO v_beginning_cash
  FROM cash_flow_forecasts WHERE id = p_forecast_id;
  
  v_running_cash := COALESCE(v_beginning_cash, 0);
  
  FOR rec IN 
    SELECT id, week_number,
           operating_cash_inflow, operating_cash_outflow,
           investing_cash_inflow, investing_cash_outflow,
           financing_cash_inflow, financing_cash_outflow
    FROM cash_flow_line_items
    WHERE forecast_id = p_forecast_id
    ORDER BY week_number
  LOOP
    UPDATE cash_flow_line_items SET
      beginning_cash = v_running_cash,
      net_change_in_cash = COALESCE(rec.operating_cash_inflow, 0) - COALESCE(rec.operating_cash_outflow, 0)
                         + COALESCE(rec.investing_cash_inflow, 0) - COALESCE(rec.investing_cash_outflow, 0)
                         + COALESCE(rec.financing_cash_inflow, 0) - COALESCE(rec.financing_cash_outflow, 0),
      ending_cash = v_running_cash 
                  + COALESCE(rec.operating_cash_inflow, 0) - COALESCE(rec.operating_cash_outflow, 0)
                  + COALESCE(rec.investing_cash_inflow, 0) - COALESCE(rec.investing_cash_outflow, 0)
                  + COALESCE(rec.financing_cash_inflow, 0) - COALESCE(rec.financing_cash_outflow, 0)
    WHERE id = rec.id;
    
    v_running_cash := v_running_cash 
                    + COALESCE(rec.operating_cash_inflow, 0) - COALESCE(rec.operating_cash_outflow, 0)
                    + COALESCE(rec.investing_cash_inflow, 0) - COALESCE(rec.investing_cash_outflow, 0)
                    + COALESCE(rec.financing_cash_inflow, 0) - COALESCE(rec.financing_cash_outflow, 0);
  END LOOP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approval_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    step_order integer NOT NULL,
    approver_email character varying(255) NOT NULL,
    action character varying(50) NOT NULL,
    action_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    comments text,
    delegated_to character varying(255),
    CONSTRAINT approval_actions_action_check CHECK (((action)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying, 'delegate'::character varying])::text[])))
);


--
-- Name: approval_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    chain_name character varying(255) NOT NULL,
    document_type character varying(50) NOT NULL,
    steps jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: approval_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    request_id uuid NOT NULL,
    recipient_email character varying(255) NOT NULL,
    notification_type character varying(50) NOT NULL,
    sent_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    chain_id uuid NOT NULL,
    document_type character varying(50) NOT NULL,
    document_id character varying(255) NOT NULL,
    document_name character varying(255) NOT NULL,
    requested_by character varying(255) NOT NULL,
    request_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    current_step integer DEFAULT 1,
    status character varying(50) DEFAULT 'pending'::character varying,
    completed_date timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT approval_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb,
    performed_by character varying(255) NOT NULL,
    performed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ip_address inet,
    CONSTRAINT audit_log_action_check CHECK (((action)::text = ANY ((ARRAY['create'::character varying, 'update'::character varying, 'delete'::character varying, 'approve'::character varying, 'lock'::character varying])::text[])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    user_email character varying(255) NOT NULL,
    action character varying(100) NOT NULL,
    resource_type character varying(100) NOT NULL,
    resource_id character varying(255),
    changes jsonb,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: billing_invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    amount numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: billing_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    invoice_number character varying(50) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    due_date date NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 7 NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0 NOT NULL,
    total_amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'THB'::character varying NOT NULL,
    notes text,
    paid_at timestamp with time zone,
    paid_by character varying(255),
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: billing_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    invoice_id uuid,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'THB'::character varying NOT NULL,
    payment_method character varying(50) DEFAULT 'bank_transfer'::character varying NOT NULL,
    reference_number character varying(100),
    status character varying(20) DEFAULT 'completed'::character varying NOT NULL,
    notes text,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_code character varying(50) NOT NULL,
    plan_name character varying(100) NOT NULL,
    description text,
    price_monthly numeric(12,2) DEFAULT 0 NOT NULL,
    price_annual numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'THB'::character varying NOT NULL,
    max_users integer,
    max_storage_gb integer,
    max_api_calls_day integer,
    features jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: billing_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    users_count integer DEFAULT 0 NOT NULL,
    storage_used_gb numeric(10,3) DEFAULT 0 NOT NULL,
    api_calls_count integer DEFAULT 0 NOT NULL,
    reports_generated integer DEFAULT 0 NOT NULL,
    etl_imports integer DEFAULT 0 NOT NULL,
    scenarios_created integer DEFAULT 0 NOT NULL,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    dimension_code character varying(50),
    account_code character varying(50),
    period character varying(20),
    allocated_amount numeric(20,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    version_id uuid,
    account_code character varying(50) NOT NULL,
    account_name character varying(255),
    period character varying(20) NOT NULL,
    amount numeric(20,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    template_name character varying(255) NOT NULL,
    description text,
    line_items jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    version_name character varying(255),
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    budget_name character varying(255) NOT NULL,
    fiscal_year integer NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    description text,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    budget_type character varying(50) DEFAULT 'operating'::character varying,
    CONSTRAINT budgets_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying, 'locked'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: cash_flow_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    category_name character varying(255) NOT NULL,
    category_type character varying(20) NOT NULL,
    sort_order integer DEFAULT 0,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cash_flow_categories_category_type_check CHECK (((category_type)::text = ANY ((ARRAY['inflow'::character varying, 'outflow'::character varying])::text[])))
);


--
-- Name: cash_flow_forecasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    forecast_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    weeks integer DEFAULT 13,
    beginning_cash numeric(20,2) DEFAULT 0,
    notes text,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cash_flow_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    forecast_id uuid NOT NULL,
    week_number integer NOT NULL,
    week_start_date date NOT NULL,
    week_end_date date NOT NULL,
    operating_cash_inflow numeric(20,2) DEFAULT 0,
    operating_cash_outflow numeric(20,2) DEFAULT 0,
    investing_cash_inflow numeric(20,2) DEFAULT 0,
    investing_cash_outflow numeric(20,2) DEFAULT 0,
    financing_cash_inflow numeric(20,2) DEFAULT 0,
    financing_cash_outflow numeric(20,2) DEFAULT 0,
    net_change_in_cash numeric(20,2) DEFAULT 0,
    beginning_cash numeric(20,2) DEFAULT 0,
    ending_cash numeric(20,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    account_code character varying(50) NOT NULL,
    account_name character varying(255) NOT NULL,
    account_type character varying(50) NOT NULL,
    normal_balance character varying(10),
    description text,
    level integer DEFAULT 1,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: coa_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coa_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name character varying(255) NOT NULL,
    industry character varying(100),
    description text,
    accounts jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);



--
-- Name: company_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    company_name character varying(255),
    industry character varying(100),
    address text,
    phone character varying(50),
    email character varying(255),
    website character varying(255),
    tax_id character varying(50),
    fiscal_year_start integer DEFAULT 1,
    default_currency character varying(3) DEFAULT 'THB'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cookie_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cookie_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_identifier character varying(255) NOT NULL,
    consent_categories jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: dimension_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dimension_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    dimension_type character varying(50) NOT NULL,
    dimension_name character varying(100) NOT NULL,
    hierarchy_level integer DEFAULT 0,
    parent_id uuid,
    is_custom boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dimension_config_dimension_type_check CHECK (((dimension_type)::text = ANY ((ARRAY['row'::character varying, 'column'::character varying])::text[])))
);


--
-- Name: dimension_hierarchies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dimension_hierarchies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dimension_id uuid NOT NULL,
    parent_code character varying(50),
    node_code character varying(50) NOT NULL,
    node_name character varying(255) NOT NULL,
    level integer NOT NULL,
    sort_order integer DEFAULT 0,
    is_leaf boolean DEFAULT false,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: dimensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dimensions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    dimension_code character varying(50) NOT NULL,
    dimension_name character varying(255) NOT NULL,
    dimension_type character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: dsar_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsar_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    request_type character varying(50) NOT NULL,
    requester_email character varying(255) NOT NULL,
    requester_name character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    description text,
    response text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: etl_parameters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_parameters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    parameter_name character varying(255) NOT NULL,
    parameter_type character varying(50) NOT NULL,
    currency_pair character varying(20),
    value numeric(18,6) NOT NULL,
    effective_date date NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT etl_parameters_parameter_type_check CHECK (((parameter_type)::text = ANY ((ARRAY['fx_rate'::character varying, 'inflation_rate'::character varying, 'custom'::character varying])::text[])))
);


--
-- Name: etl_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etl_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    transaction_date date NOT NULL,
    account_code character varying(50) NOT NULL,
    description text,
    debit numeric(20,2) DEFAULT 0,
    credit numeric(20,2) DEFAULT 0,
    reference character varying(255),
    source character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: financial_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_id uuid NOT NULL,
    line_code character varying(50) NOT NULL,
    line_name character varying(255) NOT NULL,
    parent_code character varying(50),
    line_order integer DEFAULT 0,
    amount numeric(20,2) DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'THB'::character varying,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: financial_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    statement_type character varying(50) NOT NULL,
    period_type character varying(20) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    scenario character varying(50) DEFAULT 'actual'::character varying,
    status character varying(20) DEFAULT 'draft'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(255),
    CONSTRAINT financial_statements_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['monthly'::character varying, 'quarterly'::character varying, 'yearly'::character varying])::text[]))),
    CONSTRAINT financial_statements_statement_type_check CHECK (((statement_type)::text = ANY ((ARRAY['PL'::character varying, 'BS'::character varying, 'CF'::character varying])::text[]))),
    CONSTRAINT financial_statements_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying, 'locked'::character varying])::text[])))
);


--
-- Name: import_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    import_type character varying(50) NOT NULL,
    file_name character varying(255),
    file_size integer,
    status character varying(20) NOT NULL,
    rows_imported integer DEFAULT 0,
    rows_failed integer DEFAULT 0,
    error_log text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    created_by character varying(255),
    CONSTRAINT import_history_import_type_check CHECK (((import_type)::text = ANY ((ARRAY['excel'::character varying, 'csv'::character varying, 'api'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT import_history_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: import_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    file_name character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    rows_processed integer DEFAULT 0,
    rows_succeeded integer DEFAULT 0,
    rows_failed integer DEFAULT 0,
    error_details jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone
);


--
-- Name: import_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    schedule_name character varying(255),
    source_type character varying(50),
    schedule_cron character varying(100),
    is_active boolean DEFAULT true,
    last_run timestamp with time zone,
    next_run timestamp with time zone,
    config jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: import_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    template_name character varying(255) NOT NULL,
    file_type character varying(20) DEFAULT 'csv'::character varying,
    column_mapping jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: imported_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imported_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    import_id uuid,
    transaction_date date,
    description text,
    amount numeric(20,2),
    debit_account character varying(50),
    credit_account character varying(50),
    reference character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mapping_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    rule_name character varying(255) NOT NULL,
    source_field character varying(255),
    target_field character varying(255),
    transformation jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: object_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    version_number integer DEFAULT 1 NOT NULL,
    data jsonb NOT NULL,
    change_description text,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: ownership_transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ownership_transfer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    from_user character varying(255),
    to_user character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone
);


--
-- Name: projected_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projected_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    projection_id character varying(100) NOT NULL,
    statement_type character varying(50) NOT NULL,
    period_number integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    line_items jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: projections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projections (
    id character varying(100) NOT NULL,
    tenant_id character varying(255),
    base_statement_id uuid,
    scenario_id uuid,
    projection_periods integer,
    period_type character varying(20),
    statement_count integer,
    ratios jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: scenario_assumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenario_assumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scenario_id uuid NOT NULL,
    assumption_category character varying(50) NOT NULL,
    assumption_key character varying(100) NOT NULL,
    assumption_value numeric(20,4),
    assumption_unit character varying(20),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT scenario_assumptions_assumption_category_check CHECK (((assumption_category)::text = ANY ((ARRAY['revenue'::character varying, 'expense'::character varying, 'asset'::character varying, 'liability'::character varying, 'depreciation'::character varying, 'tax'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scenarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    scenario_name character varying(100) NOT NULL,
    scenario_type character varying(50) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_by character varying(255),
    CONSTRAINT scenarios_scenario_type_check CHECK (((scenario_type)::text = ANY ((ARRAY['best'::character varying, 'base'::character varying, 'worst'::character varying, 'custom'::character varying, 'ai_generated'::character varying])::text[])))
);


--
-- Name: statement_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.statement_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    template_name character varying(255) NOT NULL,
    statement_type character varying(10) NOT NULL,
    description text,
    line_items jsonb NOT NULL,
    validation_rules jsonb,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT statement_templates_statement_type_check CHECK (((statement_type)::text = ANY ((ARRAY['PL'::character varying, 'BS'::character varying, 'CF'::character varying])::text[])))
);


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_key character varying(255) NOT NULL,
    config_value jsonb,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tenant_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_data (
    id integer NOT NULL,
    key text,
    value text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenant_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tenant_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tenant_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tenant_data_id_seq OWNED BY public.tenant_data.id;


--
-- Name: tenant_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    plan_code character varying(50) NOT NULL,
    plan_name character varying(100) NOT NULL,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
    status character varying(30) DEFAULT 'trial'::character varying NOT NULL,
    trial_ends_at timestamp with time zone,
    current_period_start timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_period_end timestamp with time zone,
    next_billing_date timestamp with time zone,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(10) DEFAULT 'THB'::character varying NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    created_by character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    transaction_date date,
    description text,
    amount numeric(20,2),
    account_code character varying(50),
    reference character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    email character varying(255) NOT NULL,
    role character varying(50) DEFAULT 'viewer'::character varying,
    invited_by character varying(255),
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    email character varying(255) NOT NULL,
    full_name character varying(255),
    role character varying(50) DEFAULT 'viewer'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: version_comparisons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    version_a uuid NOT NULL,
    version_b uuid NOT NULL,
    diff jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: version_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    max_versions integer DEFAULT 50,
    retention_days integer DEFAULT 365,
    auto_cleanup boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: tenant_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_data ALTER COLUMN id SET DEFAULT nextval('public.tenant_data_id_seq'::regclass);


--
-- Data for Name: approval_actions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_actions (id, request_id, step_order, approver_email, action, action_date, comments, delegated_to) FROM stdin;
\.


--
-- Data for Name: approval_chains; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_chains (id, tenant_id, chain_name, document_type, steps, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: approval_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_notifications (id, tenant_id, request_id, recipient_email, notification_type, sent_date, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_requests (id, tenant_id, chain_id, document_type, document_id, document_name, requested_by, request_date, current_step, status, completed_date, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, tenant_id, entity_type, entity_id, action, changes, performed_by, performed_at, ip_address) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, tenant_id, user_email, action, resource_type, resource_id, changes, ip_address, user_agent, "timestamp") FROM stdin;
\.


--
-- Data for Name: billing_invoice_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_invoice_items (id, invoice_id, description, quantity, unit_price, amount, created_at) FROM stdin;
\.


--
-- Data for Name: billing_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_invoices (id, tenant_id, invoice_number, period_start, period_end, due_date, status, subtotal, tax_rate, tax_amount, total_amount, currency, notes, paid_at, paid_by, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: billing_payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_payments (id, tenant_id, invoice_id, payment_date, amount, currency, payment_method, reference_number, status, notes, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: billing_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_plans (id, plan_code, plan_name, description, price_monthly, price_annual, currency, max_users, max_storage_gb, max_api_calls_day, features, is_active, created_at) FROM stdin;
4a3335a5-babf-44e8-bb7f-2121e49da709	free_trial	Free Trial	ทดลองใช้ฟรี 30 วัน เหมาะสำหรับการทดสอบระบบ	0.00	0.00	THB	3	1	1000	["Dashboard & Reports", "Financial Statements", "Basic ETL Import", "Up to 3 Users", "1 GB Storage", "Email Support"]	t	2026-02-22 09:29:14.078332+00
a5b69f16-6fc6-48f1-b077-0f8dc2841821	starter	Starter	สำหรับธุรกิจขนาดเล็กถึงกลาง เริ่มต้นจัดการการเงินอย่างมืออาชีพ	990.00	9900.00	THB	10	5	10000	["ทุกอย่างใน Free Trial", "Scenarios & Projections", "Budget Management", "Cash Flow Forecast", "Up to 10 Users", "5 GB Storage", "Chart of Accounts", "Priority Email Support"]	t	2026-02-22 09:29:14.078332+00
68ee4ba6-b712-4aac-85ea-4cb5effb3988	professional	Professional	สำหรับองค์กรที่ต้องการระบบ CFO ครบวงจร	2990.00	29900.00	THB	50	20	100000	["ทุกอย่างใน Starter", "Consolidation Module", "Advanced Analytics", "Workflow & Approvals", "API Access", "Up to 50 Users", "20 GB Storage", "Audit Logs", "Phone & Chat Support"]	t	2026-02-22 09:29:14.078332+00
a7924594-f577-438a-859a-d8d70404e863	enterprise	Enterprise	สำหรับองค์กรขนาดใหญ่ พร้อม SLA และ Dedicated Support	8990.00	89900.00	THB	\N	\N	\N	["ทุกอย่างใน Professional", "Unlimited Users", "Unlimited Storage", "Unlimited API", "Custom Integrations", "Dedicated Account Manager", "SLA 99.9%", "On-premise Option", "Custom Training"]	t	2026-02-22 09:29:14.078332+00
\.


--
-- Data for Name: billing_usage; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.billing_usage (id, tenant_id, period_year, period_month, users_count, storage_used_gb, api_calls_count, reports_generated, etl_imports, scenarios_created, recorded_at) FROM stdin;
8843aec4-a201-4c6f-8a16-0aa1b3068d2d	admin	2026	2	3	0.100	0	1	0	2	2026-02-22 11:38:02.331821+00
\.


--
-- Data for Name: budget_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_allocations (id, budget_id, dimension_code, account_code, period, allocated_amount, created_at) FROM stdin;
\.


--
-- Data for Name: budget_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_line_items (id, budget_id, version_id, account_code, account_name, period, amount, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: budget_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_templates (id, tenant_id, template_name, description, line_items, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: budget_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_versions (id, budget_id, version_number, version_name, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budgets (id, tenant_id, budget_name, fiscal_year, status, description, created_by, created_at, updated_at, budget_type) FROM stdin;
\.


--
-- Data for Name: cash_flow_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_categories (id, tenant_id, category_name, category_type, sort_order, display_order, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: cash_flow_forecasts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_forecasts (id, tenant_id, forecast_name, start_date, weeks, beginning_cash, notes, status, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cash_flow_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_line_items (id, forecast_id, week_number, week_start_date, week_end_date, operating_cash_inflow, operating_cash_outflow, investing_cash_inflow, investing_cash_outflow, financing_cash_inflow, financing_cash_outflow, net_change_in_cash, beginning_cash, ending_cash, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: chart_of_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chart_of_accounts (id, tenant_id, account_code, account_name, account_type, normal_balance, description, level, sort_order, is_active, parent_id, created_at, updated_at) FROM stdin;
b5614b7c-fabd-491e-96ef-f0844dcc1918	admin	1000	Cash and Cash Equivalents	asset	debit	\N	1	0	t	\N	2026-02-22 07:12:58.994925+00	2026-02-22 07:12:58.994925+00
63bb8d56-cef1-48b4-844d-55274b30d56f	admin	1100	Accounts Receivable	asset	debit	\N	1	0	t	\N	2026-02-22 07:12:58.996949+00	2026-02-22 07:12:58.996949+00
21166f03-18f1-47c4-99d3-0eb58b5e83f6	admin	1200	Inventory	asset	debit	\N	1	0	t	\N	2026-02-22 07:12:58.997568+00	2026-02-22 07:12:58.997568+00
5e726979-6f77-4e36-9da7-032e2cbccafb	admin	1500	Fixed Assets	asset	debit	\N	1	0	t	\N	2026-02-22 07:12:58.998176+00	2026-02-22 07:12:58.998176+00
94f7d3b4-ba5f-4f4c-ad77-4625df6b7c46	admin	2000	Accounts Payable	liability	credit	\N	1	0	t	\N	2026-02-22 07:12:58.998775+00	2026-02-22 07:12:58.998775+00
6cf0340d-e744-44c6-9d5e-4849f40b6f87	admin	2100	Accrued Expenses	liability	credit	\N	1	0	t	\N	2026-02-22 07:12:58.999517+00	2026-02-22 07:12:58.999517+00
e1b8b531-5557-4c7f-ac97-a415c7de161d	admin	2500	Long-term Debt	liability	credit	\N	1	0	t	\N	2026-02-22 07:12:59.000136+00	2026-02-22 07:12:59.000136+00
bf9412b9-6c37-4dff-8259-93e371428eaf	admin	3000	Common Stock	equity	credit	\N	1	0	t	\N	2026-02-22 07:12:59.000912+00	2026-02-22 07:12:59.000912+00
6c01b069-5bf4-44fa-bbab-97ac8a2fc465	admin	3100	Retained Earnings	equity	credit	\N	1	0	t	\N	2026-02-22 07:12:59.001588+00	2026-02-22 07:12:59.001588+00
81ef407c-3007-4a8b-b7fb-8cb9c82e9d6b	admin	4000	Revenue	revenue	credit	\N	1	0	t	\N	2026-02-22 07:12:59.002077+00	2026-02-22 07:12:59.002077+00
755c0d62-7509-4c65-8fee-9ffe6230eae4	admin	4100	Service Revenue	revenue	credit	\N	1	0	t	\N	2026-02-22 07:12:59.003814+00	2026-02-22 07:12:59.003814+00
0b9efcc1-fcf2-45d2-a7e3-8de22aacd87b	admin	5000	Cost of Goods Sold	expense	debit	\N	1	0	t	\N	2026-02-22 07:12:59.004226+00	2026-02-22 07:12:59.004226+00
14aed431-c0b2-4a04-b4d6-4c6ddf1c3202	admin	6000	Salaries Expense	expense	debit	\N	1	0	t	\N	2026-02-22 07:12:59.004583+00	2026-02-22 07:12:59.004583+00
75b058aa-80eb-43cd-9887-f6dd2a90aa8d	admin	6100	Rent Expense	expense	debit	\N	1	0	t	\N	2026-02-22 07:12:59.004956+00	2026-02-22 07:12:59.004956+00
cc0468cf-1fae-49a7-89c3-d46dccbc3052	admin	6200	Utilities Expense	expense	debit	\N	1	0	t	\N	2026-02-22 07:12:59.005308+00	2026-02-22 07:12:59.005308+00
7bf97ff6-59dd-4b4f-ba13-e3efe061cd95	admin	1010	Petty Cash	asset	debit	\N	2	0	f	b5614b7c-fabd-491e-96ef-f0844dcc1918	2026-02-22 07:13:16.711047+00	2026-02-22 07:13:27.483874+00
\.


--
-- Data for Name: coa_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coa_templates (id, template_name, industry, description, accounts, is_active, created_at, updated_at) FROM stdin;
2a19adc0-95c0-43cd-bdff-5bc8c736ad62	General Business	General	Standard chart of accounts for general businesses	[{"level": 1, "account_code": "1000", "account_name": "Cash and Cash Equivalents", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1100", "account_name": "Accounts Receivable", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1200", "account_name": "Inventory", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1500", "account_name": "Fixed Assets", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "2000", "account_name": "Accounts Payable", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2100", "account_name": "Accrued Expenses", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2500", "account_name": "Long-term Debt", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "3000", "account_name": "Common Stock", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "3100", "account_name": "Retained Earnings", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "4000", "account_name": "Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "4100", "account_name": "Service Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "5000", "account_name": "Cost of Goods Sold", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6000", "account_name": "Salaries Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6100", "account_name": "Rent Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6200", "account_name": "Utilities Expense", "account_type": "expense", "normal_balance": "debit"}]	t	2026-02-21 13:21:32.247718+00	2026-02-21 13:21:32.247718+00
\.


--
-- Data for Name: company_profile; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_profile (id, tenant_id, company_name, industry, address, phone, email, website, tax_id, fiscal_year_start, default_currency, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cookie_consents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cookie_consents (id, user_identifier, consent_categories, ip_address, user_agent, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dimension_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dimension_config (id, tenant_id, dimension_type, dimension_name, hierarchy_level, parent_id, is_custom, created_at) FROM stdin;
\.


--
-- Data for Name: dimension_hierarchies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dimension_hierarchies (id, dimension_id, parent_code, node_code, node_name, level, sort_order, is_leaf, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dimensions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dimensions (id, tenant_id, dimension_code, dimension_name, dimension_type, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dsar_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dsar_requests (id, tenant_id, request_type, requester_email, requester_name, status, description, response, completed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: etl_parameters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.etl_parameters (id, tenant_id, parameter_name, parameter_type, currency_pair, value, effective_date, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: etl_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.etl_transactions (id, tenant_id, transaction_date, account_code, description, debit, credit, reference, source, created_at) FROM stdin;
\.


--
-- Data for Name: financial_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_line_items (id, statement_id, line_code, line_name, parent_code, line_order, amount, currency, notes, created_at, updated_at) FROM stdin;
0ee76be5-ab12-42ba-9544-a10beb7a1de3	d53e3ad8-e49d-4814-bd36-764436547557	4000	4000	\N	1	95000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
3790841c-cdfc-4c12-8748-97e6ab006ca3	d53e3ad8-e49d-4814-bd36-764436547557	4100	4100	\N	2	150000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
33bff50e-a0eb-44dc-9c78-260442f78f02	d53e3ad8-e49d-4814-bd36-764436547557	4200	4200	\N	3	280000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
580ae425-e56a-495d-8fba-8d9aba363c51	d53e3ad8-e49d-4814-bd36-764436547557	5100	5100	\N	4	-8500.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
337e8aba-1f95-4ff6-a688-63d624875a65	d53e3ad8-e49d-4814-bd36-764436547557	5200	5200	\N	5	-45000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
3e3965ff-0be2-423e-b022-50276a18e853	d53e3ad8-e49d-4814-bd36-764436547557	5300	5300	\N	6	-12000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
9f159648-1469-4d75-931d-b9ee0933b973	d53e3ad8-e49d-4814-bd36-764436547557	5400	5400	\N	7	-18000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
75fb32a5-1fae-4156-ae4d-778c2d2bf3e6	d53e3ad8-e49d-4814-bd36-764436547557	5500	5500	\N	8	-4200.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
3ad9ac9e-d100-4e6c-bb3f-24563a69d8ee	d53e3ad8-e49d-4814-bd36-764436547557	Accounts Receivable	Accounts Receivable	\N	9	525000.00	THB	3 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
eac27fa3-482a-487b-ba0c-f58932b97ba7	d53e3ad8-e49d-4814-bd36-764436547557	Office Supplies	Office Supplies	\N	10	-8500.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
1d431452-dd6a-42ba-85dd-2f3b7a93ddfa	d53e3ad8-e49d-4814-bd36-764436547557	Rent Expense	Rent Expense	\N	11	-45000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
53492581-8552-443b-aef3-2ab6e60dcd4a	d53e3ad8-e49d-4814-bd36-764436547557	Cloud Hosting	Cloud Hosting	\N	12	-12000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
149ae5b4-befe-43e5-b007-b20e8426a4f8	d53e3ad8-e49d-4814-bd36-764436547557	Insurance Expense	Insurance Expense	\N	13	-18000.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
4633b651-add0-4d54-be41-b2483059ff71	d53e3ad8-e49d-4814-bd36-764436547557	Utilities	Utilities	\N	14	-4200.00	THB	1 transaction(s) aggregated	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734
\.


--
-- Data for Name: financial_statements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_statements (id, tenant_id, statement_type, period_type, period_start, period_end, scenario, status, created_at, updated_at, created_by) FROM stdin;
d53e3ad8-e49d-4814-bd36-764436547557	admin	PL	quarterly	2026-01-01	2026-02-28	actual	draft	2026-02-21 17:02:07.66734	2026-02-21 17:02:07.66734	admin
\.


--
-- Data for Name: import_history; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_history (id, tenant_id, import_type, file_name, file_size, status, rows_imported, rows_failed, error_log, created_at, completed_at, created_by) FROM stdin;
\.


--
-- Data for Name: import_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_logs (id, tenant_id, file_name, status, rows_processed, rows_succeeded, rows_failed, error_details, created_at, completed_at) FROM stdin;
\.


--
-- Data for Name: import_schedules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_schedules (id, tenant_id, schedule_name, source_type, schedule_cron, is_active, last_run, next_run, config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: import_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_templates (id, tenant_id, template_name, file_type, column_mapping, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: imported_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.imported_transactions (id, tenant_id, import_id, transaction_date, description, amount, debit_account, credit_account, reference, status, created_at) FROM stdin;
\.


--
-- Data for Name: mapping_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mapping_rules (id, tenant_id, rule_name, source_field, target_field, transformation, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: object_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.object_versions (id, tenant_id, entity_type, entity_id, version_number, data, change_description, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: ownership_transfer_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ownership_transfer_requests (id, tenant_id, from_user, to_user, status, created_at, completed_at) FROM stdin;
\.


--
-- Data for Name: projected_statements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projected_statements (id, projection_id, statement_type, period_number, period_start, period_end, line_items, created_at) FROM stdin;
\.


--
-- Data for Name: projections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.projections (id, tenant_id, base_statement_id, scenario_id, projection_periods, period_type, statement_count, ratios, created_at) FROM stdin;
\.


--
-- Data for Name: scenario_assumptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scenario_assumptions (id, scenario_id, assumption_category, assumption_key, assumption_value, assumption_unit, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scenarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scenarios (id, tenant_id, scenario_name, scenario_type, description, is_active, created_at, updated_at, created_by) FROM stdin;
62f50af4-c31c-4de0-a8e9-22e4432ed3ee	admin	Q1-2026 Forecast	base	Base case forecast for Q1 2026	t	2026-02-21 23:35:22.543784	2026-02-22 09:39:34.953863	admin
f7e89652-2ae9-4b7b-b421-95637f5379be	admin	Q2-2026 Forecast	base	\N	t	2026-02-22 11:33:37.511587	2026-02-22 11:33:37.511587	admin
\.


--
-- Data for Name: statement_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.statement_templates (id, tenant_id, template_name, statement_type, description, line_items, validation_rules, is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_config (id, config_key, config_value, description, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenant_data; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_data (id, key, value, created_at) FROM stdin;
\.


--
-- Data for Name: tenant_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_subscriptions (id, tenant_id, plan_code, plan_name, billing_cycle, status, trial_ends_at, current_period_start, current_period_end, next_billing_date, amount, currency, cancelled_at, cancel_reason, created_by, created_at, updated_at) FROM stdin;
fe1f2934-e404-4def-abd6-6d9b97fd48af	admin	free_trial	Free Trial	monthly	trial	2026-03-24 09:29:14.080429+00	2026-02-22 09:29:14.080429+00	2026-03-24 09:29:14.080429+00	\N	0.00	THB	\N	\N	system	2026-02-22 09:29:14.080429+00	2026-02-22 09:29:14.080429+00
c4eb0b75-e5e2-435d-8beb-a2d26fbbe6d8	admin-tenant	free_trial	Free Trial	monthly	trial	2026-03-24 09:30:35.281615+00	2026-02-22 09:30:35.281615+00	2026-03-24 09:30:35.281615+00	\N	0.00	THB	\N	\N	system	2026-02-22 09:30:35.281615+00	2026-02-22 09:30:35.281615+00
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.transactions (id, tenant_id, transaction_date, description, amount, account_code, reference, created_at) FROM stdin;
\.


--
-- Data for Name: user_invitations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_invitations (id, tenant_id, email, role, invited_by, status, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, tenant_id, email, full_name, role, is_active, created_at, updated_at) FROM stdin;
ef26db8a-7ffb-4c83-a10e-510c4e7fa083	admin	admin@admin.local	Admin User	admin	t	2026-02-21 14:22:16.007572+00	2026-02-21 14:22:16.007572+00
fa853a5f-1433-4c22-b9e3-cae19e18ce3c	admin	analyst@admin.local	Admin Analyst	analyst	t	2026-02-21 14:22:16.007572+00	2026-02-21 14:22:16.007572+00
ca7e5ae3-3745-41f9-991f-558180025cca	admin	viewer@admin.local	Admin Viewer	viewer	t	2026-02-21 14:22:16.007572+00	2026-02-21 14:22:16.007572+00
\.


--
-- Data for Name: version_comparisons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.version_comparisons (id, tenant_id, entity_type, version_a, version_b, diff, created_at) FROM stdin;
\.


--
-- Data for Name: version_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.version_policies (id, tenant_id, entity_type, max_versions, retention_days, auto_cleanup, created_at, updated_at) FROM stdin;
\.


--
-- Name: tenant_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_data_id_seq', 1, false);


--
-- Name: approval_actions approval_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions
    ADD CONSTRAINT approval_actions_pkey PRIMARY KEY (id);


--
-- Name: approval_chains approval_chains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_chains
    ADD CONSTRAINT approval_chains_pkey PRIMARY KEY (id);


--
-- Name: approval_notifications approval_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_notifications
    ADD CONSTRAINT approval_notifications_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: billing_invoice_items billing_invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_items
    ADD CONSTRAINT billing_invoice_items_pkey PRIMARY KEY (id);


--
-- Name: billing_invoices billing_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: billing_invoices billing_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoices
    ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);


--
-- Name: billing_payments billing_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_plan_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_plan_code_key UNIQUE (plan_code);


--
-- Name: billing_usage billing_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_usage
    ADD CONSTRAINT billing_usage_pkey PRIMARY KEY (id);


--
-- Name: billing_usage billing_usage_tenant_id_period_year_period_month_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_usage
    ADD CONSTRAINT billing_usage_tenant_id_period_year_period_month_key UNIQUE (tenant_id, period_year, period_month);


--
-- Name: budget_allocations budget_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_allocations
    ADD CONSTRAINT budget_allocations_pkey PRIMARY KEY (id);


--
-- Name: budget_line_items budget_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT budget_line_items_pkey PRIMARY KEY (id);


--
-- Name: budget_templates budget_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_pkey PRIMARY KEY (id);


--
-- Name: budget_versions budget_versions_budget_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_versions
    ADD CONSTRAINT budget_versions_budget_id_version_number_key UNIQUE (budget_id, version_number);


--
-- Name: budget_versions budget_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_versions
    ADD CONSTRAINT budget_versions_pkey PRIMARY KEY (id);


--
-- Name: budgets budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_categories cash_flow_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_categories
    ADD CONSTRAINT cash_flow_categories_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_forecasts cash_flow_forecasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_forecasts
    ADD CONSTRAINT cash_flow_forecasts_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_line_items cash_flow_line_items_forecast_id_week_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_line_items
    ADD CONSTRAINT cash_flow_line_items_forecast_id_week_number_key UNIQUE (forecast_id, week_number);


--
-- Name: cash_flow_line_items cash_flow_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_line_items
    ADD CONSTRAINT cash_flow_line_items_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_pkey PRIMARY KEY (id);


--
-- Name: chart_of_accounts chart_of_accounts_tenant_id_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chart_of_accounts
    ADD CONSTRAINT chart_of_accounts_tenant_id_account_code_key UNIQUE (tenant_id, account_code);


--
-- Name: coa_templates coa_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coa_templates
    ADD CONSTRAINT coa_templates_pkey PRIMARY KEY (id);


--
-- Name: company_profile company_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_pkey PRIMARY KEY (id);


--
-- Name: company_profile company_profile_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_tenant_id_key UNIQUE (tenant_id);


--
-- Name: cookie_consents cookie_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cookie_consents
    ADD CONSTRAINT cookie_consents_pkey PRIMARY KEY (id);


--
-- Name: dimension_config dimension_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_config
    ADD CONSTRAINT dimension_config_pkey PRIMARY KEY (id);


--
-- Name: dimension_config dimension_config_tenant_id_dimension_type_dimension_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_config
    ADD CONSTRAINT dimension_config_tenant_id_dimension_type_dimension_name_key UNIQUE (tenant_id, dimension_type, dimension_name);


--
-- Name: dimension_hierarchies dimension_hierarchies_dimension_id_node_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_hierarchies
    ADD CONSTRAINT dimension_hierarchies_dimension_id_node_code_key UNIQUE (dimension_id, node_code);


--
-- Name: dimension_hierarchies dimension_hierarchies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_hierarchies
    ADD CONSTRAINT dimension_hierarchies_pkey PRIMARY KEY (id);


--
-- Name: dimensions dimensions_dimension_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimensions
    ADD CONSTRAINT dimensions_dimension_code_key UNIQUE (dimension_code);


--
-- Name: dimensions dimensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimensions
    ADD CONSTRAINT dimensions_pkey PRIMARY KEY (id);


--
-- Name: dsar_requests dsar_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsar_requests
    ADD CONSTRAINT dsar_requests_pkey PRIMARY KEY (id);


--
-- Name: etl_parameters etl_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_parameters
    ADD CONSTRAINT etl_parameters_pkey PRIMARY KEY (id);


--
-- Name: etl_transactions etl_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_transactions
    ADD CONSTRAINT etl_transactions_pkey PRIMARY KEY (id);


--
-- Name: financial_line_items financial_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_line_items
    ADD CONSTRAINT financial_line_items_pkey PRIMARY KEY (id);


--
-- Name: financial_statements financial_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_statements
    ADD CONSTRAINT financial_statements_pkey PRIMARY KEY (id);


--
-- Name: financial_statements financial_statements_tenant_id_statement_type_period_start__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_statements
    ADD CONSTRAINT financial_statements_tenant_id_statement_type_period_start__key UNIQUE (tenant_id, statement_type, period_start, period_end, scenario);


--
-- Name: import_history import_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_history
    ADD CONSTRAINT import_history_pkey PRIMARY KEY (id);


--
-- Name: import_logs import_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_pkey PRIMARY KEY (id);


--
-- Name: import_schedules import_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_schedules
    ADD CONSTRAINT import_schedules_pkey PRIMARY KEY (id);


--
-- Name: import_templates import_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_templates
    ADD CONSTRAINT import_templates_pkey PRIMARY KEY (id);


--
-- Name: imported_transactions imported_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_transactions
    ADD CONSTRAINT imported_transactions_pkey PRIMARY KEY (id);


--
-- Name: mapping_rules mapping_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mapping_rules
    ADD CONSTRAINT mapping_rules_pkey PRIMARY KEY (id);


--
-- Name: object_versions object_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_versions
    ADD CONSTRAINT object_versions_pkey PRIMARY KEY (id);


--
-- Name: ownership_transfer_requests ownership_transfer_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ownership_transfer_requests
    ADD CONSTRAINT ownership_transfer_requests_pkey PRIMARY KEY (id);


--
-- Name: projected_statements projected_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projected_statements
    ADD CONSTRAINT projected_statements_pkey PRIMARY KEY (id);


--
-- Name: projections projections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projections
    ADD CONSTRAINT projections_pkey PRIMARY KEY (id);


--
-- Name: scenario_assumptions scenario_assumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_assumptions
    ADD CONSTRAINT scenario_assumptions_pkey PRIMARY KEY (id);


--
-- Name: scenarios scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_pkey PRIMARY KEY (id);


--
-- Name: scenarios scenarios_tenant_id_scenario_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenarios
    ADD CONSTRAINT scenarios_tenant_id_scenario_name_key UNIQUE (tenant_id, scenario_name);


--
-- Name: statement_templates statement_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statement_templates
    ADD CONSTRAINT statement_templates_pkey PRIMARY KEY (id);


--
-- Name: system_config system_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_config_key_key UNIQUE (config_key);


--
-- Name: system_config system_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_config
    ADD CONSTRAINT system_config_pkey PRIMARY KEY (id);


--
-- Name: tenant_data tenant_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_data
    ADD CONSTRAINT tenant_data_pkey PRIMARY KEY (id);


--
-- Name: tenant_subscriptions tenant_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: version_comparisons version_comparisons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_comparisons
    ADD CONSTRAINT version_comparisons_pkey PRIMARY KEY (id);


--
-- Name: version_policies version_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_policies
    ADD CONSTRAINT version_policies_pkey PRIMARY KEY (id);


--
-- Name: version_policies version_policies_tenant_id_entity_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_policies
    ADD CONSTRAINT version_policies_tenant_id_entity_type_key UNIQUE (tenant_id, entity_type);


--
-- Name: idx_actions_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_approver ON public.approval_actions USING btree (approver_email);


--
-- Name: idx_actions_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_actions_request ON public.approval_actions USING btree (request_id);


--
-- Name: idx_assumptions_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assumptions_scenario ON public.scenario_assumptions USING btree (scenario_id);


--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_log_performed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_performed ON public.audit_log USING btree (performed_at DESC);


--
-- Name: idx_audit_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_tenant ON public.audit_log USING btree (tenant_id);


--
-- Name: idx_audit_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_resource ON public.audit_logs USING btree (resource_type, resource_id);


--
-- Name: idx_audit_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_timestamp ON public.audit_logs USING btree ("timestamp");


--
-- Name: idx_audit_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_user ON public.audit_logs USING btree (user_email);


--
-- Name: idx_chains_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chains_tenant ON public.approval_chains USING btree (tenant_id);


--
-- Name: idx_chains_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chains_type ON public.approval_chains USING btree (document_type);


--
-- Name: idx_company_profile_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_profile_tenant ON public.company_profile USING btree (tenant_id);


--
-- Name: idx_dimension_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dimension_tenant ON public.dimension_config USING btree (tenant_id);


--
-- Name: idx_dimensions_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dimensions_code ON public.dimensions USING btree (dimension_code);


--
-- Name: idx_dimensions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dimensions_tenant ON public.dimensions USING btree (tenant_id);


--
-- Name: idx_etl_params_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_etl_params_currency ON public.etl_parameters USING btree (currency_pair);


--
-- Name: idx_etl_params_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_etl_params_date ON public.etl_parameters USING btree (effective_date);


--
-- Name: idx_etl_params_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_etl_params_type ON public.etl_parameters USING btree (parameter_type);


--
-- Name: idx_financial_line_items_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_line_items_code ON public.financial_line_items USING btree (line_code);


--
-- Name: idx_financial_line_items_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_line_items_parent ON public.financial_line_items USING btree (parent_code);


--
-- Name: idx_financial_line_items_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_line_items_statement ON public.financial_line_items USING btree (statement_id);


--
-- Name: idx_financial_line_items_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_financial_line_items_unique ON public.financial_line_items USING btree (statement_id, line_code);


--
-- Name: idx_financial_statements_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_financial_statements_unique ON public.financial_statements USING btree (tenant_id, statement_type, period_start, period_end, scenario);


--
-- Name: idx_hierarchies_dimension; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hierarchies_dimension ON public.dimension_hierarchies USING btree (dimension_id);


--
-- Name: idx_hierarchies_node; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hierarchies_node ON public.dimension_hierarchies USING btree (node_code);


--
-- Name: idx_hierarchies_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hierarchies_parent ON public.dimension_hierarchies USING btree (parent_code);


--
-- Name: idx_import_history_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_history_status ON public.import_history USING btree (status);


--
-- Name: idx_import_history_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_history_tenant ON public.import_history USING btree (tenant_id);


--
-- Name: idx_invitations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_tenant ON public.user_invitations USING btree (tenant_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.billing_invoices USING btree (status);


--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tenant ON public.billing_invoices USING btree (tenant_id);


--
-- Name: idx_line_items_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_code ON public.financial_line_items USING btree (line_code);


--
-- Name: idx_line_items_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_statement ON public.financial_line_items USING btree (statement_id);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.approval_notifications USING btree (recipient_email, is_read);


--
-- Name: idx_notifications_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_request ON public.approval_notifications USING btree (request_id);


--
-- Name: idx_ownership_transfer_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_tenant ON public.ownership_transfer_requests USING btree (tenant_id);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant ON public.billing_payments USING btree (tenant_id);


--
-- Name: idx_projected_statements_projection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projected_statements_projection ON public.projected_statements USING btree (projection_id);


--
-- Name: idx_projections_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_scenario ON public.projections USING btree (scenario_id);


--
-- Name: idx_projections_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_tenant ON public.projections USING btree (tenant_id);


--
-- Name: idx_requests_chain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_chain ON public.approval_requests USING btree (chain_id);


--
-- Name: idx_requests_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_document ON public.approval_requests USING btree (document_type, document_id);


--
-- Name: idx_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_requests_status ON public.approval_requests USING btree (status);


--
-- Name: idx_scenarios_tenant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scenarios_tenant_type ON public.scenarios USING btree (tenant_id, scenario_type);


--
-- Name: idx_subscriptions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_tenant ON public.tenant_subscriptions USING btree (tenant_id);


--
-- Name: idx_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_tenant ON public.statement_templates USING btree (tenant_id);


--
-- Name: idx_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_type ON public.statement_templates USING btree (statement_type);


--
-- Name: idx_transactions_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_account ON public.transactions USING btree (account_code);


--
-- Name: idx_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_date ON public.transactions USING btree (transaction_date);


--
-- Name: idx_transactions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_tenant ON public.transactions USING btree (tenant_id);


--
-- Name: idx_usage_tenant_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_tenant_period ON public.billing_usage USING btree (tenant_id, period_year, period_month);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: approval_actions approval_actions_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions
    ADD CONSTRAINT approval_actions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_notifications approval_notifications_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_notifications
    ADD CONSTRAINT approval_notifications_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_requests approval_requests_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id) ON DELETE RESTRICT;


--
-- Name: billing_invoice_items billing_invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_invoice_items
    ADD CONSTRAINT billing_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON DELETE CASCADE;


--
-- Name: billing_payments billing_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_payments
    ADD CONSTRAINT billing_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.billing_invoices(id) ON DELETE SET NULL;


--
-- Name: budget_allocations budget_allocations_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_allocations
    ADD CONSTRAINT budget_allocations_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: budget_line_items budget_line_items_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT budget_line_items_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: budget_line_items budget_line_items_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT budget_line_items_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.budget_versions(id) ON DELETE CASCADE;


--
-- Name: budget_versions budget_versions_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_versions
    ADD CONSTRAINT budget_versions_budget_id_fkey FOREIGN KEY (budget_id) REFERENCES public.budgets(id) ON DELETE CASCADE;


--
-- Name: cash_flow_line_items cash_flow_line_items_forecast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_line_items
    ADD CONSTRAINT cash_flow_line_items_forecast_id_fkey FOREIGN KEY (forecast_id) REFERENCES public.cash_flow_forecasts(id) ON DELETE CASCADE;


--
-- Name: dimension_config dimension_config_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_config
    ADD CONSTRAINT dimension_config_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.dimension_config(id) ON DELETE CASCADE;


--
-- Name: dimension_hierarchies dimension_hierarchies_dimension_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dimension_hierarchies
    ADD CONSTRAINT dimension_hierarchies_dimension_id_fkey FOREIGN KEY (dimension_id) REFERENCES public.dimensions(id) ON DELETE CASCADE;


--
-- Name: financial_line_items financial_line_items_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_line_items
    ADD CONSTRAINT financial_line_items_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.financial_statements(id) ON DELETE CASCADE;


--
-- Name: scenario_assumptions scenario_assumptions_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_assumptions
    ADD CONSTRAINT scenario_assumptions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: version_comparisons version_comparisons_version_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_comparisons
    ADD CONSTRAINT version_comparisons_version_a_fkey FOREIGN KEY (version_a) REFERENCES public.object_versions(id);


--
-- Name: version_comparisons version_comparisons_version_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_comparisons
    ADD CONSTRAINT version_comparisons_version_b_fkey FOREIGN KEY (version_b) REFERENCES public.object_versions(id);


--
-- PostgreSQL database dump complete
--

\unrestrict SskoQnvkRgj1AzsOTd9vO5yg9RPIIqEBDqZpPHlfBLUY4gYqZ1oXHjT65RMakr0

