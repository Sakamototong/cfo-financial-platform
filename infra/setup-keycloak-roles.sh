#!/bin/bash

# Script to create and assign roles in Keycloak for CFO Platform
# Run this after Keycloak client is set up

KEYCLOAK_URL="http://localhost:8081"
ADMIN_USER="admin"
ADMIN_PASSWORD="admin"
REALM="master"
CLIENT_ID="cfo-client"

echo "=== Setting up Keycloak Roles for CFO Platform ==="

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

# Function to create realm role
create_realm_role() {
  local ROLE_NAME=$1
  local DESCRIPTION=$2
  
  echo ""
  echo "Creating realm role: $ROLE_NAME..."
  
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$ROLE_NAME\",
      \"description\": \"$DESCRIPTION\"
    }")
  
  HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" == "201" ] || [ "$HTTP_CODE" == "409" ]; then
    echo "✅ Role $ROLE_NAME created or already exists"
  else
    echo "⚠️  Role $ROLE_NAME creation status: HTTP $HTTP_CODE"
  fi
}

# Function to assign realm role to user
assign_realm_role() {
  local USERNAME=$1
  local ROLE_NAME=$2
  
  echo ""
  echo "Assigning role $ROLE_NAME to user $USERNAME..."
  
  # Get user ID
  USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')
  
  if [ -z "$USER_ID" ] || [ "$USER_ID" == "null" ]; then
    echo "❌ User $USERNAME not found"
    return 1
  fi
  
  # Get role details
  ROLE_INFO=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE_NAME" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  
  ROLE_ID=$(echo "$ROLE_INFO" | jq -r '.id')
  
  if [ -z "$ROLE_ID" ] || [ "$ROLE_ID" == "null" ]; then
    echo "❌ Role $ROLE_NAME not found"
    return 1
  fi
  
  # Assign role to user
  ASSIGN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[{
      \"id\": \"$ROLE_ID\",
      \"name\": \"$ROLE_NAME\"
    }]")
  
  HTTP_CODE=$(echo "$ASSIGN_RESPONSE" | tail -n1)
  
  if [ "$HTTP_CODE" == "204" ] || [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Role $ROLE_NAME assigned to $USERNAME"
  else
    echo "⚠️  Role assignment status: HTTP $HTTP_CODE"
  fi
}

# Create all CFO Platform roles
echo ""
echo "=== Creating Realm Roles ==="
create_realm_role "super_admin" "Super Administrator - Full system access"
create_realm_role "admin" "Administrator - Tenant administration"
create_realm_role "finance_user" "Finance User - Can manage financial data"
create_realm_role "analyst" "Analyst - Can create and analyze scenarios"
create_realm_role "viewer" "Viewer - Read-only access"

# Assign roles to users
echo ""
echo "=== Assigning Roles to Users ==="

# Admin user gets super_admin role
assign_realm_role "admin" "super_admin"
assign_realm_role "admin" "finance_user"

# Demo users
if curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=demo-admin" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -e '.[0].id' > /dev/null 2>&1; then
  assign_realm_role "demo-admin" "admin"
  assign_realm_role "demo-admin" "finance_user"
fi

if curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=analyst" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -e '.[0].id' > /dev/null 2>&1; then
  assign_realm_role "analyst" "analyst"
  assign_realm_role "analyst" "finance_user"
fi

if curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=viewer" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -e '.[0].id' > /dev/null 2>&1; then
  assign_realm_role "viewer" "viewer"
fi

echo ""
echo "=== Verifying Role Assignments ==="

# Verify admin user roles
echo ""
echo "Admin user roles:"
ADMIN_USER_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users?username=admin" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

if [ -n "$ADMIN_USER_ID" ] && [ "$ADMIN_USER_ID" != "null" ]; then
  curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/users/$ADMIN_USER_ID/role-mappings/realm" \
    -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[].name' | while read role; do
    echo "  - $role"
  done
fi

echo ""
echo "=== Role Setup Complete ==="
echo ""
echo "Testing authentication with roles..."

# Test login
TOKEN_RESPONSE=$(curl -s -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$CLIENT_ID" \
  -d "username=admin" \
  -d "password=admin")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token')

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
  echo "✅ Authentication successful"
  echo ""
  echo "Decoded token roles:"
  echo "$ACCESS_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq -r '.realm_access.roles[]' 2>/dev/null | while read role; do
    echo "  - $role"
  done
else
  echo "❌ Authentication failed"
fi

echo ""
echo "Done! You can now login and the roles will be properly set in JWT tokens."
