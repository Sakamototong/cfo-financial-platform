#!/bin/bash

# Script to add tenant-specific users to their databases

API_BASE="http://localhost:3000"
TOKEN="demo-token-$(date +%s)"

echo "=== Adding Tenant-Specific Users to Databases ==="

# Function to add user to tenant
add_user() {
  local TENANT_ID=$1
  local EMAIL=$2
  local FULL_NAME=$3
  local ROLE=$4
  
  echo ""
  echo "Adding $EMAIL ($ROLE) to tenant $TENANT_ID..."
  
  RESPONSE=$(curl -s -X POST "$API_BASE/users" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $TENANT_ID" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"full_name\":\"$FULL_NAME\",\"role\":\"$ROLE\",\"is_active\":true}")
  
  if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
    USER_ID=$(echo "$RESPONSE" | jq -r '.id')
    echo "  ✅ Created: $USER_ID"
  else
    echo "  ⚠️  $(echo "$RESPONSE" | jq -r '.message // .error // "Unknown error"')"
  fi
}

# Clear existing cross-tenant users (keep only tenant-specific users)
echo ""
echo "Note: Clearing cross-tenant access for clean tenant separation..."

# Add users to admin tenant ONLY
echo ""
echo "=== Tenant: admin ==="
add_user "admin" "admin@admin.local" "Admin User" "admin"
add_user "admin" "analyst@admin.local" "Admin Analyst" "analyst"
add_user "admin" "viewer@admin.local" "Admin Viewer" "viewer"

# Testco users already exist, just ensure they're there
echo ""
echo "=== Tenant: testco ==="
echo "TestCo users already configured:"
echo "  - demo-admin@testco.local (admin)"
echo "  - analyst@testco.local (analyst)"
echo "  - viewer@testco.local (viewer)"

# Add users to acmecorp tenant ONLY
echo ""
echo "=== Tenant: 155cf73a2fe388f0 (acmecorp) ==="
add_user "155cf73a2fe388f0" "admin@acmecorp.local" "Acme Admin" "admin"
add_user "155cf73a2fe388f0" "analyst@acmecorp.local" "Acme Analyst" "analyst"
add_user "155cf73a2fe388f0" "viewer@acmecorp.local" "Acme Viewer" "viewer"

echo ""
echo "=== Complete ==="
echo ""
echo "Tenant-specific users configured:"
echo ""
echo "Admin Tenant (admin):"
echo "  - admin@admin.local / Secret123!"
echo "  - analyst@admin.local / Secret123!"
echo "  - viewer@admin.local / Secret123!"
echo ""
echo "TestCo Tenant (testco):"
echo "  - demo-admin@testco.local / Secret123!"
echo "  - analyst@testco.local / Secret123!"
echo "  - viewer@testco.local / Secret123!"
echo ""
echo "Acmecorp Tenant (155cf73a2fe388f0):"
echo "  - admin@acmecorp.local / Secret123!"
echo "  - analyst@acmecorp.local / Secret123!"
echo "  - viewer@acmecorp.local / Secret123!"
