--
-- PostgreSQL database dump
--

\restrict gkpv0WRorACnvtb0aByqAE4dbhHQ6ulJpahaSnAKjb6hblaLKa3sGXRsWQvK0ao

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
-- Name: dsr_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dsr_request_status AS ENUM (
    'pending',
    'approved',
    'processing',
    'completed',
    'rejected',
    'expired'
);


--
-- Name: dsr_request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.dsr_request_type AS ENUM (
    'access',
    'delete',
    'portability',
    'rectify',
    'restrict'
);


--
-- Name: calculate_forecast_cash_positions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_forecast_cash_positions(forecast_uuid uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_week RECORD;
    running_cash DECIMAL(15,2);
    forecast_beginning_cash DECIMAL(15,2);
BEGIN
    -- Get beginning cash from forecast header
    SELECT beginning_cash INTO forecast_beginning_cash
    FROM cash_flow_forecasts
    WHERE id = forecast_uuid;
    
    -- Initialize running cash
    running_cash := forecast_beginning_cash;
    
    -- Update each week in order
    FOR current_week IN 
        SELECT id, net_change_in_cash
        FROM cash_flow_line_items
        WHERE forecast_id = forecast_uuid
        ORDER BY week_number
    LOOP
        -- Update beginning and ending cash for this week
        UPDATE cash_flow_line_items
        SET 
            beginning_cash = running_cash,
            ending_cash = running_cash + net_change_in_cash,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = current_week.id;
        
        -- Update running cash for next iteration
        running_cash := running_cash + current_week.net_change_in_cash;
    END LOOP;
END;
$$;


--
-- Name: FUNCTION calculate_forecast_cash_positions(forecast_uuid uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calculate_forecast_cash_positions(forecast_uuid uuid) IS 'Recalculates ending cash positions for all weeks in a forecast';


--
-- Name: create_version_snapshot(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_version_snapshot() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_tenant_id VARCHAR(255);
    v_change_type VARCHAR(50);
    v_next_version INTEGER;
    v_policy_enabled BOOLEAN;
    v_auto_snapshot BOOLEAN;
BEGIN
    -- Determine tenant_id (adjust column name based on actual table)
    IF TG_OP = 'DELETE' THEN
        v_tenant_id := OLD.tenant_id;
    ELSE
        v_tenant_id := NEW.tenant_id;
    END IF;
    
    -- Check if versioning is enabled for this object type
    SELECT is_enabled, 
           CASE TG_OP 
               WHEN 'INSERT' THEN auto_snapshot_on_create
               WHEN 'UPDATE' THEN auto_snapshot_on_update
               WHEN 'DELETE' THEN auto_snapshot_on_delete
           END
    INTO v_policy_enabled, v_auto_snapshot
    FROM version_policies
    WHERE tenant_id = v_tenant_id 
      AND object_type = TG_ARGV[0];
    
    -- Skip if policy not found or disabled
    IF NOT FOUND OR NOT v_policy_enabled OR NOT v_auto_snapshot THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Determine change type
    v_change_type := CASE TG_OP
        WHEN 'INSERT' THEN 'create'
        WHEN 'UPDATE' THEN 'update'
        WHEN 'DELETE' THEN 'delete'
    END;
    
    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM object_versions
    WHERE tenant_id = v_tenant_id
      AND object_type = TG_ARGV[0]
      AND object_id = COALESCE(NEW.id, OLD.id);
    
    -- Insert version snapshot
    INSERT INTO object_versions (
        tenant_id,
        object_type,
        object_id,
        version_number,
        snapshot_data,
        change_type,
        created_by
    ) VALUES (
        v_tenant_id,
        TG_ARGV[0],
        COALESCE(NEW.id, OLD.id),
        v_next_version,
        CASE 
            WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
            ELSE to_jsonb(NEW)
        END,
        v_change_type,
        COALESCE(
            CASE 
                WHEN TG_OP = 'DELETE' THEN OLD.created_by
                ELSE NEW.created_by
            END,
            'system'
        )
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: trigger_recalculate_cash_positions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_recalculate_cash_positions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM calculate_forecast_cash_positions(NEW.forecast_id);
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: anonymization_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anonymization_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dsr_request_id uuid NOT NULL,
    tenant_id character varying(255) NOT NULL,
    table_name character varying(100) NOT NULL,
    record_id character varying(255) NOT NULL,
    original_data jsonb,
    anonymized_at timestamp without time zone DEFAULT now(),
    anonymized_by character varying(255),
    is_reversed boolean DEFAULT false,
    reversed_at timestamp without time zone,
    reversed_by character varying(255),
    reversed_reason text
);


--
-- Name: TABLE anonymization_records; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.anonymization_records IS 'Track anonymized records for compliance';


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
-- Name: budget_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    department character varying(100) NOT NULL,
    category character varying(100),
    allocated_amount numeric(18,2) DEFAULT 0 NOT NULL,
    utilized_amount numeric(18,2) DEFAULT 0,
    variance numeric(18,2) GENERATED ALWAYS AS ((allocated_amount - utilized_amount)) STORED,
    variance_percentage numeric(5,2),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    account_code character varying(50) NOT NULL,
    department character varying(100),
    cost_center character varying(100),
    january numeric(18,2) DEFAULT 0,
    february numeric(18,2) DEFAULT 0,
    march numeric(18,2) DEFAULT 0,
    april numeric(18,2) DEFAULT 0,
    may numeric(18,2) DEFAULT 0,
    june numeric(18,2) DEFAULT 0,
    july numeric(18,2) DEFAULT 0,
    august numeric(18,2) DEFAULT 0,
    september numeric(18,2) DEFAULT 0,
    october numeric(18,2) DEFAULT 0,
    november numeric(18,2) DEFAULT 0,
    december numeric(18,2) DEFAULT 0,
    annual_total numeric(18,2) GENERATED ALWAYS AS ((((((((((((january + february) + march) + april) + may) + june) + july) + august) + september) + october) + november) + december)) STORED,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    template_name character varying(255) NOT NULL,
    description text,
    source_budget_id uuid,
    template_data jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budget_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budget_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_id uuid NOT NULL,
    version_number integer NOT NULL,
    version_name character varying(255),
    snapshot jsonb NOT NULL,
    created_by character varying(255),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    budget_name character varying(255) NOT NULL,
    fiscal_year integer NOT NULL,
    budget_type character varying(50) NOT NULL,
    status character varying(50) DEFAULT 'draft'::character varying NOT NULL,
    description text,
    created_by character varying(255),
    approved_by character varying(255),
    approved_at timestamp without time zone,
    locked_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT budgets_budget_type_check CHECK (((budget_type)::text = ANY ((ARRAY['annual'::character varying, 'revised'::character varying, 'supplemental'::character varying])::text[]))),
    CONSTRAINT budgets_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'approved'::character varying, 'rejected'::character varying, 'locked'::character varying])::text[])))
);


--
-- Name: cash_flow_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    category_code character varying(50) NOT NULL,
    category_name character varying(255) NOT NULL,
    category_type character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cash_flow_categories_category_type_check CHECK (((category_type)::text = ANY ((ARRAY['operating_inflow'::character varying, 'operating_outflow'::character varying, 'investing_inflow'::character varying, 'investing_outflow'::character varying, 'financing_inflow'::character varying, 'financing_outflow'::character varying])::text[])))
);


--
-- Name: TABLE cash_flow_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_flow_categories IS 'Cash flow categories for detailed breakdown';


--
-- Name: cash_flow_forecasts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_forecasts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    forecast_name character varying(255) NOT NULL,
    start_date date NOT NULL,
    weeks integer DEFAULT 13 NOT NULL,
    beginning_cash numeric(15,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying,
    notes text,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cash_flow_forecasts_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT cash_flow_forecasts_weeks_check CHECK (((weeks > 0) AND (weeks <= 52)))
);


--
-- Name: TABLE cash_flow_forecasts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_flow_forecasts IS '13-week rolling cash flow forecast headers';


--
-- Name: cash_flow_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flow_line_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    forecast_id uuid NOT NULL,
    week_number integer NOT NULL,
    week_start_date date NOT NULL,
    week_end_date date NOT NULL,
    operating_cash_inflow numeric(15,2) DEFAULT 0,
    operating_cash_outflow numeric(15,2) DEFAULT 0,
    investing_cash_inflow numeric(15,2) DEFAULT 0,
    investing_cash_outflow numeric(15,2) DEFAULT 0,
    financing_cash_inflow numeric(15,2) DEFAULT 0,
    financing_cash_outflow numeric(15,2) DEFAULT 0,
    net_operating_cash numeric(15,2) GENERATED ALWAYS AS ((operating_cash_inflow - operating_cash_outflow)) STORED,
    net_investing_cash numeric(15,2) GENERATED ALWAYS AS ((investing_cash_inflow - investing_cash_outflow)) STORED,
    net_financing_cash numeric(15,2) GENERATED ALWAYS AS ((financing_cash_inflow - financing_cash_outflow)) STORED,
    net_change_in_cash numeric(15,2) GENERATED ALWAYS AS ((((operating_cash_inflow - operating_cash_outflow) + (investing_cash_inflow - investing_cash_outflow)) + (financing_cash_inflow - financing_cash_outflow))) STORED,
    beginning_cash numeric(15,2) DEFAULT 0,
    ending_cash numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cash_flow_line_items_week_number_check CHECK ((week_number >= 1))
);


--
-- Name: TABLE cash_flow_line_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_flow_line_items IS 'Weekly cash flow line items with operating, investing, and financing activities';


--
-- Name: chart_of_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chart_of_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    account_code character varying(50) NOT NULL,
    account_name character varying(255) NOT NULL,
    account_type character varying(50) NOT NULL,
    parent_account_code character varying(50),
    is_active boolean DEFAULT true,
    normal_balance character varying(10),
    description text,
    level integer DEFAULT 1,
    sort_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chart_of_accounts_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['asset'::character varying, 'liability'::character varying, 'equity'::character varying, 'revenue'::character varying, 'expense'::character varying])::text[]))),
    CONSTRAINT chart_of_accounts_normal_balance_check CHECK (((normal_balance)::text = ANY ((ARRAY['debit'::character varying, 'credit'::character varying])::text[])))
);


--
-- Name: TABLE chart_of_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.chart_of_accounts IS 'Chart of accounts with hierarchical structure for each tenant';


--
-- Name: coa_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coa_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name character varying(100) NOT NULL,
    industry character varying(50) NOT NULL,
    description text,
    accounts jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT coa_templates_industry_check CHECK (((industry)::text = ANY ((ARRAY['retail'::character varying, 'saas'::character varying, 'manufacturing'::character varying, 'services'::character varying, 'general'::character varying])::text[])))
);


--
-- Name: TABLE coa_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.coa_templates IS 'Pre-built COA templates by industry for quick setup';


--
-- Name: company_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    company_name character varying(255) NOT NULL,
    tax_id character varying(100),
    industry character varying(100),
    fiscal_year_end character varying(5),
    default_currency character varying(3) DEFAULT 'THB'::character varying,
    address text,
    phone character varying(50),
    website character varying(255),
    logo_url character varying(500),
    settings jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: cookie_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cookie_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying(255) NOT NULL,
    essential boolean DEFAULT true NOT NULL,
    analytics boolean DEFAULT false NOT NULL,
    marketing boolean DEFAULT false NOT NULL,
    consented_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: data_retention_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_retention_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    data_type character varying(100) NOT NULL,
    retention_days integer NOT NULL,
    legal_basis text,
    auto_delete_enabled boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE data_retention_policies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.data_retention_policies IS 'Data retention policies per tenant';


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
    user_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    request_type character varying(50) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp without time zone DEFAULT now() NOT NULL,
    processed_at timestamp without time zone,
    processed_by character varying(255),
    exported_at timestamp without time zone,
    admin_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT dsar_requests_request_type_check CHECK (((request_type)::text = ANY ((ARRAY['access'::character varying, 'export'::character varying, 'delete'::character varying, 'rectify'::character varying])::text[]))),
    CONSTRAINT dsar_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'rejected'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: dsr_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsr_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dsr_request_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    actor_email character varying(255),
    actor_role character varying(50),
    old_status public.dsr_request_status,
    new_status public.dsr_request_status,
    notes text,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE dsr_audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dsr_audit_log IS 'Audit trail for all DSR request actions';


