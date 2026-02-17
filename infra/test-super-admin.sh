#!/bin/bash
# Quick test script for super admin functionality

echo "🧪 Testing Super Admin Implementation..."
echo ""

# Test 1: Login as super admin
echo "1️⃣ Testing super admin login..."
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"SuperAdmin123!"}')

TOKEN=$(echo $RESPONSE | jq -r '.data.access_token')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✅ Super admin login successful"
else
  echo "❌ Super admin login failed"
  echo $RESPONSE | jq .
  exit 1
fi

echo ""

# Test 2: Get user info
echo "2️⃣ Testing /auth/me endpoint..."
ME_RESPONSE=$(curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN")

ROLE=$(echo $ME_RESPONSE | jq -r '.data.role')
IS_SUPER_ADMIN=$(echo $ME_RESPONSE | jq -r '.data.is_super_admin')

if [ "$ROLE" = "super_admin" ] && [ "$IS_SUPER_ADMIN" = "true" ]; then
  echo "✅ Super admin role detected correctly"
  echo "   Email: $(echo $ME_RESPONSE | jq -r '.data.email')"
  echo "   Role: $ROLE"
else
  echo "❌ Super admin role not detected"
  echo $ME_RESPONSE | jq .
  exit 1
fi

echo ""

# Test 3: List all tenants
echo "3️⃣ Testing /super-admin/tenants endpoint..."
TENANTS_RESPONSE=$(curl -s http://localhost:3000/super-admin/tenants \
  -H "Authorization: Bearer $TOKEN")

TENANT_COUNT=$(echo $TENANTS_RESPONSE | jq '. | length')

if [ "$TENANT_COUNT" -gt 0 ]; then
  echo "✅ Successfully retrieved $TENANT_COUNT tenants"
  echo $TENANTS_RESPONSE | jq -r '.[] | "   - \(.name) (ID: \(.id), Users: \(.user_count))"'
else
  echo "❌ Failed to retrieve tenants"
  echo $TENANTS_RESPONSE | jq .
  exit 1
fi

echo ""

# Test 4: Get system overview
echo "4️⃣ Testing /super-admin/analytics/overview endpoint..."
OVERVIEW_RESPONSE=$(curl -s http://localhost:3000/super-admin/analytics/overview \
  -H "Authorization: Bearer $TOKEN")

TOTAL_TENANTS=$(echo $OVERVIEW_RESPONSE | jq -r '.total_tenants')
TOTAL_USERS=$(echo $OVERVIEW_RESPONSE | jq -r '.total_users')

if [ "$TOTAL_TENANTS" != "null" ]; then
  echo "✅ System overview retrieved successfully"
  echo "   Total Tenants: $TOTAL_TENANTS"
  echo "   Total Users: $TOTAL_USERS"
  echo "   Active Tenants: $(echo $OVERVIEW_RESPONSE | jq -r '.active_tenants')"
  echo "   Super Admins: $(echo $OVERVIEW_RESPONSE | jq -r '.super_admins')"
else
  echo "❌ Failed to retrieve system overview"
  echo $OVERVIEW_RESPONSE | jq .
  exit 1
fi

echo ""
echo "🎉 All tests passed! Super admin implementation is working correctly."
echo ""
echo "Next steps:"
echo "1. Open http://localhost:8080/login"
echo "2. Login with:"
echo "   Username: superadmin"
echo "   Password: SuperAdmin123!"
echo "3. Click '🔒 Super Admin' in the navigation menu"
echo "4. Explore the Super Admin Dashboard"
