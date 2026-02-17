#!/bin/bash

# Script to setup Keycloak client for CFO Platform

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"
REALM="master"
CLIENT_ID="cfo-client"

echo "=== Setting up Keycloak Client for CFO Platform ==="

# Get admin access token
echo "Getting admin token..."
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token"
  exit 1
fi

echo "✅ Admin token obtained"

# Check if client exists
echo "Checking if client $CLIENT_ID exists..."
CLIENT_EXISTS=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ -n "$CLIENT_EXISTS" ] && [ "$CLIENT_EXISTS" != "null" ]; then
  echo "✅ Client $CLIENT_ID already exists (ID: $CLIENT_EXISTS)"
  
  # Update client to enable direct access grants
  echo "Updating client configuration..."
  curl -s -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_EXISTS" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"$CLIENT_ID\",
      \"enabled\": true,
      \"publicClient\": true,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": true,
      \"implicitFlowEnabled\": false,
      \"serviceAccountsEnabled\": false,
      \"redirectUris\": [\"*\"],
      \"webOrigins\": [\"*\"]
    }"
  echo "✅ Client configuration updated"
else
  echo "Creating client $CLIENT_ID..."
  curl -s -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"$CLIENT_ID\",
      \"enabled\": true,
      \"publicClient\": true,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": true,
      \"implicitFlowEnabled\": false,
      \"serviceAccountsEnabled\": false,
      \"redirectUris\": [\"*\"],
      \"webOrigins\": [\"*\"]
    }"
  echo "✅ Client created"
fi

echo ""
echo "=== Testing Authentication ==="

# Test authentication
echo "Testing login with demo-admin@testco.local..."
TEST_RESULT=$(curl -s -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$CLIENT_ID" \
  -d "username=demo-admin@testco.local" \
  -d "password=Secret123!")

if echo "$TEST_RESULT" | jq -e '.access_token' > /dev/null 2>&1; then
  echo "✅ Authentication successful!"
else
  echo "❌ Authentication failed:"
  echo "$TEST_RESULT" | jq .
fi

echo ""
echo "=== Setup Complete ==="
