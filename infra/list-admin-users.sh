#!/bin/bash

TOKEN=$(curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

echo "Getting all users..."
curl -s "http://localhost:8081/admin/realms/master/users" \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | select(.username | contains("admin")) | {id, username, email, enabled}'
