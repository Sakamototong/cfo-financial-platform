#!/bin/bash

# Script to create users in Keycloak for CFO Platform
# Run this after Keycloak is up and running

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"
REALM="master"
CLIENT_ID="cfo-client"

echo "=== Creating Keycloak Users for CFO Platform ==="

# Get admin access token
echo "Getting admin token..."
ADMIN_TOKEN=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASSWORD" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" == "null" ]; then
  echo "❌ Failed to get admin token. Is Keycloak running?"
  exit 1
fi

echo "✅ Admin token obtained"

# Function to create user
create_user() {
  local USERNAME=$1
  local EMAIL=$2
  local FIRSTNAME=$3
  local LASTNAME=$4
  local PASSWORD=$5
  
  echo ""
  echo "Creating user: $EMAIL..."
  
  # Create user
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"$USERNAME\",
      \"email\": \"$EMAIL\",
      \"firstName\": \"$FIRSTNAME\",
      \"lastName\": \"$LASTNAME\",
      \"enabled\": true,
      \"emailVerified\": true
    }")
  
  HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "409" ]; then
    echo "✅ User $EMAIL created or already exists"
    
    # Get user ID
    USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
    
    if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
      # Set password
      curl -s -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/reset-password" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
          \"type\": \"password\",
          \"value\": \"$PASSWORD\",
          \"temporary\": false
        }"
      echo "✅ Password set for $EMAIL"
    fi
  else
    echo "❌ Failed to create user $EMAIL (HTTP $HTTP_CODE)"
  fi
}

# Create users
create_user "demo-admin" "demo-admin@testco.local" "Demo" "Admin" "Secret123!"
create_user "analyst" "analyst@testco.local" "Test" "Analyst" "Secret123!"
create_user "viewer" "viewer@testco.local" "Test" "Viewer" "Secret123!"

echo ""
echo "=== User Creation Complete ==="
echo ""
echo "You can now login with:"
echo "  demo-admin@testco.local / Secret123!"
echo "  analyst@testco.local / Secret123!"
echo "  viewer@testco.local / Secret123!"
echo "  admin / admin (demo mode)"
