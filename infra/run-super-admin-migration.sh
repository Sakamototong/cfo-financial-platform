#!/bin/bash
# Run super admin schema migration on main postgres database

set -e

echo "🚀 Running Super Admin Schema Migration..."

# Run the migration
docker exec -i infra-db-1 psql -U postgres -d postgres < init/create_super_admin_schema.sql

if [ $? -eq 0 ]; then
  echo "✅ Super admin schema created successfully"
  echo ""
  echo "📋 Created tables:"
  echo "  - system_users (central user registry)"
  echo "  - user_tenant_memberships (user-tenant associations)"
  echo "  - subscription_plans (billing plans)"
  echo "  - tenant_subscriptions (tenant billing status)"
  echo "  - tenant_usage_metrics (usage tracking)"
  echo ""
  echo "👤 Default super admin created:"
  echo "  Email: superadmin@system.local"
  echo "  Role: super_admin"
  echo "  ⚠️  Remember to set password in Keycloak!"
else
  echo "❌ Migration failed"
  exit 1
fi
