#!/bin/bash
# =============================================================================
# CFO Platform — UAT / Local Development Setup Script
# =============================================================================
# รัน script นี้เพื่อสร้างระบบใหม่ทั้งหมดบนเครื่อง UAT / local
#
# Usage:
#   chmod +x uat-setup.sh
#   ./uat-setup.sh                  # full setup (default)
#   ./uat-setup.sh --skip-build     # skip docker build (re-use existing images)
#   ./uat-setup.sh --skip-keycloak  # skip creating Keycloak users
#   ./uat-setup.sh --reset          # destroy volumes first, then full setup
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Flags ───────────────────────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_KEYCLOAK=false
RESET_VOLUMES=false
for arg in "$@"; do
  case $arg in
    --skip-build)    SKIP_BUILD=true ;;
    --skip-keycloak) SKIP_KEYCLOAK=true ;;
    --reset)         RESET_VOLUMES=true ;;
  esac
done

# ─── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
BACKEND_DIR="$SCRIPT_DIR/backend"
BACKEND_API="http://localhost:3000"
KEYCLOAK_URL="http://localhost:8081"
DEMO_TOKEN="demo-token-super-admin"
DOCKER_STARTUP_TIMEOUT=180  # seconds to wait for backend to become healthy

# ─── Helper functions ────────────────────────────────────────────────────────
log()    { echo -e "${BOLD}[$(date +%H:%M:%S)]${NC} $*"; }
ok()     { echo -e "${GREEN}  ✅ $*${NC}"; }
warn()   { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
fail()   { echo -e "${RED}  ❌ $*${NC}"; }
section(){ echo -e "\n${CYAN}${BOLD}══════════════════════════════════════${NC}"; echo -e "${CYAN}${BOLD}  $*${NC}"; echo -e "${CYAN}${BOLD}══════════════════════════════════════${NC}"; }

run_sql() {
  # run_sql <db> <file>
  local db="$1" file="$2"
  docker exec -i infra-db-1 psql -U postgres -d "$db" < "$file" 2>&1
}

run_sql_silent() {
  # run silently; print only last meaningful line
  run_sql "$1" "$2" | grep -E "^(CREATE|INSERT|ALTER|DROP|COMMIT|UPDATE)" | tail -3 || true
}

tenant_api_create() {
  # tenant_api_create <name> <id>
  local name="$1" id="$2"
  curl -sf -X POST "$BACKEND_API/tenant" \
    -H "Authorization: Bearer $DEMO_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$name\", \"id\": \"$id\"}" 2>&1
}

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║   CFO Platform  —  UAT Setup Script     ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════╝${NC}"
echo -e "   ${CYAN}Target:${NC}  $(hostname)  $(date '+%Y-%m-%d %H:%M')"
echo -e "   ${CYAN}Options:${NC} skip-build=$SKIP_BUILD  skip-keycloak=$SKIP_KEYCLOAK  reset=$RESET_VOLUMES"
echo ""

# =============================================================================
section "Step 1 — Docker Daemon"
# =============================================================================
log "Checking Docker..."
if ! command -v docker &>/dev/null; then
  fail "docker CLI not found. Install Docker Desktop: https://www.docker.com/get-started"
  exit 1
fi
ok "Docker CLI found ($(docker --version | cut -d' ' -f3 | tr -d ','))"

if ! docker info &>/dev/null; then
  warn "Docker daemon not running — attempting to start Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker || true
  fi
  elapsed=0
  interval=3
  while ! docker info &>/dev/null; do
    sleep $interval
    elapsed=$((elapsed + interval))
    echo -ne "\r   Waiting for daemon... ${elapsed}s/${DOCKER_STARTUP_TIMEOUT}s "
    if [[ $elapsed -ge $DOCKER_STARTUP_TIMEOUT ]]; then
      echo ""
      fail "Timed out. Run 'open -a Docker' manually and retry."
      exit 1
    fi
  done
  echo ""
fi
ok "Docker daemon is running"

# =============================================================================
section "Step 2 — Start Containers"
# =============================================================================
cd "$INFRA_DIR"
log "Working directory: $INFRA_DIR"

if [[ "$RESET_VOLUMES" == "true" ]]; then
  warn "Resetting — destroying all volumes..."
  docker compose down -v --remove-orphans 2>&1 | tail -3
  ok "Volumes cleared"
fi

if [[ "$SKIP_BUILD" == "true" ]]; then
  log "Starting containers (skip build)..."
  docker compose up -d 2>&1 | tail -6
else
  log "Building & starting containers..."
  docker compose up -d --build 2>&1 | tail -6
fi

ok "Compose up done"

# Wait for DB to be healthy
log "Waiting for PostgreSQL to be ready..."
elapsed=0
while ! docker exec infra-db-1 pg_isready -U postgres -q 2>/dev/null; do
  sleep 2; elapsed=$((elapsed + 2))
  if [[ $elapsed -ge 60 ]]; then fail "PostgreSQL not ready after 60s"; exit 1; fi
done
ok "PostgreSQL is ready"

# Wait for backend to be healthy
log "Waiting for backend API to be ready (max ${DOCKER_STARTUP_TIMEOUT}s)..."
elapsed=0
while ! curl -sf "$BACKEND_API/health" &>/dev/null; do
  sleep 3; elapsed=$((elapsed + 3))
  echo -ne "\r   Backend starting... ${elapsed}s "
  if [[ $elapsed -ge $DOCKER_STARTUP_TIMEOUT ]]; then
    echo ""
    fail "Backend not healthy after ${DOCKER_STARTUP_TIMEOUT}s. Check logs: docker compose logs backend"
    exit 1
  fi
done
echo ""
ok "Backend API is ready"

# =============================================================================
section "Step 3 — Central Database Schema (postgres)"
# =============================================================================
log "Running init scripts on main 'postgres' database..."

INIT_SCRIPTS=(
  "init/00_create_super_admin_schema.sql"
  "init/create_tenant_secrets.sql"
  "init/create_financial_schema.sql"
  "init/create_coa_tables.sql"
  "init/create_budget_tables.sql"
  "init/create_cashflow_forecast_schema.sql"
  "init/create_enhanced_etl_tables.sql"
  "init/create_missing_tables.sql"
  "init/create_phase2_tables.sql"
  "init/create_ownership_transfer_schema.sql"
  "init/create_privacy_schema.sql"
  "init/create_version_control_schema.sql"
)

ERRORS=0
for f in "${INIT_SCRIPTS[@]}"; do
  if [[ -f "$f" ]]; then
    OUT=$(docker exec -i infra-db-1 psql -U postgres -d postgres < "$f" 2>&1)
    # Only treat real errors (not NOTICE/already-exists/duplicate-key) as failures
    ERR=$(echo "$OUT" | grep "^ERROR:" | grep -v "already exists\|duplicate key" || true)
    if [[ -n "$ERR" ]]; then
      warn "$f: $ERR"
      ERRORS=$((ERRORS + 1))
    else
      ok "$f"
    fi
  else
    warn "Not found (skip): $f"
  fi
done

# DSR migration
DSR_MIGRATION="$BACKEND_DIR/src/database/migrations/007_create_dsr_tables.sql"
if [[ -f "$DSR_MIGRATION" ]]; then
  docker exec -i infra-db-1 psql -U postgres -d postgres < "$DSR_MIGRATION" &>/dev/null || true
  ok "DSR migration"
fi

if [[ $ERRORS -gt 0 ]]; then
  warn "$ERRORS init script(s) had errors (may still be OK if tables already existed)"
fi

# =============================================================================
section "Step 4 — Create Tenants via API"
# =============================================================================
log "Creating tenants through backend API..."

# Admin Tenant
log "Creating 'Admin Tenant' (id: admin)..."
RESULT=$(tenant_api_create "Admin Tenant" "admin" 2>&1 || true)
if echo "$RESULT" | grep -q "already exists\|Tenant database created\|created"; then
  ok "Admin Tenant ready"
elif echo "$RESULT" | grep -q '"id"'; then
  ok "Admin Tenant created"
else
  # Try to verify it exists already
  EXISTING=$(curl -sf "$BACKEND_API/tenant/admin" \
    -H "Authorization: Bearer $DEMO_TOKEN" 2>/dev/null | grep -c '"id"' || true)
  if [[ "$EXISTING" -gt 0 ]]; then
    ok "Admin Tenant already exists"
  else
    warn "Admin Tenant: $RESULT"
  fi
fi

# Acme Corp Tenant
log "Creating 'Acme Corp' (id: 155cf73a2fe388f0)..."
RESULT=$(tenant_api_create "Acme Corp" "155cf73a2fe388f0" 2>&1 || true)
if echo "$RESULT" | grep -q '"id"'; then
  ok "Acme Corp Tenant created"
else
  EXISTING=$(curl -sf "$BACKEND_API/tenant/155cf73a2fe388f0" \
    -H "Authorization: Bearer $DEMO_TOKEN" 2>/dev/null | grep -c '"id"' || true)
  if [[ "$EXISTING" -gt 0 ]]; then
    ok "Acme Corp Tenant already exists"
  else
    warn "Acme Corp: $RESULT"
  fi
fi

# Get actual db names from API
ADMIN_DB=$(curl -sf "$BACKEND_API/tenant/admin" \
  -H "Authorization: Bearer $DEMO_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dbName','tenant_admin_tenant_admin'))" 2>/dev/null || echo "tenant_admin_tenant_admin")
ACME_DB=$(curl -sf "$BACKEND_API/tenant/155cf73a2fe388f0" \
  -H "Authorization: Bearer $DEMO_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dbName','tenant_acme_corp_155cf73a2fe388f0'))" 2>/dev/null || echo "tenant_acme_corp_155cf73a2fe388f0")

ok "Admin DB: $ADMIN_DB"
ok "Acme  DB: $ACME_DB"

# =============================================================================
section "Step 5 — Tenant Schema & Migrations"
# =============================================================================
apply_tenant_schema() {
  local db="$1"
  local label="$2"
  log "Applying full schema on: $db ($label)"

  # Full schema
  if [[ -f "$INFRA_DIR/create-tenant-schema.sql" ]]; then
    docker exec -i infra-db-1 psql -U postgres -d "$db" < "$INFRA_DIR/create-tenant-schema.sql" &>/dev/null
    ok "  create-tenant-schema.sql"
  fi

  # Fix scripts (apply to both tenant DBs)
  for fix_file in \
    "fix-schema-mismatch.sql" \
    "fix-financial-schema.sql" \
    "fix-projections-schema.sql"; do
    if [[ -f "$INFRA_DIR/$fix_file" ]]; then
      docker exec -i infra-db-1 psql -U postgres -d "$db" < "$INFRA_DIR/$fix_file" &>/dev/null || true
      ok "  $fix_file"
    fi
  done
}

apply_tenant_schema "$ADMIN_DB" "Admin Tenant"

# Admin-specific scripts
for f in "init-admin-tables.sql" "migrate-admin-tenant.sql" "fix-admin-schema.sql"; do
  if [[ -f "$INFRA_DIR/$f" ]]; then
    docker exec -i infra-db-1 psql -U postgres -d "$ADMIN_DB" < "$INFRA_DIR/$f" &>/dev/null || true
    ok "  $f (admin-only)"
  fi
done

apply_tenant_schema "$ACME_DB" "Acme Corp"

# =============================================================================
section "Step 6 — Seed Data"
# =============================================================================
log "Seeding system users & tenant memberships..."
if [[ -f "$INFRA_DIR/seed-tenant-users.sql" ]]; then
  docker exec -i infra-db-1 psql -U postgres -d postgres < "$INFRA_DIR/seed-tenant-users.sql" &>/dev/null
  ok "seed-tenant-users.sql (admin, analyst, viewer users seeded)"
fi

log "Seeding superadmin system user..."
if [[ -f "$INFRA_DIR/insert-superadmin.sql" ]]; then
  docker exec -i infra-db-1 psql -U postgres -d postgres < "$INFRA_DIR/insert-superadmin.sql" &>/dev/null
  ok "insert-superadmin.sql"
fi

log "Seeding Chart of Accounts for Admin Tenant..."
if [[ -f "$INFRA_DIR/init-admin-coa.sql" ]]; then
  docker exec -i infra-db-1 psql -U postgres -d "$ADMIN_DB" < "$INFRA_DIR/init-admin-coa.sql" &>/dev/null || true
  ok "init-admin-coa.sql (20 accounts)"
fi

# =============================================================================
section "Step 7 — Keycloak Users (optional)"
# =============================================================================
if [[ "$SKIP_KEYCLOAK" == "true" ]]; then
  warn "Skipped (--skip-keycloak flag is set)"
else
  log "Waiting for Keycloak to be ready..."
  elapsed=0
  while ! curl -sf "$KEYCLOAK_URL/realms/master" &>/dev/null; do
    sleep 3; elapsed=$((elapsed + 3))
    if [[ $elapsed -ge 120 ]]; then
      warn "Keycloak not ready after 120s — skipping user creation"
      SKIP_KEYCLOAK=true
      break
    fi
  done

  if [[ "$SKIP_KEYCLOAK" != "true" ]]; then
    ok "Keycloak is up"
    log "Getting Keycloak admin token..."
    ADMIN_TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

    if [[ -z "$ADMIN_TOKEN" ]] || [[ "$ADMIN_TOKEN" == "null" ]]; then
      warn "Could not get Keycloak admin token — skipping user creation"
    else
      ok "Keycloak admin token obtained"

      kc_create_user() {
        local username="$1" email="$2" fn="$3" ln="$4" pwd="$5"
        HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
          "$KEYCLOAK_URL/admin/realms/master/users" \
          -H "Authorization: Bearer $ADMIN_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"username\":\"$username\",\"email\":\"$email\",\"firstName\":\"$fn\",\"lastName\":\"$ln\",\"enabled\":true,\"emailVerified\":true}")
        # 201 = created, 409 = already exists — both are OK
        if [[ "$HTTP" == "201" ]] || [[ "$HTTP" == "409" ]]; then
          USER_ID=$(curl -sf \
            "$KEYCLOAK_URL/admin/realms/master/users?username=$username" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            | python3 -c "import sys,json; users=json.load(sys.stdin); print(users[0]['id'] if users else '')" 2>/dev/null || echo "")
          if [[ -n "$USER_ID" ]]; then
            curl -sf -X PUT \
              "$KEYCLOAK_URL/admin/realms/master/users/$USER_ID/reset-password" \
              -H "Authorization: Bearer $ADMIN_TOKEN" \
              -H "Content-Type: application/json" \
              -d "{\"type\":\"password\",\"value\":\"$pwd\",\"temporary\":false}" &>/dev/null || true
          fi
          ok "Keycloak user: $email"
        else
          warn "Keycloak user $email: HTTP $HTTP"
        fi
      }

      # Admin users
      kc_create_user "admin-user"    "admin@admin.local"    "Admin"  "User"     "Secret123!"
      kc_create_user "analyst-user"  "analyst@admin.local"  "Admin"  "Analyst"  "Secret123!"
      kc_create_user "viewer-user"   "viewer@admin.local"   "Admin"  "Viewer"   "Secret123!"
      # Acme Corp users
      kc_create_user "acme-admin"    "admin@acmecorp.local"    "Acme"  "Admin"    "Secret123!"
      kc_create_user "acme-analyst"  "analyst@acmecorp.local"  "Acme"  "Analyst"  "Secret123!"
      kc_create_user "acme-viewer"   "viewer@acmecorp.local"    "Acme"  "Viewer"   "Secret123!"
      # Superadmin
      kc_create_user "superadmin"    "superadmin@system.local"  "Super"  "Admin"   "SuperAdmin123!"
    fi
  fi
