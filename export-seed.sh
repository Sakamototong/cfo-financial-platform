#!/bin/bash
# =============================================================================
# Export Local DB → Seed for UAT
# =============================================================================
# รัน script นี้บนเครื่อง local เพื่อ dump ข้อมูลทั้งหมดออกมาเป็นไฟล์
# แล้วนำ seed-dump/ ไปวางบน UAT แล้วรัน import-seed.sh
#
# Usage:
#   chmod +x export-seed.sh
#   ./export-seed.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BOLD}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✅ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠️  $*${NC}"; }
fail() { echo -e "${RED}  ❌ $*${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP_DIR="$SCRIPT_DIR/seed-dump"
CONTAINER="infra-db-1"
PG_USER="postgres"
BACKEND_API="http://localhost:3000"
DEMO_TOKEN="demo-token-super-admin"

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║   CFO Platform  —  Export Local Seed    ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo -e "   Output: ${CYAN}$DUMP_DIR${NC}"
echo ""

# ─── Pre-checks ──────────────────────────────────────────────────────────────
log "Checking Docker..."
docker info &>/dev/null || fail "Docker daemon not running"
docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" || \
  fail "Container '$CONTAINER' not running. Run: cd infra && docker compose up -d"
ok "Container is running"

log "Checking backend API..."
curl -sf "$BACKEND_API/health" &>/dev/null || \
  fail "Backend API not responding at $BACKEND_API. Run: cd infra && docker compose up -d"
ok "Backend API is ready"

# ─── Discover DB names ───────────────────────────────────────────────────────
log "Discovering tenant databases..."
ADMIN_DB=$(curl -sf "$BACKEND_API/tenant/admin" \
  -H "Authorization: Bearer $DEMO_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dbName','tenant_admin_tenant_admin'))" 2>/dev/null \
  || echo "tenant_admin_tenant_admin")

ACME_DB=$(curl -sf "$BACKEND_API/tenant/155cf73a2fe388f0" \
  -H "Authorization: Bearer $DEMO_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('dbName','tenant_acme_corp_155cf73a2fe388f0'))" 2>/dev/null \
  || echo "tenant_acme_corp_155cf73a2fe388f0")

ALL_TENANT_DBS=$(docker exec "$CONTAINER" psql -U "$PG_USER" -tAc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'tenant_%' ORDER BY datname;" 2>/dev/null || echo "")

ok "Main DB      → postgres"
ok "Admin DB     → $ADMIN_DB"
ok "Acme DB      → $ACME_DB"

# ─── Create output directory ─────────────────────────────────────────────────
rm -rf "$DUMP_DIR"
mkdir -p "$DUMP_DIR"
log "Created: $DUMP_DIR"
echo ""

# ─── Dump helper ─────────────────────────────────────────────────────────────
dump_db() {
  local db="$1"
  local outfile="$2"
  local label="$3"

  # Check DB exists
  docker exec "$CONTAINER" psql -U "$PG_USER" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db';" 2>/dev/null | grep -q 1 || {
    warn "$db ไม่มีอยู่ใน Postgres — ข้าม"
    return
  }

  log "Dumping: $label ($db) ..."
  docker exec "$CONTAINER" pg_dump -U "$PG_USER" -d "$db" \
    --no-owner --no-acl \
    --file="/tmp/cfo_dump_tmp.sql"
  docker cp "$CONTAINER:/tmp/cfo_dump_tmp.sql" "$DUMP_DIR/$outfile"
  docker exec "$CONTAINER" rm -f /tmp/cfo_dump_tmp.sql
  SIZE=$(du -sh "$DUMP_DIR/$outfile" | cut -f1)
  ok "$outfile ($SIZE)"
}

# ─── Dump all databases ───────────────────────────────────────────────────────
dump_db "postgres"  "01_postgres.sql"     "Main DB (tenants, system_users, billing)"
dump_db "$ADMIN_DB" "02_admin_tenant.sql" "Admin Tenant"
dump_db "$ACME_DB"  "03_acme_tenant.sql"  "Acme Corp Tenant"

# Extra tenant DBs
IDX=4
if [[ -n "$ALL_TENANT_DBS" ]]; then
  while IFS= read -r db; do
    if [[ -n "$db" ]] && [[ "$db" != "$ADMIN_DB" ]] && [[ "$db" != "$ACME_DB" ]]; then
      dump_db "$db" "0${IDX}_${db}.sql" "Extra tenant: $db"
      IDX=$((IDX + 1))
    fi
  done <<< "$ALL_TENANT_DBS"
fi

# ─── Save metadata ───────────────────────────────────────────────────────────
cat > "$DUMP_DIR/meta.txt" << EOF
CFO Platform — Local DB Seed Export
Exported:  $(date '+%Y-%m-%d %H:%M:%S')
Source:    $(hostname)
ADMIN_DB:  $ADMIN_DB
ACME_DB:   $ACME_DB
EOF
ok "meta.txt saved"

# ─── Generate import script ───────────────────────────────────────────────────
log "Generating import-seed.sh ..."
cat > "$DUMP_DIR/import-seed.sh" << 'IMPORT_EOF'
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
IMPORT_EOF

chmod +x "$DUMP_DIR/import-seed.sh"
ok "import-seed.sh generated"

# ─── Final summary ────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         ✅  Export Complete!             ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Files:${NC}"
ls -lh "$DUMP_DIR/"
echo ""
echo -e "${BOLD}ขั้นตอนต่อไป:${NC}"
echo ""
echo -e "  1. ส่งไปยัง UAT (192.168.3.13):"
echo -e "     ${CYAN}scp -r seed-dump/ <user>@192.168.3.13:~/${NC}"
echo ""
echo -e "  2. SSH เข้า UAT แล้ว setup containers ก่อน (ถ้ายังไม่ได้ทำ):"
echo -e "     ${CYAN}ssh <user>@192.168.3.13${NC}"
echo -e "     ${CYAN}cd /path/to/project && ./uat-setup.sh --skip-keycloak${NC}"
echo ""
echo -e "  3. Import seed:"
echo -e "     ${CYAN}cd ~/seed-dump && chmod +x import-seed.sh && ./import-seed.sh${NC}"
echo ""