--
-- Name: dsr_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsr_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    request_type public.dsr_request_type NOT NULL,
    status public.dsr_request_status DEFAULT 'pending'::public.dsr_request_status NOT NULL,
    requester_email character varying(255) NOT NULL,
    requester_user_id character varying(255),
    requester_name character varying(255),
    request_reason text,
    request_scope jsonb,
    response_data jsonb,
    response_file_url text,
    rejection_reason text,
    approved_by character varying(255),
    approved_at timestamp without time zone,
    processed_by character varying(255),
    processed_at timestamp without time zone,
    due_date timestamp without time zone NOT NULL,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    is_anonymized boolean DEFAULT false,
    anonymized_at timestamp without time zone
);


--
-- Name: TABLE dsr_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dsr_requests IS 'Data Subject Requests for PDPA/GDPR compliance';


--
-- Name: COLUMN dsr_requests.request_scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dsr_requests.request_scope IS 'JSON specifying what data is requested';


--
-- Name: COLUMN dsr_requests.response_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dsr_requests.response_data IS 'Exported data for access/portability requests';


--
-- Name: COLUMN dsr_requests.due_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.dsr_requests.due_date IS 'GDPR Art. 12: Response within 30 days';


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
    CONSTRAINT financial_statements_scenario_check CHECK (((scenario)::text = ANY ((ARRAY['actual'::character varying, 'best'::character varying, 'base'::character varying, 'worst'::character varying, 'custom'::character varying])::text[]))),
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
    tenant_id character varying(100) NOT NULL,
    schedule_id uuid,
    template_id uuid,
    import_type character varying(50) NOT NULL,
    file_name character varying(500),
    file_size integer,
    mime_type character varying(100),
    status character varying(50) DEFAULT 'processing'::character varying NOT NULL,
    total_rows integer DEFAULT 0,
    valid_rows integer DEFAULT 0,
    invalid_rows integer DEFAULT 0,
    imported_rows integer DEFAULT 0,
    validation_errors jsonb,
    processing_time_ms integer,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp without time zone,
    imported_by character varying(255),
    metadata jsonb
);


--
-- Name: import_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    schedule_name character varying(255) NOT NULL,
    template_id uuid,
    source_type character varying(100) NOT NULL,
    source_config jsonb,
    schedule_type character varying(50) NOT NULL,
    schedule_config jsonb,
    auto_approve boolean DEFAULT false,
    notification_emails text[],
    last_run_at timestamp without time zone,
    next_run_at timestamp without time zone,
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: import_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_name character varying(255) NOT NULL,
    template_type character varying(100) NOT NULL,
    description text,
    file_format character varying(50) DEFAULT 'csv'::character varying NOT NULL,
    column_mappings jsonb NOT NULL,
    validation_rules jsonb,
    transformation_rules jsonb,
    sample_data jsonb,
    is_active boolean DEFAULT true,
    is_system boolean DEFAULT false,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: imported_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imported_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    import_log_id uuid,
    transaction_date date NOT NULL,
    description text,
    amount numeric(18,2) NOT NULL,
    account_code character varying(50),
    department character varying(100),
    cost_center character varying(100),
    project_code character varying(100),
    transaction_type character varying(50),
    category character varying(100),
    subcategory character varying(100),
    document_number character varying(100),
    reference_number character varying(100),
    vendor_customer character varying(255),
    custom_fields jsonb,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    validation_status character varying(50),
    validation_messages text[],
    financial_statement_id uuid,
    posted_at timestamp without time zone,
    posted_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: mapping_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mapping_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(100) NOT NULL,
    rule_name character varying(255) NOT NULL,
    rule_type character varying(100) NOT NULL,
    match_conditions jsonb NOT NULL,
    mapping_result jsonb NOT NULL,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    last_used_at timestamp without time zone,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: object_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.object_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    object_type character varying(100) NOT NULL,
    object_id uuid NOT NULL,
    version_number integer NOT NULL,
    version_label character varying(255),
    snapshot_data jsonb NOT NULL,
    change_type character varying(50) NOT NULL,
    change_summary text,
    changed_fields jsonb,
    created_by character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    ip_address character varying(45),
    user_agent text
);


--
-- Name: TABLE object_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.object_versions IS 'Stores historical snapshots of financial objects for version control and audit trail';


--
-- Name: ownership_transfer_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ownership_transfer_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    current_owner_email character varying(255) NOT NULL,
    new_owner_email character varying(255) NOT NULL,
    reason text,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    requested_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    responded_at timestamp without time zone,
    response_reason text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ownership_transfer_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'rejected'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: TABLE ownership_transfer_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ownership_transfer_requests IS 'Stores ownership transfer requests between users';


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
    tenant_id character varying(255) NOT NULL,
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
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_name character varying(100) NOT NULL,
    price_monthly numeric(10,2) NOT NULL,
    max_users integer,
    max_statements integer,
    max_storage_mb integer,
    features jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE subscription_plans; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscription_plans IS 'Available subscription plans for tenants';


--
-- Name: system_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255),
    config_key character varying(255) NOT NULL,
    config_value jsonb NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: system_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_login_at timestamp with time zone,
    CONSTRAINT system_users_role_check CHECK (((role)::text = ANY ((ARRAY['super_admin'::character varying, 'system_user'::character varying])::text[])))
);


--
-- Name: TABLE system_users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_users IS 'Central registry of all users across all tenants, including super admins';


--
-- Name: tenant_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    tenant_name character varying(255) NOT NULL,
    requested_by character varying(255) NOT NULL,
    request_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(50) DEFAULT 'pending'::character varying,
    approved_by character varying(255),
    approval_date timestamp with time zone,
    rejection_reason text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenant_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
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
    plan_id uuid,
    status character varying(50) NOT NULL,
    trial_end_date date,
    billing_cycle character varying(20),
    next_billing_date date,
    stripe_customer_id character varying(255),
    stripe_subscription_id character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tenant_subscriptions_billing_cycle_check CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'annual'::character varying])::text[]))),
    CONSTRAINT tenant_subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'suspended'::character varying, 'canceled'::character varying])::text[])))
);


--
-- Name: TABLE tenant_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_subscriptions IS 'Current subscription status for each tenant';


--
-- Name: tenant_usage_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_usage_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    metric_date date NOT NULL,
    active_users integer DEFAULT 0,
    api_requests integer DEFAULT 0,
    storage_mb integer DEFAULT 0,
    statements_count integer DEFAULT 0,
    scenarios_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE tenant_usage_metrics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_usage_metrics IS 'Daily usage metrics per tenant for billing and analytics';


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id text NOT NULL,
    name text NOT NULL,
    db_name text NOT NULL,
    db_user text NOT NULL,
    encrypted_password text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    invited_by character varying(255) NOT NULL,
    invitation_token character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    accepted_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_invitations_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'accepted'::character varying, 'expired'::character varying])::text[])))
);


--
-- Name: user_tenant_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tenant_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    tenant_id character varying(255) NOT NULL,
    tenant_role character varying(50) NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_tenant_memberships_tenant_role_check CHECK (((tenant_role)::text = ANY ((ARRAY['admin'::character varying, 'analyst'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: TABLE user_tenant_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_tenant_memberships IS 'Maps users to tenants with their respective roles in each tenant';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(50),
    bio text,
    role character varying(50) DEFAULT 'admin'::character varying NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'analyst'::character varying, 'viewer'::character varying])::text[])))
);


--
-- Name: version_comparisons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_comparisons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    object_type character varying(100) NOT NULL,
    object_id uuid NOT NULL,
    version_from integer NOT NULL,
    version_to integer NOT NULL,
    comparison_result jsonb NOT NULL,
    created_by character varying(255) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    notes text
);


--
-- Name: TABLE version_comparisons; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.version_comparisons IS 'Stores saved comparison results between versions';


--
-- Name: version_history_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.version_history_view AS
 SELECT v.id,
    v.tenant_id,
    v.object_type,
    v.object_id,
    v.version_number,
    v.version_label,
    v.change_type,
    v.change_summary,
    v.created_by,
    v.created_at,
        CASE v.object_type
            WHEN 'coa_entry'::text THEN (v.snapshot_data ->> 'account_code'::text)
            WHEN 'budget'::text THEN (v.snapshot_data ->> 'budget_name'::text)
            WHEN 'budget_line'::text THEN (v.snapshot_data ->> 'line_code'::text)
            WHEN 'statement'::text THEN (v.snapshot_data ->> 'statement_name'::text)
            WHEN 'scenario'::text THEN (v.snapshot_data ->> 'name'::text)
            ELSE NULL::text
        END AS object_identifier,
    (EXTRACT(day FROM (now() - (v.created_at)::timestamp with time zone)))::integer AS days_ago
   FROM public.object_versions v
  ORDER BY v.created_at DESC;


--
-- Name: VIEW version_history_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.version_history_view IS 'Human-readable view of version history with extracted key identifiers';


--
-- Name: version_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.version_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    object_type character varying(100) NOT NULL,
    is_enabled boolean DEFAULT true,
    auto_snapshot_on_create boolean DEFAULT true,
    auto_snapshot_on_update boolean DEFAULT true,
    auto_snapshot_on_delete boolean DEFAULT true,
    max_versions_per_object integer DEFAULT 50,
    retention_days integer,
    auto_snapshot_frequency character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: TABLE version_policies; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.version_policies IS 'Defines versioning policies and retention rules per object type';


--
-- Name: tenant_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_data ALTER COLUMN id SET DEFAULT nextval('public.tenant_data_id_seq'::regclass);


--
-- Data for Name: anonymization_records; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.anonymization_records (id, dsr_request_id, tenant_id, table_name, record_id, original_data, anonymized_at, anonymized_by, is_reversed, reversed_at, reversed_by, reversed_reason) FROM stdin;
\.


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
-- Data for Name: budget_allocations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_allocations (id, budget_id, department, category, allocated_amount, utilized_amount, variance_percentage, notes, created_at, updated_at) FROM stdin;
926d8c63-0ce6-4c9d-8435-9d33841bf705	9bb4e32b-ec9d-4751-aa76-150c2523680e	Sales	revenue	11350000.00	0.00	\N	\N	2026-02-21 13:14:19.611222	2026-02-21 13:14:19.611222
472df94a-6a46-4df4-8317-6f4d2a17de43	9bb4e32b-ec9d-4751-aa76-150c2523680e	Services	revenue	3200000.00	0.00	\N	\N	2026-02-21 13:14:19.611825	2026-02-21 13:14:19.611825
7cb93d49-7074-49e3-be44-cc8225154b3e	9bb4e32b-ec9d-4751-aa76-150c2523680e	Sales	opex	6735000.00	0.00	\N	\N	2026-02-21 13:14:19.612242	2026-02-21 13:14:19.612242
d98d043b-39c8-4318-99ba-782481c6a91f	9bb4e32b-ec9d-4751-aa76-150c2523680e	Operations	opex	2010000.00	0.00	\N	\N	2026-02-21 13:14:19.612711	2026-02-21 13:14:19.612711
6ddeb2f7-59f6-4135-aa74-4fd59a13d56f	9bb4e32b-ec9d-4751-aa76-150c2523680e	Admin	opex	646000.00	0.00	\N	\N	2026-02-21 13:14:19.613144	2026-02-21 13:14:19.613144
\.


