--
-- PostgreSQL database dump
--

\restrict dYf9KqnXRxXhDBIXERvKAtc63PH5XeqhepV03o3B3Z56A6EkpVDY30wwURxuCsB

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
    step_number integer NOT NULL,
    action character varying(20) NOT NULL,
    comment text,
    performed_by character varying(255),
    performed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT approval_actions_action_check CHECK (((action)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying, 'comment'::character varying])::text[])))
);


--
-- Name: approval_chains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_chains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    chain_name character varying(255) NOT NULL,
    entity_type character varying(50) NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: approval_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    request_id uuid,
    user_email character varying(255),
    notification_type character varying(50),
    message text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    chain_id uuid,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    current_step integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    requested_by character varying(255),
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
    tenant_id character varying(255),
    action character varying(50),
    entity_type character varying(50),
    entity_id character varying(255),
    user_email character varying(255),
    details jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    config_key character varying(255) NOT NULL,
    config_value jsonb,
    description text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
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
    base_statement_id character varying(100),
    scenario_id character varying(100),
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

COPY public.approval_actions (id, request_id, step_number, action, comment, performed_by, performed_at) FROM stdin;
\.


--
-- Data for Name: approval_chains; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_chains (id, tenant_id, chain_name, entity_type, steps, is_active, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: approval_notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_notifications (id, tenant_id, request_id, user_email, notification_type, message, is_read, created_at) FROM stdin;
\.


--
-- Data for Name: approval_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.approval_requests (id, tenant_id, chain_id, entity_type, entity_id, current_step, status, requested_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_log (id, tenant_id, entity_type, entity_id, action, changes, performed_by, performed_at, ip_address) FROM stdin;
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, tenant_id, action, entity_type, entity_id, user_email, details, created_at) FROM stdin;
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
\.


--
-- Data for Name: coa_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coa_templates (id, template_name, industry, description, accounts, is_active, created_at, updated_at) FROM stdin;
eec8630a-814a-4ed3-8430-aa438a391b95	General Business	General	Standard chart of accounts for general businesses	[{"level": 1, "account_code": "1000", "account_name": "Cash and Cash Equivalents", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1100", "account_name": "Accounts Receivable", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1200", "account_name": "Inventory", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1500", "account_name": "Fixed Assets", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "2000", "account_name": "Accounts Payable", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2100", "account_name": "Accrued Expenses", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2500", "account_name": "Long-term Debt", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "3000", "account_name": "Common Stock", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "3100", "account_name": "Retained Earnings", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "4000", "account_name": "Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "4100", "account_name": "Service Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "5000", "account_name": "Cost of Goods Sold", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6000", "account_name": "Salaries Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6100", "account_name": "Rent Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6200", "account_name": "Utilities Expense", "account_type": "expense", "normal_balance": "debit"}]	t	2026-02-21 13:21:15.763672+00	2026-02-21 13:21:15.763672+00
f2fe0fd0-77fa-410f-a500-aa0d0ab0f095	General Business	General	Standard chart of accounts for general businesses	[{"level": 1, "account_code": "1000", "account_name": "Cash and Cash Equivalents", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1100", "account_name": "Accounts Receivable", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1200", "account_name": "Inventory", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "1500", "account_name": "Fixed Assets", "account_type": "asset", "normal_balance": "debit"}, {"level": 1, "account_code": "2000", "account_name": "Accounts Payable", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2100", "account_name": "Accrued Expenses", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "2500", "account_name": "Long-term Debt", "account_type": "liability", "normal_balance": "credit"}, {"level": 1, "account_code": "3000", "account_name": "Common Stock", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "3100", "account_name": "Retained Earnings", "account_type": "equity", "normal_balance": "credit"}, {"level": 1, "account_code": "4000", "account_name": "Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "4100", "account_name": "Service Revenue", "account_type": "revenue", "normal_balance": "credit"}, {"level": 1, "account_code": "5000", "account_name": "Cost of Goods Sold", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6000", "account_name": "Salaries Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6100", "account_name": "Rent Expense", "account_type": "expense", "normal_balance": "debit"}, {"level": 1, "account_code": "6200", "account_name": "Utilities Expense", "account_type": "expense", "normal_balance": "debit"}]	t	2026-02-21 13:26:05.951868+00	2026-02-21 13:26:05.951868+00
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

COPY public.etl_parameters (id, tenant_id, config_key, config_value, description, created_at, updated_at) FROM stdin;
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
\.


--
-- Data for Name: financial_statements; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.financial_statements (id, tenant_id, statement_type, period_type, period_start, period_end, scenario, status, created_at, updated_at, created_by) FROM stdin;
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
0636f368-5430-4d21-a167-f2ef9e05e9ec	155cf73a2fe388f0	admin@acmecorp.local	Acme Admin	admin	t	2026-02-21 14:22:16.214504+00	2026-02-21 14:22:16.214504+00
bd08b2bf-c941-497b-966e-f6742d33f3b0	155cf73a2fe388f0	analyst@acmecorp.local	Acme Analyst	analyst	t	2026-02-21 14:22:16.214504+00	2026-02-21 14:22:16.214504+00
95b43eba-7caf-413f-85df-b32d1847733e	155cf73a2fe388f0	viewer@acmecorp.local	Acme Viewer	viewer	t	2026-02-21 14:22:16.214504+00	2026-02-21 14:22:16.214504+00
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
-- Name: etl_parameters etl_parameters_tenant_id_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_parameters
    ADD CONSTRAINT etl_parameters_tenant_id_config_key_key UNIQUE (tenant_id, config_key);


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
-- Name: idx_assumptions_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assumptions_scenario ON public.scenario_assumptions USING btree (scenario_id);


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
-- Name: idx_line_items_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_code ON public.financial_line_items USING btree (line_code);


--
-- Name: idx_line_items_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_statement ON public.financial_line_items USING btree (statement_id);


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
-- Name: idx_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_tenant ON public.statement_templates USING btree (tenant_id);


--
-- Name: idx_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_type ON public.statement_templates USING btree (statement_type);


--
-- Name: approval_actions approval_actions_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_actions
    ADD CONSTRAINT approval_actions_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;


--
-- Name: approval_notifications approval_notifications_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_notifications
    ADD CONSTRAINT approval_notifications_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.approval_requests(id);


--
-- Name: approval_requests approval_requests_chain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES public.approval_chains(id);


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

\unrestrict dYf9KqnXRxXhDBIXERvKAtc63PH5XeqhepV03o3B3Z56A6EkpVDY30wwURxuCsB

