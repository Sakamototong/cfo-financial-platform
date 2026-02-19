#!/bin/bash

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER_ID="b977c7ed-886d-475a-98fc-8629806ce1b5"

echo "=== Setting password for Keycloak admin user ==="

# Get admin token
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

# Set password to Secret123!
curl -s -X PUT "$KEYCLOAK_URL/admin/realms/master/users/$ADMIN_USER_ID/reset-password" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"password","value":"Secret123!","temporary":false}'

echo "Success: Password set for admin user"

# Test authentication with cfo-client
echo ""
echo "=== Testing authentication with cfo-client ==="
TEST_RESULT=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=cfo-client" \
  -d "username=admin" \
  -d "password=Secret123!")

if echo "$TEST_RESULT" | jq -e '.access_token' > /dev/null 2>&1; then
  echo "Success: Authentication works with admin / Secret123!"
  echo "Testing backend login..."
  
  # Test backend login
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Secret123!"}' \
    2>/dev/null | jq '{success, message}'
else
  echo "Error: Authentication failed with cfo-client"
  echo "$TEST_RESULT" | jq .
fi