--
-- Data for Name: budget_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_line_items (id, budget_id, account_code, department, cost_center, january, february, march, april, may, june, july, august, september, october, november, december, notes, created_at, updated_at) FROM stdin;
9e091102-a56a-432d-8564-b0d0b338a454	9bb4e32b-ec9d-4751-aa76-150c2523680e	4100	Sales	\N	800000.00	850000.00	900000.00	900000.00	950000.00	1000000.00	1000000.00	980000.00	950000.00	920000.00	900000.00	1200000.00	\N	2026-02-21 13:14:19.606088	2026-02-21 13:14:19.606088
f7e71f3e-8230-4d3c-8db3-2d422eeb2953	9bb4e32b-ec9d-4751-aa76-150c2523680e	4200	Services	\N	200000.00	220000.00	240000.00	250000.00	260000.00	280000.00	300000.00	290000.00	280000.00	270000.00	260000.00	350000.00	\N	2026-02-21 13:14:19.607068	2026-02-21 13:14:19.607068
99d8c6dd-3550-4489-a000-64faf6cc6000	9bb4e32b-ec9d-4751-aa76-150c2523680e	5100	Sales	\N	400000.00	420000.00	450000.00	450000.00	470000.00	500000.00	500000.00	490000.00	475000.00	460000.00	450000.00	600000.00	\N	2026-02-21 13:14:19.607792	2026-02-21 13:14:19.607792
0342fd66-c0d1-4df2-8646-236da99bf3e8	9bb4e32b-ec9d-4751-aa76-150c2523680e	6000	Operations	\N	150000.00	150000.00	160000.00	160000.00	170000.00	170000.00	180000.00	180000.00	175000.00	170000.00	165000.00	180000.00	\N	2026-02-21 13:14:19.608728	2026-02-21 13:14:19.608728
072ee974-915d-4534-9ada-b253a1c187d9	9bb4e32b-ec9d-4751-aa76-150c2523680e	6100	Sales	\N	80000.00	80000.00	85000.00	85000.00	90000.00	90000.00	95000.00	95000.00	92000.00	90000.00	88000.00	100000.00	\N	2026-02-21 13:14:19.609657	2026-02-21 13:14:19.609657
28e4cb23-b922-4ef5-abef-a9737e4c81e1	9bb4e32b-ec9d-4751-aa76-150c2523680e	6200	Admin	\N	50000.00	50000.00	52000.00	52000.00	54000.00	54000.00	56000.00	56000.00	55000.00	54000.00	53000.00	60000.00	\N	2026-02-21 13:14:19.610621	2026-02-21 13:14:19.610621
a6c44161-bcfe-4fe2-86bf-20ee9779e04e	9bb4e32b-ec9d-4751-aa76-150c2523680e	4100	Sales	\N	800000.00	850000.00	900000.00	900000.00	950000.00	1000000.00	1000000.00	980000.00	950000.00	920000.00	900000.00	1200000.00	\N	2026-02-21 13:19:12.156278	2026-02-21 13:19:12.156278
2a33a845-cfb3-40e4-9811-59fea45b4e67	9bb4e32b-ec9d-4751-aa76-150c2523680e	4200	Services	\N	200000.00	220000.00	240000.00	250000.00	260000.00	280000.00	300000.00	290000.00	280000.00	270000.00	260000.00	350000.00	\N	2026-02-21 13:19:12.157583	2026-02-21 13:19:12.157583
8c9cc0b5-f4bc-4d50-9aab-80d91d3fb97f	9bb4e32b-ec9d-4751-aa76-150c2523680e	5100	Sales	\N	400000.00	420000.00	450000.00	450000.00	470000.00	500000.00	500000.00	490000.00	475000.00	460000.00	450000.00	600000.00	\N	2026-02-21 13:19:12.158082	2026-02-21 13:19:12.158082
feae049c-5fae-4da6-a74a-6328c1aa2464	9bb4e32b-ec9d-4751-aa76-150c2523680e	6000	Operations	\N	150000.00	150000.00	160000.00	160000.00	170000.00	170000.00	180000.00	180000.00	175000.00	170000.00	165000.00	180000.00	\N	2026-02-21 13:19:12.158478	2026-02-21 13:19:12.158478
091f0c02-af29-40fd-889a-6ddd35e7ed29	9bb4e32b-ec9d-4751-aa76-150c2523680e	6100	Sales	\N	80000.00	80000.00	85000.00	85000.00	90000.00	90000.00	95000.00	95000.00	92000.00	90000.00	88000.00	100000.00	\N	2026-02-21 13:19:12.158826	2026-02-21 13:19:12.158826
9e3296f5-4b35-4f0d-9f34-23db26ff09a8	9bb4e32b-ec9d-4751-aa76-150c2523680e	6200	Admin	\N	50000.00	50000.00	52000.00	52000.00	54000.00	54000.00	56000.00	56000.00	55000.00	54000.00	53000.00	60000.00	\N	2026-02-21 13:19:12.159248	2026-02-21 13:19:12.159248
04eafe08-30a9-40a2-838e-fde97bdeecfc	9bb4e32b-ec9d-4751-aa76-150c2523680e	4100	Sales	\N	800000.00	850000.00	900000.00	900000.00	950000.00	1000000.00	1000000.00	980000.00	950000.00	920000.00	900000.00	1200000.00	\N	2026-02-21 13:26:04.469488	2026-02-21 13:26:04.469488
9e47365f-0103-4822-9fa4-8dd25ae399f7	9bb4e32b-ec9d-4751-aa76-150c2523680e	4200	Services	\N	200000.00	220000.00	240000.00	250000.00	260000.00	280000.00	300000.00	290000.00	280000.00	270000.00	260000.00	350000.00	\N	2026-02-21 13:26:04.470866	2026-02-21 13:26:04.470866
6b7ac2bb-8731-44e4-95ab-16dd4f63b8a4	9bb4e32b-ec9d-4751-aa76-150c2523680e	5100	Sales	\N	400000.00	420000.00	450000.00	450000.00	470000.00	500000.00	500000.00	490000.00	475000.00	460000.00	450000.00	600000.00	\N	2026-02-21 13:26:04.471341	2026-02-21 13:26:04.471341
f2d278d1-c758-4750-9958-26fa8e40e9c7	9bb4e32b-ec9d-4751-aa76-150c2523680e	6000	Operations	\N	150000.00	150000.00	160000.00	160000.00	170000.00	170000.00	180000.00	180000.00	175000.00	170000.00	165000.00	180000.00	\N	2026-02-21 13:26:04.471743	2026-02-21 13:26:04.471743
653366d1-3781-4e9d-b9c8-a84948d8833a	9bb4e32b-ec9d-4751-aa76-150c2523680e	6100	Sales	\N	80000.00	80000.00	85000.00	85000.00	90000.00	90000.00	95000.00	95000.00	92000.00	90000.00	88000.00	100000.00	\N	2026-02-21 13:26:04.472074	2026-02-21 13:26:04.472074
06aaae3d-c250-4536-b61c-677ff3782c0c	9bb4e32b-ec9d-4751-aa76-150c2523680e	6200	Admin	\N	50000.00	50000.00	52000.00	52000.00	54000.00	54000.00	56000.00	56000.00	55000.00	54000.00	53000.00	60000.00	\N	2026-02-21 13:26:04.472387	2026-02-21 13:26:04.472387
\.


