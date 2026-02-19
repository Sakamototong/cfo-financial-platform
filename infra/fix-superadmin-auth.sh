#!/bin/bash

KEYCLOAK_URL="http://localhost:8081"

echo "=== Creating/Updating Super Admin Users in Keycloak ==="

# Get admin token
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Admin token obtained"

# Create superadmin user
echo ""
echo "Creating superadmin user..."
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/master/users" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "email": "superadmin@system.local",
    "firstName": "Super",
    "lastName": "Admin",
    "enabled": true,
    "emailVerified": true
  }')

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "409" ]; then
  echo "✅ User superadmin created or already exists"
  
  # Get user ID
  USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/master/users?username=superadmin" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
  
  if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
    # Set password
    curl -s -X PUT "$KEYCLOAK_URL/admin/realms/master/users/$USER_ID/reset-password" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{
        "type": "password",
        "value": "Secret123!",
        "temporary": false
      }'
    echo "✅ Password set for superadmin"
  fi
else
  echo "❌ Failed to create user superadmin (HTTP $HTTP_CODE)"
fi

# Update admin user password
echo ""
echo "Updating admin user password..."
ADMIN_USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/master/users?username=admin" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ -n "$ADMIN_USER_ID" ] && [ "$ADMIN_USER_ID" != "null" ]; then
  curl -s -X PUT "$KEYCLOAK_URL/admin/realms/master/users/$ADMIN_USER_ID/reset-password" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "type": "password",
      "value": "Secret123!",
      "temporary": false
    }'
  echo "✅ Password updated for admin user"
fi

echo ""
echo "=== Summary ==="
echo "Super Admin users are ready:"
echo "  1. superadmin@system.local / Secret123!"
echo "  2. admin / Secret123!"
