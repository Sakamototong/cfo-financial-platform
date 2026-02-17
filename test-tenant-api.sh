#!/bin/sh
# Test tenant creation from inside Docker network (where issuer matches backend config)

TOKEN=$(wget -qO- --post-data="client_id=cfo-client&client_secret=secret&username=tester&password=tester&grant_type=password" \
  http://keycloak:8080/realms/master/protocol/openid-connect/token | \
  sed 's/.*"access_token":"\([^"]*\)".*/\1/')

echo "Token obtained: ${TOKEN:0:50}..."

wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"name":"finaltest"}' \
  http://backend:3000/tenant

echo ""
