#!/bin/bash

KEYCLOAK_URL="http://localhost:8081"

echo "=== Fixing admin user password ==="

# Get admin token (using default admin/admin)
TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" == "null" ]; then
  echo "Error: Failed to get admin token"
  exit 1
fi

echo "Success: Admin token obtained"

# Get admin user ID
ADMIN_ID=$(curl -s "http://localhost:8081/admin/realms/master/users?username=admin" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

if [ -z "$ADMIN_ID" ] || [ "$ADMIN_ID" == "null" ]; then
  echo "Error: Admin user not found"
  exit 1
fi

echo "Success: Found admin user ID: $ADMIN_ID"

# Set password to Secret123!
curl -s -X PUT "$KEYCLOAK_URL/admin/realms/master/users/$ADMIN_ID/reset-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"password","value":"Secret123!","temporary":false}'

echo "Success: Password updated to Secret123!"

# Test authentication
echo ""
echo "=== Testing authentication ==="
TEST_RESULT=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=cfo-client" \
  -d "username=admin" \
  -d "password=Secret123!")

if echo "$TEST_RESULT" | jq -e '.access_token' > /dev/null 2>&1; then
  echo "Success: Authentication works with admin / Secret123!"
  TOKEN_SHORT=$(echo "$TEST_RESULT" | jq -r '.access_token' | cut -c1-50)
  echo "Token preview: ${TOKEN_SHORT}..."
else
  echo "Error: Authentication failed"
  echo "$TEST_RESULT" | jq .
fi