fi

# =============================================================================
section "Step 8 — Verification"
# =============================================================================
log "Verifying setup..."

# Tenants
TENANT_COUNT=$(curl -sf "$BACKEND_API/tenant" \
  -H "Authorization: Bearer $DEMO_TOKEN" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
ok "Tenants in API: $TENANT_COUNT"

# System users
USER_COUNT=$(docker exec infra-db-1 psql -U postgres -d postgres -tAc \
  "SELECT COUNT(*) FROM system_users;" 2>/dev/null | tr -d ' ' || echo "?")
ok "System users in DB: $USER_COUNT"

# COA
COA_COUNT=$(docker exec infra-db-1 psql -U postgres -d "$ADMIN_DB" -tAc \
  "SELECT COUNT(*) FROM chart_of_accounts;" 2>/dev/null | tr -d ' ' || echo "?")
ok "Chart of Accounts (admin tenant): $COA_COUNT"

# DB containers
RUNNING=$(docker ps --filter "name=infra-" --format "{{.Names}}|{{.Status}}" | tr '\n' '  ')
ok "Running containers: $RUNNING"

# =============================================================================
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║              ✅  UAT Setup Complete!                ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Service URLs:${NC}"
echo -e "  Frontend  →  ${CYAN}http://localhost:8080${NC}"
echo -e "  Backend   →  ${CYAN}http://localhost:3000${NC}"
echo -e "  API Docs  →  ${CYAN}http://localhost:3000/api-docs${NC}"
echo -e "  Keycloak  →  ${CYAN}http://localhost:8081${NC}"
echo ""
echo -e "${BOLD}Test Accounts:${NC}  (ใช้ demo token หรือ login ผ่าน Keycloak)"
echo -e "  ${YELLOW}Tenant: Admin${NC}"
echo -e "    admin@admin.local    / Secret123!  (role: admin)"
echo -e "    analyst@admin.local  / Secret123!  (role: analyst)"
echo -e "    viewer@admin.local   / Secret123!  (role: viewer)"
echo -e "  ${YELLOW}Tenant: Acme Corp${NC}"
echo -e "    admin@acmecorp.local    / Secret123!  (role: admin)"
echo -e "    analyst@acmecorp.local  / Secret123!  (role: analyst)"
echo -e "    viewer@acmecorp.local   / Secret123!  (role: viewer)"
echo -e "  ${YELLOW}Super Admin${NC}"
echo -e "    superadmin@system.local / SuperAdmin123!"
echo ""
echo -e "${BOLD}Demo Tokens (ทดสอบ API ตรง):${NC}"
echo -e "  Bearer ${CYAN}demo-token-super-admin${NC}   → super admin"
echo -e "  Bearer ${CYAN}demo-token-admin${NC}  + Header ${CYAN}X-Tenant-Id: admin${NC}"
echo -e "  Bearer ${CYAN}demo-token-analyst${NC} + Header ${CYAN}X-Tenant-Id: 155cf73a2fe388f0${NC}"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo -e "  View logs:   ${CYAN}cd infra && docker compose logs -f backend${NC}"
echo -e "  Stop all:    ${CYAN}cd infra && docker compose down${NC}"
echo -e "  Reset+rerun: ${CYAN}./uat-setup.sh --reset${NC}"
echo ""
