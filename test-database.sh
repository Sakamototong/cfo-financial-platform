#!/bin/bash

echo "======================================"
echo "API Endpoint Testing"
echo "======================================"
echo ""

# Get actual tenant count
echo "📊 Database Information:"
echo "------------------------"
docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d postgres -c "SELECT id, name FROM tenants;" 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN"

echo ""
echo "📊 Admin Tenant Tables:"
echo "------------------------"
docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d admin_tenant_db -c "\dt" 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN" | grep "public"

echo ""
echo "📊 System Users:"
echo "------------------------"
docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d postgres -c "SELECT email, full_name, role FROM system_users;" 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN"

echo ""
echo "======================================"
echo "Testing Complete!"
echo "======================================"
