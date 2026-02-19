#!/bin/bash

TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

echo "Getting admin user details..."
curl -s "http://localhost:8081/admin/realms/master/users?username=admin" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {id, username, email, enabled, emailVerified}'
