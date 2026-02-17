#!/bin/bash
# Backup script for CFO Platform
# Creates full backup of databases and configuration files

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "CFO Platform - Backup Script"
echo "=========================================="
echo ""

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="cfo-backup-${TIMESTAMP}"
MAX_BACKUPS=7  # Keep last 7 backups

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "📦 Starting backup process..."
echo "Backup location: $BACKUP_DIR/$BACKUP_NAME"
echo ""

# Step 1: Backup all databases
echo "💾 Step 1: Backing up databases..."

if [ -d "infra" ]; then
    cd infra
fi

# Backup all databases
docker-compose exec -T db pg_dumpall -U postgres > "$BACKUP_DIR/${BACKUP_NAME}-all-databases.sql"
FILE_SIZE=$(du -h "$BACKUP_DIR/${BACKUP_NAME}-all-databases.sql" | cut -f1)
echo -e "${GREEN}✅ All databases backed up (${FILE_SIZE})${NC}"

# Backup individual tenant databases
DATABASES=$(docker-compose exec -T db psql -U postgres -t -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres';")

for db in $DATABASES; do
    db=$(echo $db | tr -d '[:space:]')
    if [ ! -z "$db" ]; then
        docker-compose exec -T db pg_dump -U postgres -d "$db" > "$BACKUP_DIR/${BACKUP_NAME}-${db}.sql"
        DB_SIZE=$(du -h "$BACKUP_DIR/${BACKUP_NAME}-${db}.sql" | cut -f1)
        echo -e "${GREEN}✅ Database '${db}' backed up (${DB_SIZE})${NC}"
    fi
done

echo ""

# Step 2: Backup configuration files
echo "📄 Step 2: Backing up configuration files..."

cd ..
CONFIG_BACKUP="$BACKUP_DIR/${BACKUP_NAME}-config.tar.gz"

tar -czf "$CONFIG_BACKUP" \
    .env \
    infra/docker-compose.yml \
    --exclude='node_modules' \
    --exclude='.git' \
    2>/dev/null || true

CONFIG_SIZE=$(du -h "$CONFIG_BACKUP" | cut -f1)
echo -e "${GREEN}✅ Configuration files backed up (${CONFIG_SIZE})${NC}"
echo ""

# Step 3: Backup logs (optional)
echo "📋 Step 3: Backing up logs..."

LOGS_BACKUP="$BACKUP_DIR/${BACKUP_NAME}-logs.tar.gz"

cd infra
docker-compose logs > "$BACKUP_DIR/${BACKUP_NAME}-docker-logs.txt" 2>&1 || true

if [ -d "../logs" ]; then
    tar -czf "$LOGS_BACKUP" ../logs/ 2>/dev/null || true
    LOGS_SIZE=$(du -h "$LOGS_BACKUP" | cut -f1)
    echo -e "${GREEN}✅ Logs backed up (${LOGS_SIZE})${NC}"
else
    echo -e "${YELLOW}⚠️  No logs directory found${NC}"
fi

cd ..
echo ""

# Step 4: Create manifest file
echo "📝 Step 4: Creating backup manifest..."

cat > "$BACKUP_DIR/${BACKUP_NAME}-manifest.txt" << EOF
CFO Platform Backup Manifest
============================

Backup Date: $(date)
Backup Name: ${BACKUP_NAME}
Server: $(hostname)
Server IP: $(hostname -I | awk '{print $1}')

Files:
------
EOF

ls -lh "$BACKUP_DIR/${BACKUP_NAME}"* | awk '{print $9, "-", $5}' >> "$BACKUP_DIR/${BACKUP_NAME}-manifest.txt"

cat >> "$BACKUP_DIR/${BACKUP_NAME}-manifest.txt" << EOF

Docker Containers:
------------------
EOF

cd infra
docker-compose ps >> "$BACKUP_DIR/${BACKUP_NAME}-manifest.txt"
cd ..

echo -e "${GREEN}✅ Manifest created${NC}"
echo ""

# Step 5: Compress all backup files
echo "🗜️  Step 5: Compressing backup..."

FINAL_BACKUP="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"

tar -czf "$FINAL_BACKUP" \
    "$BACKUP_DIR/${BACKUP_NAME}"* \
    2>/dev/null

# Remove individual files after compression
rm -f "$BACKUP_DIR/${BACKUP_NAME}"-*.sql
rm -f "$BACKUP_DIR/${BACKUP_NAME}"-config.tar.gz
rm -f "$BACKUP_DIR/${BACKUP_NAME}"-logs.tar.gz
rm -f "$BACKUP_DIR/${BACKUP_NAME}"-manifest.txt

FINAL_SIZE=$(du -h "$FINAL_BACKUP" | cut -f1)
echo -e "${GREEN}✅ Backup compressed: ${FINAL_SIZE}${NC}"
echo ""

# Step 6: Cleanup old backups
echo "🧹 Step 6: Cleaning up old backups..."

BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/cfo-backup-*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    OLD_BACKUPS=$(ls -1t "$BACKUP_DIR"/cfo-backup-*.tar.gz | tail -n +$((MAX_BACKUPS + 1)))
    for old_backup in $OLD_BACKUPS; do
        rm -f "$old_backup"
        echo -e "${YELLOW}🗑️  Deleted old backup: $(basename $old_backup)${NC}"
    done
else
    echo -e "${GREEN}✅ No old backups to clean (keeping last ${MAX_BACKUPS})${NC}"
fi

echo ""

# Step 7: Verify backup
echo "🔍 Step 7: Verifying backup..."

if tar -tzf "$FINAL_BACKUP" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backup verification successful${NC}"
else
    echo -e "${RED}❌ Backup verification failed${NC}"
    exit 1
fi

echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}✅ Backup Complete!${NC}"
echo "=========================================="
echo ""
echo "📦 Backup file: $FINAL_BACKUP"
echo "💾 Size: $FINAL_SIZE"
echo "📅 Created: $(date)"
echo ""
echo "🔄 To restore this backup:"
echo "   ./restore-backup.sh $FINAL_BACKUP"
echo ""
echo "📋 Available backups:"
ls -lh "$BACKUP_DIR"/cfo-backup-*.tar.gz | awk '{print "   " $9, "-", $5, "-", $6, $7, $8}'
echo ""
echo "=========================================="

# Optional: Upload to remote storage
if [ ! -z "$BACKUP_REMOTE_PATH" ]; then
    echo ""
    echo "☁️  Uploading to remote storage..."
    # Add your remote upload command here (rsync, scp, aws s3 cp, etc.)
    # Example:
    # rsync -avz "$FINAL_BACKUP" "$BACKUP_REMOTE_PATH/"
    echo -e "${YELLOW}⚠️  Remote upload not configured${NC}"
fi
