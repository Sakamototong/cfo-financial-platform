#!/bin/bash
# =============================================================================
# Import Seed DB → UAT Server
# =============================================================================
# วางไว้ใน seed-dump/ แล้วรัน: chmod +x import-seed.sh && ./import-seed.sh
# หมายเหตุ: ต้อง setup containers ก่อนด้วย uat-setup.sh --skip-keycloak
#            หรืออย่างน้อยให้ infra-db-1 container รันอยู่
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BOLD}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
fail() { echo -e "${RED}  ❌ $*${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="infra-db-1"
PG_USER="postgres"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   CFO Platform  —  Import Seed to UAT   ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Show metadata ─────────────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/meta.txt" ]]; then
  echo -e "${CYAN}--- Seed Info ---${NC}"
  cat "$SCRIPT_DIR/meta.txt"
  echo ""
fi

# ── Pre-checks ────────────────────────────────────────────────────────────────
docker info &>/dev/null || fail "Docker not running"
docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" || \
  fail "Container '$CONTAINER' not found. รัน: cd /opt/cfo-platform/infra && docker compose up -d db"
ok "Container $CONTAINER is running"

# ── Read DB names from meta.txt ───────────────────────────────────────────────
ADMIN_DB=$(grep "^ADMIN_DB:" "$SCRIPT_DIR/meta.txt" | awk '{print $2}' 2>/dev/null || echo "tenant_admin_tenant_admin")
ACME_DB=$(grep  "^ACME_DB:"  "$SCRIPT_DIR/meta.txt" | awk '{print $2}' 2>/dev/null || echo "tenant_acme_corp_155cf73a2fe388f0")

# ── Confirm ───────────────────────────────────────────────────────────────────
echo -e "${YELLOW}⚠️  จะ OVERWRITE databases ต่อไปนี้:${NC}"
echo -e "   - postgres   (system_users, tenants, billing)"
echo -e "   - $ADMIN_DB"
echo -e "   - $ACME_DB"
echo ""
read -rp "ยืนยันดำเนินการต่อ? (y/N) " CONFIRM
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "ยกเลิก"; exit 0; }
echo ""

# ── Restore helper ────────────────────────────────────────────────────────────
restore_db() {
  local file="$1"
  local db="$2"
  local label="$3"

  [[ -f "$SCRIPT_DIR/$file" ]] || { warn "$file ไม่พบ — ข้าม $label"; return; }

  log "Restoring: $label ($db) ..."

  # Create DB if not exists
  docker exec "$CONTAINER" psql -U "$PG_USER" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db';" 2>/dev/null | grep -q 1 || \
    docker exec "$CONTAINER" createdb -U "$PG_USER" "$db"

  # Kill existing connections
  docker exec "$CONTAINER" psql -U "$PG_USER" -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname='$db' AND pid <> pg_backend_pid();" &>/dev/null || true

  # Copy + restore
  docker cp "$SCRIPT_DIR/$file" "$CONTAINER:/tmp/restore_input.sql"
  docker exec "$CONTAINER" psql -U "$PG_USER" -d "$db" \
    -f /tmp/restore_input.sql > /dev/null 2>&1 || \
    docker exec "$CONTAINER" psql -U "$PG_USER" -d "$db" \
      -f /tmp/restore_input.sql 2>&1 | grep -E "^(ERROR|FATAL)" | head -5 || true
  docker exec "$CONTAINER" rm -f /tmp/restore_input.sql
  ok "$label restored"
}

# ── Restore all DBs ───────────────────────────────────────────────────────────
restore_db "01_postgres.sql"     "postgres"   "Main DB"
restore_db "02_admin_tenant.sql" "$ADMIN_DB"  "Admin Tenant"
restore_db "03_acme_tenant.sql"  "$ACME_DB"   "Acme Corp"

# Extra tenant DBs (04+ files)
for f in "$SCRIPT_DIR"/0[4-9]_*.sql; do
  if [[ -f "$f" ]]; then
    fname=$(basename "$f")
    db_name="${fname#0?_}"; db_name="${db_name%.sql}"
    restore_db "$fname" "$db_name" "Extra tenant: $db_name"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         ✅  Import Complete!             ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "ตรวจสอบระบบด้วย: ${CYAN}./health-check-uat.sh${NC}"
echo ""
