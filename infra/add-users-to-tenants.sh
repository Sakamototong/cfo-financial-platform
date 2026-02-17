#!/bin/bash

# Script to add users to all tenants

API_BASE="http://localhost:3000"
TOKEN="demo-token-$(date +%s)"

echo "=== Adding Users to All Tenants ==="

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

# Add users to admin tenant
echo ""
echo "=== Tenant: admin ==="
add_user "admin" "demo-admin@testco.local" "Demo Admin" "admin"
add_user "admin" "analyst@testco.local" "Test Analyst" "analyst"
add_user "admin" "viewer@testco.local" "Test Viewer" "viewer"

# Add users to testco tenant
echo ""
echo "=== Tenant: testco ==="
add_user "testco" "demo-admin@testco.local" "Demo Admin" "admin"
add_user "testco" "analyst@testco.local" "Test Analyst" "analyst"
add_user "testco" "viewer@testco.local" "Test Viewer" "viewer"

# Add users to acmecorp tenant
echo ""
echo "=== Tenant: 155cf73a2fe388f0 (acmecorp) ==="
add_user "155cf73a2fe388f0" "demo-admin@testco.local" "Demo Admin" "admin"
add_user "155cf73a2fe388f0" "analyst@testco.local" "Test Analyst" "analyst"
add_user "155cf73a2fe388f0" "viewer@testco.local" "Test Viewer" "viewer"

echo ""
echo "=== Complete ==="
echo ""
echo "All users can now access all tenants:"
echo "  - demo-admin@testco.local (admin role)"
echo "  - analyst@testco.local (analyst role)"
echo "  - viewer@testco.local (viewer role)"
