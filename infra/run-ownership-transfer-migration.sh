#!/bin/bash
# Run ownership transfer table migration for all tenants

set -e

echo "Running ownership transfer migration..."

# Get all tenant databases
TENANT_DBS=$(docker compose exec -T db psql -U postgres -d postgres -t -c "SELECT datname FROM pg_database WHERE datname LIKE 'tenant_%';")

for DB in $TENANT_DBS; do
    DB=$(echo $DB | xargs)  # Trim whitespace
    if [ ! -z "$DB" ]; then
        echo "Creating ownership_transfer_requests table in $DB..."
        docker compose exec -T db psql -U postgres -d "$DB" < init/create_ownership_transfer_schema.sql
        echo "✓ Migration completed for $DB"
    fi
done

echo ""
echo "✅ All migrations completed successfully!"
