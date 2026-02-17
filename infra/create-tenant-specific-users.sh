#!/bin/bash

# Script to create tenant-specific users in Keycloak

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"
REALM="master"
CLIENT_ID="cfo-client"

echo "=== Creating Tenant-Specific Users in Keycloak ==="

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

echo ""
echo "=== Admin Tenant Users ==="
create_user "admin-admin" "admin@admin.local" "Admin" "User" "Secret123!"
create_user "admin-analyst" "analyst@admin.local" "Admin" "Analyst" "Secret123!"
create_user "admin-viewer" "viewer@admin.local" "Admin" "Viewer" "Secret123!"

echo ""
echo "=== Acmecorp Tenant Users ==="
create_user "acme-admin" "admin@acmecorp.local" "Acme" "Admin" "Secret123!"
create_user "acme-analyst" "analyst@acmecorp.local" "Acme" "Analyst" "Secret123!"
create_user "acme-viewer" "viewer@acmecorp.local" "Acme" "Viewer" "Secret123!"

echo ""
echo "=== User Creation Complete ==="
echo ""
echo "Tenant-specific users created:"
echo ""
echo "Admin Tenant:"
echo "  - admin@admin.local / Secret123!"
echo "  - analyst@admin.local / Secret123!"
echo "  - viewer@admin.local / Secret123!"
echo ""
echo "TestCo Tenant (existing):"
echo "  - demo-admin@testco.local / Secret123!"
echo "  - analyst@testco.local / Secret123!"
echo "  - viewer@testco.local / Secret123!"
echo ""
echo "Acmecorp Tenant:"
echo "  - admin@acmecorp.local / Secret123!"
echo "  - analyst@acmecorp.local / Secret123!"
echo "  - viewer@acmecorp.local / Secret123!"
