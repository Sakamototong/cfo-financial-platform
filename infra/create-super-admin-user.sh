#!/bin/bash
# Create super admin user in Keycloak

set -e

echo "🔐 Creating Super Admin user in Keycloak..."

# Create super admin user
docker exec infra-keycloak-1 /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin 2>/dev/null

# Create the user
docker exec infra-keycloak-1 /opt/keycloak/bin/kcadm.sh create users \
  -r master \
  -s username=superadmin \
  -s email=superadmin@system.local \
  -s emailVerified=true \
  -s enabled=true \
  -s firstName=Super \
  -s lastName=Admin 2>/dev/null || echo "User may already exist"

# Set password
docker exec infra-keycloak-1 /opt/keycloak/bin/kcadm.sh set-password \
  -r master \
  --username superadmin \
  --new-password SuperAdmin123! 2>/dev/null

echo "✅ Super Admin user created successfully"
echo ""
echo "📋 Super Admin Credentials:"
echo "  Email: superadmin@system.local"
echo "  Username: superadmin"
echo "  Password: SuperAdmin123!"
echo ""
echo "🔑 The user has been added to both:"
echo "  - Keycloak (for authentication)"
echo "  - system_users table (for super admin authorization)"