--
-- Data for Name: budget_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_templates (id, tenant_id, template_name, description, source_budget_id, template_data, is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: budget_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budget_versions (id, budget_id, version_number, version_name, snapshot, created_by, notes, created_at) FROM stdin;
\.


--
-- Data for Name: budgets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.budgets (id, tenant_id, budget_name, fiscal_year, budget_type, status, description, created_by, approved_by, approved_at, locked_at, notes, created_at, updated_at) FROM stdin;
9bb4e32b-ec9d-4751-aa76-150c2523680e	admin	FY2025 Annual Budget	2025	annual	draft	Annual operating budget for fiscal year 2025	system	\N	\N	\N	\N	2026-02-21 13:14:19.605546	2026-02-21 13:14:19.605546
\.


--
-- Data for Name: cash_flow_categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_categories (id, tenant_id, category_code, category_name, category_type, is_active, display_order, created_at) FROM stdin;
dcfbca7b-cbac-4976-9364-994ff0c926bd	admin	OP_IN_SALES	Collections from Customers	operating_inflow	t	1	2026-02-21 13:14:19.66333
7156a1bd-094d-4ecd-8fb4-dec717397b0d	admin	OP_IN_OTHER	Other Operating Receipts	operating_inflow	t	2	2026-02-21 13:14:19.66333
33fe150e-1acc-471f-a14b-98663637946a	admin	OP_OUT_PAYROLL	Payroll & Benefits	operating_outflow	t	1	2026-02-21 13:14:19.66333
bff87562-6e37-44ac-a9f5-154d233ca286	admin	OP_OUT_SUPPLIERS	Payments to Suppliers	operating_outflow	t	2	2026-02-21 13:14:19.66333
85b02ef9-725f-4566-b5d5-20ee39742c8c	admin	OP_OUT_RENT	Rent & Utilities	operating_outflow	t	3	2026-02-21 13:14:19.66333
e9a20e71-3fa5-4812-8a29-fafc3983c266	admin	OP_OUT_MARKETING	Marketing & Sales Expenses	operating_outflow	t	4	2026-02-21 13:14:19.66333
b793429f-f5f9-4bd0-8cd4-a494622ec453	admin	OP_OUT_OTHER	Other Operating Expenses	operating_outflow	t	5	2026-02-21 13:14:19.66333
0c42c510-e30e-4cf9-bebb-7224b28af19a	admin	INV_IN_ASSET_SALE	Proceeds from Asset Sales	investing_inflow	t	1	2026-02-21 13:14:19.66333
5d57a1bd-c406-4888-99dd-d8b4bd0fa9d6	admin	INV_IN_INVESTMENT	Investment Returns	investing_inflow	t	2	2026-02-21 13:14:19.66333
fa4d8f1b-ef57-455c-bbba-046c3186f353	admin	INV_OUT_CAPEX	Capital Expenditures	investing_outflow	t	1	2026-02-21 13:14:19.66333
01e2ab3a-1d78-4849-8772-80dea3a5bf6d	admin	INV_OUT_ACQUISITION	Acquisitions	investing_outflow	t	2	2026-02-21 13:14:19.66333
f9582cbf-562d-4254-ab18-eedf7a413eb8	admin	FIN_IN_LOAN	Loan Proceeds	financing_inflow	t	1	2026-02-21 13:14:19.66333
1c542167-5ba1-4772-990b-0bfe5b382b4d	admin	FIN_IN_EQUITY	Equity Funding	financing_inflow	t	2	2026-02-21 13:14:19.66333
34d4ea37-e4af-4f4c-922f-f6b41932bb00	admin	FIN_OUT_LOAN_REPAY	Loan Repayments	financing_outflow	t	1	2026-02-21 13:14:19.66333
dd48f1e3-4b20-47ad-8789-1c31779faa12	admin	FIN_OUT_INTEREST	Interest Payments	financing_outflow	t	2	2026-02-21 13:14:19.66333
c553d6fc-7b7b-4211-9f14-079d0318afe0	admin	FIN_OUT_DIVIDEND	Dividend Payments	financing_outflow	t	3	2026-02-21 13:14:19.66333
\.


--
-- Data for Name: cash_flow_forecasts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_forecasts (id, tenant_id, forecast_name, start_date, weeks, beginning_cash, status, notes, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cash_flow_line_items; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cash_flow_line_items (id, forecast_id, week_number, week_start_date, week_end_date, operating_cash_inflow, operating_cash_outflow, investing_cash_inflow, investing_cash_outflow, financing_cash_inflow, financing_cash_outflow, beginning_cash, ending_cash, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: chart_of_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chart_of_accounts (id, tenant_id, account_code, account_name, account_type, parent_account_code, is_active, normal_balance, description, level, sort_order, created_at, updated_at) FROM stdin;
9eb7a684-81be-4517-a1b1-bae35554e07b	admin	1000	Assets	asset	\N	t	debit	\N	1	1	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
a890dbdd-efa4-468d-bc43-0590911a80be	admin	1100	Current Assets	asset	1000	t	debit	\N	2	2	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
19d6637d-fa67-4c61-ad1f-698218cc4183	admin	1110	Cash and Cash Equivalents	asset	1100	t	debit	\N	3	3	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
19a57982-ac83-4337-8c0c-38af8a5078c6	admin	1120	Accounts Receivable	asset	1100	t	debit	\N	3	4	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
472351c5-0f85-4a38-a3e5-db28badedce6	admin	1130	Inventory	asset	1100	t	debit	\N	3	5	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
a883caa9-5280-404c-a7a3-deb7996cadb4	admin	1140	Prepaid Expenses	asset	1100	t	debit	\N	3	6	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
67b6b541-c43d-4c1a-8ed1-94fbcc0f1f59	admin	1200	Fixed Assets	asset	1000	t	debit	\N	2	7	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
6eed937c-9e92-46db-8d37-0330c05c204f	admin	1210	Property, Plant & Equipment	asset	1200	t	debit	\N	3	8	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
08f9b55b-5727-493c-95cd-87889b39bb98	admin	1220	Accumulated Depreciation	asset	1200	t	credit	\N	3	9	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
91f9530c-51e2-4611-97c9-77fe54c8a325	admin	2000	Liabilities	liability	\N	t	credit	\N	1	10	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
9f7dc30e-6f56-4d09-9300-822c43b906ef	admin	2100	Current Liabilities	liability	2000	t	credit	\N	2	11	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
bbe45aa0-7157-4ad9-b8f0-96e6c1310cf5	admin	2110	Accounts Payable	liability	2100	t	credit	\N	3	12	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
ad0294ed-4c83-42fb-8258-64096d486910	admin	2120	Accrued Expenses	liability	2100	t	credit	\N	3	13	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
cb73538b-7a93-4dc5-9c38-68b59520ce0f	admin	2130	Short-term Debt	liability	2100	t	credit	\N	3	14	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
a4ef4cf7-d782-4e95-99a6-23658adb6ff5	admin	2200	Long-term Liabilities	liability	2000	t	credit	\N	2	15	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
b9923827-eeeb-4453-bcfb-e402ef17692d	admin	2210	Long-term Debt	liability	2200	t	credit	\N	3	16	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
ca9b870b-2857-41fe-8405-600ccaf36f90	admin	3000	Equity	equity	\N	t	credit	\N	1	17	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
f9700200-db9a-493f-91bb-04d2835e3598	admin	3100	Share Capital	equity	3000	t	credit	\N	2	18	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
3fc3a1bd-7201-4729-8d5f-7dd8986c52b4	admin	3200	Retained Earnings	equity	3000	t	credit	\N	2	19	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
31cf220f-68c2-43bd-80d3-9258b56ea93e	admin	4000	Revenue	revenue	\N	t	credit	\N	1	20	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
4fb75d47-7089-4669-8cfa-fcf202f560f5	admin	4100	Sales Revenue	revenue	4000	t	credit	\N	2	21	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
a4a96a1e-46c3-47cc-9db4-a432c32a52c3	admin	4200	Service Revenue	revenue	4000	t	credit	\N	2	22	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
ed0365d2-7f74-461b-bbdd-31631bac935f	admin	4900	Other Income	revenue	4000	t	credit	\N	2	23	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
b4391116-8c66-4adb-a784-5f30579bf85e	admin	5000	Cost of Sales	expense	\N	t	debit	\N	1	24	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
87517de8-4ff9-4088-a08c-353148f95002	admin	5100	Cost of Goods Sold	expense	5000	t	debit	\N	2	25	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
3c74f990-d41d-4628-9815-ac1123e0d6f7	admin	6000	Operating Expenses	expense	\N	t	debit	\N	1	26	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
1c3645e1-9317-456c-b9ca-813889ae5d6b	admin	6100	Salaries and Wages	expense	6000	t	debit	\N	2	27	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
0600066e-a443-4d90-88f5-6a7e5b297cd0	admin	6200	Rent	expense	6000	t	debit	\N	2	28	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
0693a740-17d3-4054-845c-60718f2c4ba3	admin	6300	Utilities	expense	6000	t	debit	\N	2	29	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
cc407ae7-98df-4c2d-8104-c7e437f7663c	admin	6400	Marketing and Advertising	expense	6000	t	debit	\N	2	30	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
69cff888-094c-490d-9f71-490074cafc70	admin	6500	Office Supplies	expense	6000	t	debit	\N	2	31	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
75fad516-c7ad-4cce-9cbf-9c8c94cde967	admin	6600	Insurance	expense	6000	t	debit	\N	2	32	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
28285bf2-41df-4b12-871f-f6951d7e8749	admin	6700	Professional Fees	expense	6000	t	debit	\N	2	33	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
fbf6970d-e87b-4077-aebf-dbe1c39ccf51	admin	6800	Depreciation	expense	6000	t	debit	\N	2	34	2026-02-21 13:14:19.720449	2026-02-21 13:14:19.720449
\.


--
-- Data for Name: coa_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.coa_templates (id, template_name, industry, description, accounts, is_active, created_at, updated_at) FROM stdin;
c3c6475f-efb7-43fa-bb65-f0db06693cc3	General Business	general	Standard chart of accounts for general businesses	[{"code": "1000", "name": "Assets", "type": "asset", "level": 1, "parent": null, "balance": "debit"}, {"code": "1100", "name": "Current Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1110", "name": "Cash and Cash Equivalents", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1120", "name": "Accounts Receivable", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1130", "name": "Inventory", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1140", "name": "Prepaid Expenses", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1200", "name": "Fixed Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1210", "name": "Property, Plant & Equipment", "type": "asset", "level": 3, "parent": "1200", "balance": "debit"}, {"code": "1220", "name": "Accumulated Depreciation", "type": "asset", "level": 3, "parent": "1200", "balance": "credit"}, {"code": "2000", "name": "Liabilities", "type": "liability", "level": 1, "parent": null, "balance": "credit"}, {"code": "2100", "name": "Current Liabilities", "type": "liability", "level": 2, "parent": "2000", "balance": "credit"}, {"code": "2110", "name": "Accounts Payable", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2120", "name": "Accrued Expenses", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2130", "name": "Short-term Debt", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2200", "name": "Long-term Liabilities", "type": "liability", "level": 2, "parent": "2000", "balance": "credit"}, {"code": "2210", "name": "Long-term Debt", "type": "liability", "level": 3, "parent": "2200", "balance": "credit"}, {"code": "3000", "name": "Equity", "type": "equity", "level": 1, "parent": null, "balance": "credit"}, {"code": "3100", "name": "Share Capital", "type": "equity", "level": 2, "parent": "3000", "balance": "credit"}, {"code": "3200", "name": "Retained Earnings", "type": "equity", "level": 2, "parent": "3000", "balance": "credit"}, {"code": "4000", "name": "Revenue", "type": "revenue", "level": 1, "parent": null, "balance": "credit"}, {"code": "4100", "name": "Sales Revenue", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "4200", "name": "Service Revenue", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "4900", "name": "Other Income", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "5000", "name": "Cost of Sales", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "5100", "name": "Cost of Goods Sold", "type": "expense", "level": 2, "parent": "5000", "balance": "debit"}, {"code": "6000", "name": "Operating Expenses", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "6100", "name": "Salaries and Wages", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6200", "name": "Rent", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6300", "name": "Utilities", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6400", "name": "Marketing and Advertising", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6500", "name": "Office Supplies", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6600", "name": "Insurance", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6700", "name": "Professional Fees", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6800", "name": "Depreciation", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}]	t	2026-02-21 13:14:19.719343	2026-02-21 13:14:19.719343
00afcb66-6930-4da0-9106-79e7e3450876	SaaS Business	saas	Chart of accounts optimized for SaaS companies	[{"code": "1000", "name": "Assets", "type": "asset", "level": 1, "parent": null, "balance": "debit"}, {"code": "1100", "name": "Current Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1110", "name": "Cash and Cash Equivalents", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1120", "name": "Accounts Receivable", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1130", "name": "Deferred Costs", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1200", "name": "Fixed Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1210", "name": "Computer Equipment", "type": "asset", "level": 3, "parent": "1200", "balance": "debit"}, {"code": "1220", "name": "Software", "type": "asset", "level": 3, "parent": "1200", "balance": "debit"}, {"code": "2000", "name": "Liabilities", "type": "liability", "level": 1, "parent": null, "balance": "credit"}, {"code": "2100", "name": "Current Liabilities", "type": "liability", "level": 2, "parent": "2000", "balance": "credit"}, {"code": "2110", "name": "Accounts Payable", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2120", "name": "Deferred Revenue", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2130", "name": "Accrued Commissions", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "3000", "name": "Equity", "type": "equity", "level": 1, "parent": null, "balance": "credit"}, {"code": "3100", "name": "Share Capital", "type": "equity", "level": 2, "parent": "3000", "balance": "credit"}, {"code": "3200", "name": "Retained Earnings", "type": "equity", "level": 2, "parent": "3000", "balance": "credit"}, {"code": "4000", "name": "Revenue", "type": "revenue", "level": 1, "parent": null, "balance": "credit"}, {"code": "4100", "name": "Subscription Revenue", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "4200", "name": "Professional Services Revenue", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "5000", "name": "Cost of Revenue", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "5100", "name": "Hosting and Infrastructure", "type": "expense", "level": 2, "parent": "5000", "balance": "debit"}, {"code": "5200", "name": "Customer Support", "type": "expense", "level": 2, "parent": "5000", "balance": "debit"}, {"code": "6000", "name": "Operating Expenses", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "6100", "name": "Sales and Marketing", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6110", "name": "Sales Commissions", "type": "expense", "level": 3, "parent": "6100", "balance": "debit"}, {"code": "6120", "name": "Marketing Campaigns", "type": "expense", "level": 3, "parent": "6100", "balance": "debit"}, {"code": "6200", "name": "Research and Development", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6300", "name": "General and Administrative", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}]	t	2026-02-21 13:14:19.719343	2026-02-21 13:14:19.719343
ff5d2752-1379-4919-a242-c6c7c1d177b4	Retail Business	retail	Chart of accounts for retail businesses	[{"code": "1000", "name": "Assets", "type": "asset", "level": 1, "parent": null, "balance": "debit"}, {"code": "1100", "name": "Current Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1110", "name": "Cash", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1120", "name": "Accounts Receivable", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1130", "name": "Inventory - Raw Materials", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1131", "name": "Inventory - Finished Goods", "type": "asset", "level": 3, "parent": "1100", "balance": "debit"}, {"code": "1200", "name": "Fixed Assets", "type": "asset", "level": 2, "parent": "1000", "balance": "debit"}, {"code": "1210", "name": "Store Equipment", "type": "asset", "level": 3, "parent": "1200", "balance": "debit"}, {"code": "1220", "name": "Leasehold Improvements", "type": "asset", "level": 3, "parent": "1200", "balance": "debit"}, {"code": "2000", "name": "Liabilities", "type": "liability", "level": 1, "parent": null, "balance": "credit"}, {"code": "2100", "name": "Current Liabilities", "type": "liability", "level": 2, "parent": "2000", "balance": "credit"}, {"code": "2110", "name": "Accounts Payable", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "2120", "name": "Gift Card Liability", "type": "liability", "level": 3, "parent": "2100", "balance": "credit"}, {"code": "3000", "name": "Equity", "type": "equity", "level": 1, "parent": null, "balance": "credit"}, {"code": "3100", "name": "Owner Equity", "type": "equity", "level": 2, "parent": "3000", "balance": "credit"}, {"code": "4000", "name": "Revenue", "type": "revenue", "level": 1, "parent": null, "balance": "credit"}, {"code": "4100", "name": "Sales Revenue", "type": "revenue", "level": 2, "parent": "4000", "balance": "credit"}, {"code": "4900", "name": "Sales Returns and Allowances", "type": "revenue", "level": 2, "parent": "4000", "balance": "debit"}, {"code": "5000", "name": "Cost of Goods Sold", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "5100", "name": "Merchandise Purchases", "type": "expense", "level": 2, "parent": "5000", "balance": "debit"}, {"code": "5200", "name": "Freight In", "type": "expense", "level": 2, "parent": "5000", "balance": "debit"}, {"code": "6000", "name": "Operating Expenses", "type": "expense", "level": 1, "parent": null, "balance": "debit"}, {"code": "6100", "name": "Store Salaries", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6200", "name": "Store Rent", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}, {"code": "6300", "name": "Advertising", "type": "expense", "level": 2, "parent": "6000", "balance": "debit"}]	t	2026-02-21 13:14:19.719343	2026-02-21 13:14:19.719343
\.


--
-- Data for Name: company_profile; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.company_profile (id, tenant_id, company_name, tax_id, industry, fiscal_year_end, default_currency, address, phone, website, logo_url, settings, created_at, updated_at) FROM stdin;
8d16f8b3-595f-49a2-8b27-ddeaa87172ab	admin	CFO Platform Admin	\N	\N	\N	THB	\N	\N	\N	\N	\N	2026-02-21 13:14:20.08307+00	2026-02-21 13:14:20.08307+00
7bdb82a6-cc9f-4965-b158-88d8e19d961d	admin	CFO Platform Admin	\N	\N	\N	THB	\N	\N	\N	\N	\N	2026-02-21 13:19:12.482937+00	2026-02-21 13:19:12.482937+00
f9e32b3f-6e6e-4445-ad0b-22e58936b49e	admin	CFO Platform Admin	\N	\N	\N	THB	\N	\N	\N	\N	\N	2026-02-21 13:26:04.787157+00	2026-02-21 13:26:04.787157+00
\.


--
-- Data for Name: cookie_consents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cookie_consents (id, user_id, essential, analytics, marketing, consented_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: data_retention_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_retention_policies (id, tenant_id, data_type, retention_days, legal_basis, auto_delete_enabled, created_at, updated_at) FROM stdin;
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

COPY public.dsar_requests (id, user_id, email, request_type, description, status, requested_at, processed_at, processed_by, exported_at, admin_notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: dsr_audit_log; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dsr_audit_log (id, dsr_request_id, action, actor_email, actor_role, old_status, new_status, notes, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: dsr_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.dsr_requests (id, tenant_id, request_type, status, requester_email, requester_user_id, requester_name, request_reason, request_scope, response_data, response_file_url, rejection_reason, approved_by, approved_at, processed_by, processed_at, due_date, completed_at, created_at, updated_at, is_anonymized, anonymized_at) FROM stdin;
\.


--
-- Data for Name: etl_parameters; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.etl_parameters (id, tenant_id, parameter_name, parameter_type, currency_pair, value, effective_date, created_by, created_at, updated_at) FROM stdin;
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
7a4e844e-cb47-496e-9e2f-21cfd40d3db6	admin	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	failed	0	2	Row 1: column "import_log_id" of relation "etl_transactions" does not exist\nRow 2: column "import_log_id" of relation "etl_transactions" does not exist	2026-02-21 14:45:15.422141	2026-02-21 14:45:15.434859	admin
8208834e-55b1-4a3e-86ba-f57191ec8abc	admin	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	failed	0	1	Row 1: column "import_log_id" of relation "etl_transactions" does not exist	2026-02-21 14:45:26.533515	2026-02-21 14:45:26.542497	admin
\.


--
-- Data for Name: import_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_logs (id, tenant_id, schedule_id, template_id, import_type, file_name, file_size, mime_type, status, total_rows, valid_rows, invalid_rows, imported_rows, validation_errors, processing_time_ms, started_at, completed_at, imported_by, metadata) FROM stdin;
f86b70af-75dc-4272-9604-66b5158ed9e1	admin	\N	\N	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	\N	processing	0	0	0	0	\N	\N	2026-02-21 14:48:34.795387	\N	\N	\N
e236ffaa-3674-49dc-aecb-a716693a12ca	admin	\N	\N	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	\N	completed	2	2	0	0	\N	\N	2026-02-21 14:49:46.113488	2026-02-21 14:49:46.120119	\N	\N
80b2bf98-22ba-4ece-ae92-09ab4ae9556a	admin	\N	\N	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	\N	completed	8	8	0	0	\N	\N	2026-02-21 14:51:11.619884	2026-02-21 14:51:11.637099	\N	\N
9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	admin	\N	\N	csv	template_4d0c923c-b959-4a6b-815b-b8a2246dd272	0	\N	completed	8	8	0	0	\N	\N	2026-02-21 14:53:54.2498	2026-02-21 14:53:54.255819	\N	\N
71d654a9-245d-472e-9be0-21b8fb8f352c	admin	\N	\N	csv	sample_quickbooks.csv	1052	\N	failed	0	0	0	0	["Statement type is required"]	\N	2026-02-21 14:54:19.046774	2026-02-21 14:54:19.054749	\N	\N
fa1008dc-3db2-4c57-b952-903ff7b7f8c2	admin	\N	\N	csv	template_custom	0	\N	completed	3	3	0	0	\N	\N	2026-02-21 23:35:06.117369	2026-02-21 23:35:06.122684	\N	\N
83afc7ba-89c3-4c41-8978-af122550b83b	admin	\N	\N	csv	template_custom	0	\N	completed	1	1	0	0	\N	\N	2026-02-21 23:35:39.233436	2026-02-21 23:35:39.236476	\N	\N
ee149573-22ce-4e98-958a-837369168cdb	admin	\N	\N	csv	sample_quickbooks.csv	1052	\N	failed	0	0	0	0	["Statement type is required"]	\N	2026-02-22 03:19:23.417529	2026-02-22 03:19:23.4291	\N	\N
\.


--
-- Data for Name: import_schedules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_schedules (id, tenant_id, schedule_name, template_id, source_type, source_config, schedule_type, schedule_config, auto_approve, notification_emails, last_run_at, next_run_at, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: import_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.import_templates (id, template_name, template_type, description, file_format, column_mappings, validation_rules, transformation_rules, sample_data, is_active, is_system, created_by, created_at, updated_at) FROM stdin;
45e1941c-57df-4906-8f65-248e51048028	Thai Accounting Software Export	thai_accounting	รูปแบบการ export จากโปรแกรมบัญชีไทย (Express, MYOB, Smart)	csv	{"date": {"type": "date", "format": "DD/MM/YYYY", "required": true, "source_column": "วันที่"}, "debit": {"type": "number", "source_column": "เดบิต"}, "credit": {"type": "number", "source_column": "เครดิต"}, "reference": {"type": "string", "target": "reference_number", "source_column": "อ้างอิง"}, "description": {"type": "string", "source_column": "รายการ"}, "document_no": {"type": "string", "target": "document_number", "source_column": "เลขที่เอกสาร"}, "account_code": {"type": "string", "source_column": "รหัสบัญชี"}, "account_name": {"type": "string", "source_column": "ชื่อบัญชี"}}	{"date": {"required": true}}	\N	\N	t	t	\N	2026-02-21 13:14:19.797807	2026-02-21 13:14:19.797807
4d0c923c-b959-4a6b-815b-b8a2246dd272	Generic Transaction Import	custom	Generic CSV format - configure your own column mapping	csv	{"date": {"type": "date", "required": true, "source_column": "Date"}, "amount": {"type": "number", "required": true, "source_column": "Amount"}, "reference": {"type": "string", "target": "reference_number", "source_column": "Reference"}, "description": {"type": "string", "source_column": "Description"}, "account_code": {"type": "string", "source_column": "Account"}}	{"date": {"required": true}, "amount": {"type": "number", "required": true}}	\N	\N	t	t	\N	2026-02-21 13:14:19.798561	2026-02-21 13:14:19.798561
19544d3f-3350-46a4-84f4-0445d149ee86	QuickBooks Transaction Export	quickbooks	Standard QuickBooks transaction export format (Transaction List by Date)	csv	{"num": {"type": "string", "source_column": "Num"}, "date": {"type": "date", "format": "MM/DD/YYYY", "required": true, "source_column": "Date"}, "memo": {"type": "string", "target": "description", "source_column": "Memo/Description"}, "name": {"type": "string", "target": "vendor_customer", "source_column": "Name"}, "split": {"type": "string", "source_column": "Split"}, "amount": {"type": "number", "required": true, "source_column": "Amount"}, "account": {"type": "string", "target": "account_code", "source_column": "Account"}, "balance": {"type": "number", "source_column": "Balance"}, "transaction_type": {"type": "string", "source_column": "Transaction Type"}}	{"date": {"required": true, "date_format": "MM/DD/YYYY"}, "amount": {"type": "number", "required": true, "allow_negative": true}}	\N	\N	t	t	\N	2026-02-21 13:19:12.329395	2026-02-21 13:19:12.329395
3aa6d5b5-58b2-4a24-b3fb-003c21249cc8	Xero Bank Statement	xero	Xero bank statement export format	csv	{"date": {"type": "date", "format": "DD/MM/YYYY", "required": true, "source_column": "Date"}, "payee": {"type": "string", "target": "vendor_customer", "source_column": "Payee"}, "amount": {"type": "number", "required": true, "source_column": "Amount"}, "reference": {"type": "string", "target": "reference_number", "source_column": "Reference"}, "description": {"type": "string", "source_column": "Description"}, "account_code": {"type": "string", "source_column": "Account Code"}, "check_number": {"type": "string", "target": "document_number", "source_column": "Check Number"}}	{"date": {"required": true}, "amount": {"type": "number", "required": true}}	\N	\N	t	t	\N	2026-02-21 13:19:12.330164	2026-02-21 13:19:12.330164
\.


--
-- Data for Name: imported_transactions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.imported_transactions (id, tenant_id, import_log_id, transaction_date, description, amount, account_code, department, cost_center, project_code, transaction_type, category, subcategory, document_number, reference_number, vendor_customer, custom_fields, status, validation_status, validation_messages, financial_statement_id, posted_at, posted_by, created_at, updated_at) FROM stdin;
65cc162e-515c-4346-a7c1-5224f444d935	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-15	IT Consulting Services	150000.00	4100		\N	\N	\N		\N	INV-1001	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.623468	2026-02-21 17:02:07.675981
6b2bc289-fede-40ac-9d29-4c05daf701b9	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-18	Office Supplies Purchase	-8500.00	5100		\N	\N	\N		\N	BILL-2001	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.625281	2026-02-21 17:02:07.675981
61f75ee9-26bb-4646-a75c-37ea339c87c6	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-20	Monthly Office Rent	-45000.00	5200		\N	\N	\N		\N	CHK-3001	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.628172	2026-02-21 17:02:07.675981
1264c526-2edf-49b7-bb47-461c5b41e36f	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-25	Software Development	280000.00	4200		\N	\N	\N		\N	INV-1002	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.631923	2026-02-21 17:02:07.675981
e9f8f4b4-0003-4fe9-b5c8-43718c5a0028	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-28	Cloud Hosting Charges	-12000.00	5300		\N	\N	\N		\N	BILL-2002	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.633624	2026-02-21 17:02:07.675981
7d587e2a-3afd-47a1-982d-16799a5c124c	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-01-30	Insurance Premium	-18000.00	5400		\N	\N	\N		\N	CHK-3002	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.63489	2026-02-21 17:02:07.675981
f11637d1-0a3f-4fa6-86f0-36e2d1b5ea0e	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-02-01	Data Migration Project	95000.00	4000		\N	\N	\N		\N	INV-1003	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.63571	2026-02-21 17:02:07.675981
82481139-d4f1-4966-a317-54782887d67e	admin	80b2bf98-22ba-4ece-ae92-09ab4ae9556a	2026-02-05	Electricity Bill	-4200.00	5500		\N	\N	\N		\N	BILL-2003	\N		\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:51:11.636393	2026-02-21 17:02:07.675981
808dfb61-6d70-4210-81a7-15b45db232fc	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-15	IT Consulting Services - January	150000.00	Accounts Receivable		\N	\N	\N	Invoice	\N	INV-1001	\N	Acme Corp	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.251998	2026-02-21 17:02:07.675981
3acba247-4648-455e-b68e-d99659a91dc6	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-18	Office supplies and printer toner	-8500.00	Office Supplies		\N	\N	\N	Bill	\N	BILL-2001	\N	Office Supply Co.	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.252849	2026-02-21 17:02:07.675981
08ee8554-1765-4c55-9335-841a336b5445	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-20	Monthly office rent - January	-45000.00	Rent Expense		\N	\N	\N	Payment	\N	CHK-3001	\N	Landlord Co.	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.253423	2026-02-21 17:02:07.675981
a427536a-2a2a-4d4a-8694-c2ead153bb34	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-25	Software Development Phase 1	280000.00	Accounts Receivable		\N	\N	\N	Invoice	\N	INV-1002	\N	Beta Industries	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.254258	2026-02-21 17:02:07.675981
ce73cab1-2648-40c5-b778-4ec5994acb66	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-28	AWS hosting - January	-12000.00	Cloud Hosting		\N	\N	\N	Bill	\N	BILL-2002	\N	Cloud Host Ltd	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.254624	2026-02-21 17:02:07.675981
fce1181c-615b-4998-bc06-96c64d7f9551	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-01-30	Business insurance premium	-18000.00	Insurance Expense		\N	\N	\N	Payment	\N	CHK-3002	\N	Thai Insurance Co	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.254928	2026-02-21 17:02:07.675981
36c439f2-2687-4c43-8996-a01fee9354d7	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-02-01	Data Migration Project	95000.00	Accounts Receivable		\N	\N	\N	Invoice	\N	INV-1003	\N	Gamma Solutions	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.255225	2026-02-21 17:02:07.675981
a5e95dc8-1b6f-489a-be82-e80337ba27cd	admin	9a83c1b3-cdf1-4f82-ae47-ee85fc33125c	2026-02-05	Electricity bill - January	-4200.00	Utilities		\N	\N	\N	Bill	\N	BILL-2003	\N	Power Company	\N	posted	valid	\N	d53e3ad8-e49d-4814-bd36-764436547557	2026-02-21 17:02:07.675981	admin	2026-02-21 14:53:54.255529	2026-02-21 17:02:07.675981
de0409f2-246d-4d20-aacb-6aeebd2e33ce	admin	83afc7ba-89c3-4c41-8978-af122550b83b	2026-02-10	Additional Revenue	100000.00	4100		\N	\N	\N		\N	INV-201	\N		\N	approved	valid	\N	\N	\N	\N	2026-02-21 23:35:39.235198	2026-02-21 23:48:46.606817
b1e4c828-17f0-44ef-99bb-0bd4aa0ae359	admin	fa1008dc-3db2-4c57-b952-903ff7b7f8c2	2026-01-15	Consulting Revenue	200000.00	4100		\N	\N	\N		\N	INV-101	\N		\N	approved	valid	\N	\N	\N	\N	2026-02-21 23:35:06.119802	2026-02-21 23:49:01.02883
155623b8-97c8-4c82-bbf0-f3f157b0326e	admin	fa1008dc-3db2-4c57-b952-903ff7b7f8c2	2026-01-20	Office Rent	-50000.00	5200		\N	\N	\N		\N	CHK-201	\N		\N	approved	valid	\N	\N	\N	\N	2026-02-21 23:35:06.121497	2026-02-21 23:49:01.02883
0a962f26-a471-4bc3-b9d5-9b60e30f6bbc	admin	fa1008dc-3db2-4c57-b952-903ff7b7f8c2	2026-01-25	Software License	-15000.00	5300		\N	\N	\N		\N	BILL-301	\N		\N	approved	valid	\N	\N	\N	\N	2026-02-21 23:35:06.122096	2026-02-21 23:49:01.02883
\.


--
-- Data for Name: mapping_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.mapping_rules (id, tenant_id, rule_name, rule_type, match_conditions, mapping_result, priority, is_active, usage_count, last_used_at, created_by, created_at, updated_at) FROM stdin;
1b2d9246-f0d4-434c-b678-ee0b8a2141e2	admin	Salary & Wages Auto-mapping	keyword_match	{"description_contains": ["salary", "wage", "payroll", "เงินเดือน"]}	{"category": "Payroll", "account_code": "6100", "transaction_type": "expense"}	10	t	0	\N	\N	2026-02-21 13:14:19.798908	2026-02-21 13:14:19.798908
5c6b53b0-125f-4251-8116-0b5f392552a7	admin	Office Rent Auto-mapping	keyword_match	{"description_contains": ["rent", "lease", "ค่าเช่า"]}	{"category": "Rent", "account_code": "6200", "transaction_type": "expense"}	8	t	0	\N	\N	2026-02-21 13:14:19.798908	2026-02-21 13:14:19.798908
5db8b79c-33a7-4a1c-acb3-4c17f225daf7	admin	Sales Revenue Auto-mapping	keyword_match	{"description_contains": ["sales", "revenue", "invoice", "ขาย", "รายได้"]}	{"category": "Sales", "account_code": "4100", "transaction_type": "income"}	9	t	0	\N	\N	2026-02-21 13:14:19.798908	2026-02-21 13:14:19.798908
bbe4ce1c-1829-4ecb-ad77-0acf9020f9e3	admin	Salary & Wages Auto-mapping	keyword_match	{"description_contains": ["salary", "wage", "payroll", "เงินเดือน"]}	{"category": "Payroll", "account_code": "6100", "transaction_type": "expense"}	10	t	0	\N	\N	2026-02-21 13:19:12.331049	2026-02-21 13:19:12.331049
a2b13146-6ef1-49f8-8f84-90dead54fd8d	admin	Office Rent Auto-mapping	keyword_match	{"description_contains": ["rent", "lease", "ค่าเช่า"]}	{"category": "Rent", "account_code": "6200", "transaction_type": "expense"}	8	t	0	\N	\N	2026-02-21 13:19:12.331049	2026-02-21 13:19:12.331049
55e1f7e1-b2e6-4378-9216-c28152b596fc	admin	Sales Revenue Auto-mapping	keyword_match	{"description_contains": ["sales", "revenue", "invoice", "ขาย", "รายได้"]}	{"category": "Sales", "account_code": "4100", "transaction_type": "income"}	9	t	0	\N	\N	2026-02-21 13:19:12.331049	2026-02-21 13:19:12.331049
56372eee-c6d1-47ac-a57b-b48384bc6ab6	admin	Salary & Wages Auto-mapping	keyword_match	{"description_contains": ["salary", "wage", "payroll", "เงินเดือน"]}	{"category": "Payroll", "account_code": "6100", "transaction_type": "expense"}	10	t	0	\N	\N	2026-02-21 13:26:04.635785	2026-02-21 13:26:04.635785
2e3f9bb2-e2de-453d-a51c-9247576a9923	admin	Office Rent Auto-mapping	keyword_match	{"description_contains": ["rent", "lease", "ค่าเช่า"]}	{"category": "Rent", "account_code": "6200", "transaction_type": "expense"}	8	t	0	\N	\N	2026-02-21 13:26:04.635785	2026-02-21 13:26:04.635785
1c706dba-38a5-45b9-96c4-dedc13fba0a9	admin	Sales Revenue Auto-mapping	keyword_match	{"description_contains": ["sales", "revenue", "invoice", "ขาย", "รายได้"]}	{"category": "Sales", "account_code": "4100", "transaction_type": "income"}	9	t	0	\N	\N	2026-02-21 13:26:04.635785	2026-02-21 13:26:04.635785
\.


--
-- Data for Name: object_versions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.object_versions (id, tenant_id, object_type, object_id, version_number, version_label, snapshot_data, change_type, change_summary, changed_fields, created_by, created_at, ip_address, user_agent) FROM stdin;
\.


--
-- Data for Name: ownership_transfer_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ownership_transfer_requests (id, tenant_id, current_owner_email, new_owner_email, reason, status, requested_at, responded_at, response_reason, created_at, updated_at) FROM stdin;
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
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_plans (id, plan_name, price_monthly, max_users, max_statements, max_storage_mb, features, is_active, created_at) FROM stdin;
c46f382f-9d69-40d1-b6b3-3b3c283e4356	Free	0.00	3	100	1024	{"support": "community", "api_rate_limit": 100}	t	2026-02-21 13:14:19.528676+00
5637b669-c022-40b6-a540-563077cf9337	Starter	49.00	10	1000	10240	{"support": "email", "api_rate_limit": 1000, "custom_reports": true}	t	2026-02-21 13:14:19.528676+00
d8caef0f-9a1d-4c7a-a685-37fde1b04cd0	Professional	199.00	50	10000	102400	{"support": "priority", "api_rate_limit": 10000, "custom_reports": true, "advanced_analytics": true}	t	2026-02-21 13:14:19.528676+00
26b4f528-1fbc-41b4-b8fd-e5b1dda2c05d	Enterprise	999.00	\N	\N	\N	{"sso": true, "support": "dedicated", "audit_logs": true, "api_rate_limit": -1, "custom_reports": true, "advanced_analytics": true}	t	2026-02-21 13:14:19.528676+00
\.


--
-- Data for Name: system_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_config (id, tenant_id, config_key, config_value, description, is_system, updated_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: system_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.system_users (id, email, full_name, role, is_active, created_at, updated_at, last_login_at) FROM stdin;
4be5f465-5bda-4bed-9a11-ad5a83d6390f	admin@admin.local	Admin User	system_user	t	2026-02-21 13:22:11.400771+00	2026-02-21 13:22:11.400771+00	\N
7e770408-7537-4403-809b-6e56f5007b11	analyst@admin.local	Admin Analyst	system_user	t	2026-02-21 13:22:11.400771+00	2026-02-21 13:22:11.400771+00	\N
9450b041-87b2-404b-adcb-3771f6ce9523	viewer@admin.local	Admin Viewer	system_user	t	2026-02-21 13:22:11.400771+00	2026-02-21 13:22:11.400771+00	\N
c3f34d04-0532-4ba1-a682-238f4d14bdc6	admin@acmecorp.local	Acme Admin	system_user	t	2026-02-21 13:22:11.403006+00	2026-02-21 13:22:11.403006+00	\N
dac64a45-8195-47fe-8edc-670590fa9509	analyst@acmecorp.local	Acme Analyst	system_user	t	2026-02-21 13:22:11.403006+00	2026-02-21 13:22:11.403006+00	\N
60c612c3-531f-4da3-9500-6183c51df9e6	viewer@acmecorp.local	Acme Viewer	system_user	t	2026-02-21 13:22:11.403006+00	2026-02-21 13:22:11.403006+00	\N
945e2b71-4718-45ac-b667-dd4d496b0a26	admin	Admin User	super_admin	t	2026-02-21 13:14:20.083914+00	2026-02-21 13:14:20.083914+00	2026-02-21 13:58:53.02915+00
0ced9000-f81b-405f-9777-f38b6bd87b03	superadmin@system.local	Super Administrator	super_admin	t	2026-02-21 13:14:19.52925+00	2026-02-21 13:26:06.327897+00	2026-02-22 13:36:52.452156+00
\.


--
-- Data for Name: tenant_approvals; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_approvals (id, tenant_id, tenant_name, requested_by, request_date, status, approved_by, approval_date, rejection_reason, metadata, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenant_data; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_data (id, key, value, created_at) FROM stdin;
\.


--
-- Data for Name: tenant_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_subscriptions (id, tenant_id, plan_id, status, trial_end_date, billing_cycle, next_billing_date, stripe_customer_id, stripe_subscription_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tenant_usage_metrics; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_usage_metrics (id, tenant_id, metric_date, active_users, api_requests, storage_mb, statements_count, scenarios_count, created_at) FROM stdin;
\.


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenants (id, name, db_name, db_user, encrypted_password, created_at) FROM stdin;
admin	Admin Tenant	tenant_admin_tenant_admin	u_admin_tenant_admin	Ob/iMqDRoyBV5AeaTy4l0Sxy8eWYQVOc6a+RuJDTlqBX+AZlDbz0LxWoxtsYEqHfOn80//zt4jEqIeIl	2026-02-21 13:20:51.386315+00
155cf73a2fe388f0	Acme Corp	tenant_acme_corp_155cf73a2fe388f0	u_acme_corp_155cf73a2fe388f0	PXQ55U8CydoiePQWPQtVxC2i3msBZgsnAosIDlFw1UPqJlJU+RivVi22a/fM42U6/OyW6hOvcZciTafn	2026-02-21 13:20:57.054853+00
\.


--
-- Data for Name: user_invitations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_invitations (id, tenant_id, email, role, invited_by, invitation_token, expires_at, accepted_at, status, created_at) FROM stdin;
\.


--
-- Data for Name: user_tenant_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_tenant_memberships (id, user_id, tenant_id, tenant_role, joined_at) FROM stdin;
628f3523-bc09-4e7b-a0c4-e126aff165af	945e2b71-4718-45ac-b667-dd4d496b0a26	admin	admin	2026-02-21 13:14:20.08475+00
2110c2c8-232e-42d7-b93f-e4c659278c73	4be5f465-5bda-4bed-9a11-ad5a83d6390f	admin	admin	2026-02-21 13:22:11.403548+00
d925201c-359c-4b8c-b268-300fe3d46289	7e770408-7537-4403-809b-6e56f5007b11	admin	analyst	2026-02-21 13:22:11.403548+00
52297ee8-c6c6-4933-b7d0-68e88fca806d	9450b041-87b2-404b-adcb-3771f6ce9523	admin	viewer	2026-02-21 13:22:11.403548+00
eeac66bb-71c0-47d0-97af-a28426f4b6f9	c3f34d04-0532-4ba1-a682-238f4d14bdc6	155cf73a2fe388f0	admin	2026-02-21 13:22:11.404925+00
6d9deef7-8c59-4f92-be41-67396fcef300	dac64a45-8195-47fe-8edc-670590fa9509	155cf73a2fe388f0	analyst	2026-02-21 13:22:11.404925+00
6abd0a37-d228-403b-83c6-2a2b00c44038	60c612c3-531f-4da3-9500-6183c51df9e6	155cf73a2fe388f0	viewer	2026-02-21 13:22:11.404925+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, tenant_id, email, full_name, phone, bio, role, is_active, last_login, created_at, updated_at) FROM stdin;
bb75c643-0367-4e97-8d39-5a829ce5c8d5	admin	admin	Admin User	\N	\N	admin	t	\N	2026-02-21 13:14:20.082182+00	2026-02-21 13:14:20.082182+00
\.


--
-- Data for Name: version_comparisons; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.version_comparisons (id, tenant_id, object_type, object_id, version_from, version_to, comparison_result, created_by, created_at, notes) FROM stdin;
\.


--
-- Data for Name: version_policies; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.version_policies (id, tenant_id, object_type, is_enabled, auto_snapshot_on_create, auto_snapshot_on_update, auto_snapshot_on_delete, max_versions_per_object, retention_days, auto_snapshot_frequency, created_at, updated_at) FROM stdin;
f98fa7fb-5a3a-4a33-82e7-e34529b0dc12	admin	coa_entry	t	t	t	t	100	\N	\N	2026-02-21 13:14:20.241146	2026-02-21 13:14:20.241146
52b36df6-1559-4e76-8b4f-761508130638	admin	budget	t	t	t	t	50	730	\N	2026-02-21 13:14:20.241146	2026-02-21 13:14:20.241146
1dd42b92-ac2e-4822-9bf0-0a7640b317aa	admin	budget_line	t	t	t	t	50	730	\N	2026-02-21 13:14:20.241146	2026-02-21 13:14:20.241146
39a5ccc5-c892-4321-892a-723ddc150f11	admin	statement	t	t	t	t	100	\N	\N	2026-02-21 13:14:20.241146	2026-02-21 13:14:20.241146
4136ca47-b506-4ecd-93fc-63b8a9fe0378	admin	scenario	t	t	t	t	30	365	\N	2026-02-21 13:14:20.241146	2026-02-21 13:14:20.241146
\.


--
-- Name: tenant_data_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenant_data_id_seq', 1, false);


--
-- Name: anonymization_records anonymization_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymization_records
    ADD CONSTRAINT anonymization_records_pkey PRIMARY KEY (id);


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
-- Name: budget_allocations budget_allocations_budget_id_department_category_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_allocations
    ADD CONSTRAINT budget_allocations_budget_id_department_category_key UNIQUE (budget_id, department, category);


--
-- Name: budget_allocations budget_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_allocations
    ADD CONSTRAINT budget_allocations_pkey PRIMARY KEY (id);


--
-- Name: budget_line_items budget_line_items_budget_id_account_code_department_cost_ce_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_line_items
    ADD CONSTRAINT budget_line_items_budget_id_account_code_department_cost_ce_key UNIQUE (budget_id, account_code, department, cost_center);


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
-- Name: budgets budgets_tenant_id_fiscal_year_budget_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budgets
    ADD CONSTRAINT budgets_tenant_id_fiscal_year_budget_type_key UNIQUE (tenant_id, fiscal_year, budget_type);


--
-- Name: cash_flow_categories cash_flow_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_categories
    ADD CONSTRAINT cash_flow_categories_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_categories cash_flow_categories_tenant_id_category_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_categories
    ADD CONSTRAINT cash_flow_categories_tenant_id_category_code_key UNIQUE (tenant_id, category_code);


--
-- Name: cash_flow_forecasts cash_flow_forecasts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_forecasts
    ADD CONSTRAINT cash_flow_forecasts_pkey PRIMARY KEY (id);


--
-- Name: cash_flow_forecasts cash_flow_forecasts_tenant_id_forecast_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flow_forecasts
    ADD CONSTRAINT cash_flow_forecasts_tenant_id_forecast_name_key UNIQUE (tenant_id, forecast_name);


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
-- Name: coa_templates coa_templates_template_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coa_templates
    ADD CONSTRAINT coa_templates_template_name_key UNIQUE (template_name);


--
-- Name: company_profile company_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_pkey PRIMARY KEY (id);


--
-- Name: cookie_consents cookie_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cookie_consents
    ADD CONSTRAINT cookie_consents_pkey PRIMARY KEY (id);


--
-- Name: cookie_consents cookie_consents_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cookie_consents
    ADD CONSTRAINT cookie_consents_user_id_key UNIQUE (user_id);


--
-- Name: data_retention_policies data_retention_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT data_retention_policies_pkey PRIMARY KEY (id);


--
-- Name: data_retention_policies data_retention_policies_tenant_id_data_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_policies
    ADD CONSTRAINT data_retention_policies_tenant_id_data_type_key UNIQUE (tenant_id, data_type);


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
-- Name: dsr_audit_log dsr_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_audit_log
    ADD CONSTRAINT dsr_audit_log_pkey PRIMARY KEY (id);


--
-- Name: dsr_requests dsr_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_requests
    ADD CONSTRAINT dsr_requests_pkey PRIMARY KEY (id);


--
-- Name: etl_parameters etl_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etl_parameters
    ADD CONSTRAINT etl_parameters_pkey PRIMARY KEY (id);


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
-- Name: import_templates import_templates_template_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_templates
    ADD CONSTRAINT import_templates_template_type_unique UNIQUE (template_type);


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
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_plan_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_plan_name_key UNIQUE (plan_name);


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
-- Name: system_users system_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_users
    ADD CONSTRAINT system_users_email_key UNIQUE (email);


--
-- Name: system_users system_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_users
    ADD CONSTRAINT system_users_pkey PRIMARY KEY (id);


--
-- Name: tenant_approvals tenant_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_approvals
    ADD CONSTRAINT tenant_approvals_pkey PRIMARY KEY (id);


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
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenant_usage_metrics tenant_usage_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_usage_metrics
    ADD CONSTRAINT tenant_usage_metrics_pkey PRIMARY KEY (id);


--
-- Name: tenant_usage_metrics tenant_usage_metrics_tenant_id_metric_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_usage_metrics
    ADD CONSTRAINT tenant_usage_metrics_tenant_id_metric_date_key UNIQUE (tenant_id, metric_date);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: version_policies uq_policy_per_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.version_policies
    ADD CONSTRAINT uq_policy_per_type UNIQUE (tenant_id, object_type);


--
-- Name: object_versions uq_version_per_object; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.object_versions
    ADD CONSTRAINT uq_version_per_object UNIQUE (tenant_id, object_type, object_id, version_number);


--
-- Name: user_invitations user_invitations_invitation_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_invitation_token_key UNIQUE (invitation_token);


--
-- Name: user_invitations user_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_invitations
    ADD CONSTRAINT user_invitations_pkey PRIMARY KEY (id);


--
-- Name: user_tenant_memberships user_tenant_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_tenant_memberships user_tenant_memberships_user_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_user_id_tenant_id_key UNIQUE (user_id, tenant_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


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
-- Name: idx_anonymization_records_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anonymization_records_request ON public.anonymization_records USING btree (dsr_request_id);


--
-- Name: idx_anonymization_records_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anonymization_records_tenant ON public.anonymization_records USING btree (tenant_id);


--
-- Name: idx_approval_act_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_act_request ON public.approval_actions USING btree (request_id);


--
-- Name: idx_approval_chains_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_chains_tenant ON public.approval_chains USING btree (tenant_id);


--
-- Name: idx_approval_notif_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_notif_read ON public.approval_notifications USING btree (is_read);


--
-- Name: idx_approval_notif_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_notif_tenant ON public.approval_notifications USING btree (tenant_id);


--
-- Name: idx_approval_req_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_req_status ON public.approval_requests USING btree (status);


--
-- Name: idx_approval_req_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_req_tenant ON public.approval_requests USING btree (tenant_id);


--
-- Name: idx_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_status ON public.tenant_approvals USING btree (status);


--
-- Name: idx_approvals_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approvals_tenant ON public.tenant_approvals USING btree (tenant_id);


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
-- Name: idx_audit_logs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs USING btree (tenant_id);


--
-- Name: idx_audit_logs_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_ts ON public.audit_logs USING btree ("timestamp");


--
-- Name: idx_budget_allocations_budget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_allocations_budget ON public.budget_allocations USING btree (budget_id);


--
-- Name: idx_budget_allocations_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_allocations_department ON public.budget_allocations USING btree (department);


--
-- Name: idx_budget_line_items_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_line_items_account ON public.budget_line_items USING btree (account_code);


--
-- Name: idx_budget_line_items_budget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_line_items_budget ON public.budget_line_items USING btree (budget_id);


--
-- Name: idx_budget_line_items_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_line_items_department ON public.budget_line_items USING btree (department);


--
-- Name: idx_budget_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_templates_tenant ON public.budget_templates USING btree (tenant_id);


--
-- Name: idx_budget_versions_budget; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budget_versions_budget ON public.budget_versions USING btree (budget_id);


--
-- Name: idx_budgets_fiscal_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_fiscal_year ON public.budgets USING btree (fiscal_year);


--
-- Name: idx_budgets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_status ON public.budgets USING btree (status);


--
-- Name: idx_budgets_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_budgets_tenant ON public.budgets USING btree (tenant_id);


--
-- Name: idx_cf_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_categories_tenant ON public.cash_flow_categories USING btree (tenant_id);


--
-- Name: idx_cf_categories_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_categories_type ON public.cash_flow_categories USING btree (tenant_id, category_type);


--
-- Name: idx_cf_forecasts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_forecasts_status ON public.cash_flow_forecasts USING btree (tenant_id, status);


--
-- Name: idx_cf_forecasts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_forecasts_tenant ON public.cash_flow_forecasts USING btree (tenant_id);


--
-- Name: idx_cf_line_items_forecast; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_line_items_forecast ON public.cash_flow_line_items USING btree (forecast_id);


--
-- Name: idx_cf_line_items_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cf_line_items_week ON public.cash_flow_line_items USING btree (forecast_id, week_number);


--
-- Name: idx_coa_account_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_account_code ON public.chart_of_accounts USING btree (tenant_id, account_code);


--
-- Name: idx_coa_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_parent ON public.chart_of_accounts USING btree (tenant_id, parent_account_code);


--
-- Name: idx_coa_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_tenant ON public.chart_of_accounts USING btree (tenant_id);


--
-- Name: idx_coa_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coa_type ON public.chart_of_accounts USING btree (tenant_id, account_type);


--
-- Name: idx_company_profile_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_profile_tenant ON public.company_profile USING btree (tenant_id);


--
-- Name: idx_comparisons_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comparisons_object ON public.version_comparisons USING btree (tenant_id, object_type, object_id);


--
-- Name: idx_config_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_key ON public.system_config USING btree (config_key);


--
-- Name: idx_config_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_tenant ON public.system_config USING btree (tenant_id);


--
-- Name: idx_cookie_consent_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cookie_consent_user_id ON public.cookie_consents USING btree (user_id);


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
-- Name: idx_dsar_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsar_requested_at ON public.dsar_requests USING btree (requested_at);


--
-- Name: idx_dsar_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsar_status ON public.dsar_requests USING btree (status);


--
-- Name: idx_dsar_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsar_user_id ON public.dsar_requests USING btree (user_id);


--
-- Name: idx_dsr_audit_log_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_audit_log_request ON public.dsr_audit_log USING btree (dsr_request_id);


--
-- Name: idx_dsr_requests_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_due_date ON public.dsr_requests USING btree (due_date);


--
-- Name: idx_dsr_requests_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_email ON public.dsr_requests USING btree (requester_email);


--
-- Name: idx_dsr_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_status ON public.dsr_requests USING btree (status);


--
-- Name: idx_dsr_requests_tenant; Type: INDEX; Schema: public; Owner: -
--


CREATE INDEX idx_dsr_requests_tenant ON public.dsr_requests USING btree (tenant_id);


--
-- Name: idx_dsr_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_type ON public.dsr_requests USING btree (request_type);


--
-- Name: idx_etl_params_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_etl_params_tenant ON public.etl_parameters USING btree (tenant_id);


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
-- Name: idx_import_logs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_logs_date ON public.import_logs USING btree (started_at DESC);


--
-- Name: idx_import_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_logs_status ON public.import_logs USING btree (status);


--
-- Name: idx_import_logs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_logs_tenant ON public.import_logs USING btree (tenant_id);


--
-- Name: idx_import_schedules_next_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_schedules_next_run ON public.import_schedules USING btree (next_run_at);


--
-- Name: idx_import_schedules_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_schedules_status ON public.import_schedules USING btree (status);


--
-- Name: idx_import_schedules_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_schedules_tenant ON public.import_schedules USING btree (tenant_id);


--
-- Name: idx_import_templates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_templates_active ON public.import_templates USING btree (is_active);


--
-- Name: idx_import_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_templates_type ON public.import_templates USING btree (template_type);


--
-- Name: idx_imported_transactions_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imported_transactions_account ON public.imported_transactions USING btree (account_code);


--
-- Name: idx_imported_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imported_transactions_date ON public.imported_transactions USING btree (transaction_date);


--
-- Name: idx_imported_transactions_log; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imported_transactions_log ON public.imported_transactions USING btree (import_log_id);


--
-- Name: idx_imported_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imported_transactions_status ON public.imported_transactions USING btree (status);


--
-- Name: idx_imported_transactions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_imported_transactions_tenant ON public.imported_transactions USING btree (tenant_id);


--
-- Name: idx_invitations_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_tenant ON public.user_invitations USING btree (tenant_id);


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token ON public.user_invitations USING btree (invitation_token);


--
-- Name: idx_line_items_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_code ON public.financial_line_items USING btree (line_code);


--
-- Name: idx_line_items_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_line_items_statement ON public.financial_line_items USING btree (statement_id);


--
-- Name: idx_mapping_rules_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_rules_priority ON public.mapping_rules USING btree (priority DESC);


--
-- Name: idx_mapping_rules_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_rules_tenant ON public.mapping_rules USING btree (tenant_id);


--
-- Name: idx_mapping_rules_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mapping_rules_type ON public.mapping_rules USING btree (rule_type);


--
-- Name: idx_ownership_transfer_current_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_current_owner ON public.ownership_transfer_requests USING btree (current_owner_email);


--
-- Name: idx_ownership_transfer_new_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_new_owner ON public.ownership_transfer_requests USING btree (new_owner_email);


--
-- Name: idx_ownership_transfer_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_requested_at ON public.ownership_transfer_requests USING btree (requested_at DESC);


--
-- Name: idx_ownership_transfer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_status ON public.ownership_transfer_requests USING btree (status);


--
-- Name: idx_ownership_transfer_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ownership_transfer_tenant ON public.ownership_transfer_requests USING btree (tenant_id);


--
-- Name: idx_proj_stmts_projection; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proj_stmts_projection ON public.projected_statements USING btree (projection_id);


--
-- Name: idx_projections_scenario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_scenario ON public.projections USING btree (scenario_id);


--
-- Name: idx_projections_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projections_tenant ON public.projections USING btree (tenant_id);


--
-- Name: idx_system_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_users_email ON public.system_users USING btree (email);


--
-- Name: idx_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_tenant ON public.statement_templates USING btree (tenant_id);


--
-- Name: idx_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_templates_type ON public.statement_templates USING btree (statement_type);


--
-- Name: idx_tenant_approvals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_approvals_status ON public.tenant_approvals USING btree (status);


--
-- Name: idx_tenant_usage_metrics_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_usage_metrics_tenant_date ON public.tenant_usage_metrics USING btree (tenant_id, metric_date);


--
-- Name: idx_tenants_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenants_name ON public.tenants USING btree (name);


--
-- Name: idx_user_tenant_memberships_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_tenant_memberships_tenant_id ON public.user_tenant_memberships USING btree (tenant_id);


--
-- Name: idx_user_tenant_memberships_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_tenant_memberships_user_id ON public.user_tenant_memberships USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: idx_versions_change_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_change_type ON public.object_versions USING btree (change_type);


--
-- Name: idx_versions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_created_at ON public.object_versions USING btree (created_at DESC);


--
-- Name: idx_versions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_created_by ON public.object_versions USING btree (tenant_id, created_by);


--
-- Name: idx_versions_tenant_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_versions_tenant_object ON public.object_versions USING btree (tenant_id, object_type, object_id);


--
-- Name: cash_flow_line_items recalc_cash_positions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER recalc_cash_positions AFTER INSERT OR UPDATE ON public.cash_flow_line_items FOR EACH ROW EXECUTE FUNCTION public.trigger_recalculate_cash_positions();


--
-- Name: cookie_consents update_cookie_consents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cookie_consents_updated_at BEFORE UPDATE ON public.cookie_consents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: dsar_requests update_dsar_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_dsar_requests_updated_at BEFORE UPDATE ON public.dsar_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: anonymization_records anonymization_dsr_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anonymization_records
    ADD CONSTRAINT anonymization_dsr_fk FOREIGN KEY (dsr_request_id) REFERENCES public.dsr_requests(id) ON DELETE CASCADE;


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
-- Name: budget_templates budget_templates_source_budget_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.budget_templates
    ADD CONSTRAINT budget_templates_source_budget_id_fkey FOREIGN KEY (source_budget_id) REFERENCES public.budgets(id) ON DELETE SET NULL;


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
-- Name: dsr_audit_log dsr_audit_log_request_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_audit_log
    ADD CONSTRAINT dsr_audit_log_request_fk FOREIGN KEY (dsr_request_id) REFERENCES public.dsr_requests(id) ON DELETE CASCADE;


--
-- Name: dsr_requests dsr_requests_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_requests
    ADD CONSTRAINT dsr_requests_tenant_fk FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: financial_line_items financial_line_items_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_line_items
    ADD CONSTRAINT financial_line_items_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.financial_statements(id) ON DELETE CASCADE;


--
-- Name: import_logs import_logs_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.import_schedules(id) ON DELETE SET NULL;


--
-- Name: import_logs import_logs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_logs
    ADD CONSTRAINT import_logs_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.import_templates(id) ON DELETE SET NULL;


--
-- Name: import_schedules import_schedules_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_schedules
    ADD CONSTRAINT import_schedules_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.import_templates(id) ON DELETE SET NULL;


--
-- Name: imported_transactions imported_transactions_import_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_transactions
    ADD CONSTRAINT imported_transactions_import_log_id_fkey FOREIGN KEY (import_log_id) REFERENCES public.import_logs(id) ON DELETE CASCADE;


--
-- Name: projected_statements projected_statements_projection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projected_statements
    ADD CONSTRAINT projected_statements_projection_id_fkey FOREIGN KEY (projection_id) REFERENCES public.projections(id) ON DELETE CASCADE;


--
-- Name: scenario_assumptions scenario_assumptions_scenario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scenario_assumptions
    ADD CONSTRAINT scenario_assumptions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.scenarios(id) ON DELETE CASCADE;


--
-- Name: tenant_subscriptions tenant_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: user_tenant_memberships user_tenant_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenant_memberships
    ADD CONSTRAINT user_tenant_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.system_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict gkpv0WRorACnvtb0aByqAE4dbhHQ6ulJpahaSnAKjb6hblaLKa3sGXRsWQvK0ao

