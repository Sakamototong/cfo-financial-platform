#!/bin/bash
echo "Testing Keycloak authentication..."
curl -s -X POST "http://localhost:8081/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=cfo-client" \
  -d "username=demo-admin@testco.local" \
  -d "password=Secret123!" | jq .
