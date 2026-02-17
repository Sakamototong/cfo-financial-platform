#!/bin/sh
# Test projection engine from inside Docker network

echo "=== Testing Projection Engine ==="

# Get token
TOKEN=$(wget -qO- --post-data="client_id=cfo-client&client_secret=secret&username=tester&password=tester&grant_type=password" \
  http://keycloak:8080/realms/master/protocol/openid-connect/token | \
  grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "Token obtained"

# Create tenant with username from JWT
echo "\n0. Creating tenant..."
TENANT=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"name":"Test Company"}' \
  http://localhost:3000/tenant)

echo "Tenant created"

# Create base statement - the service will use 'tester' from JWT
echo "\n1. Creating base financial statement..."
BASE_STMT=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"statement":{"statement_type":"PL","period_type":"monthly","period_start":"2026-01-01","period_end":"2026-01-31","scenario":"actual","status":"approved"},"lineItems":[{"line_code":"REV-001","line_name":"Sales","line_order":1,"amount":500000,"currency":"THB"},{"line_code":"COGS-001","line_name":"COGS","line_order":2,"amount":280000,"currency":"THB"},{"line_code":"OPEX-001","line_name":"Expenses","line_order":3,"amount":150000,"currency":"THB"}]}' \
  http://localhost:3000/financial/statements)

STMT_ID=$(echo "$BASE_STMT" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Statement ID: $STMT_ID"

# Create scenario
echo "\n2. Creating growth scenario..."
SCENARIO=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"scenario":{"scenario_name":"Growth2026","scenario_type":"best","description":"15% growth","is_active":true},"assumptions":[{"assumption_category":"revenue","assumption_key":"growth_rate","assumption_value":0.15,"assumption_unit":"%"},{"assumption_category":"expense","assumption_key":"cost_increase","assumption_value":0.05,"assumption_unit":"%"}]}' \
  http://localhost:3000/scenarios)

SCN_ID=$(echo "$SCENARIO" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "Scenario ID: $SCN_ID"

# Generate projections
echo "\n3. Generating 12-month projections..."
PROJECTION=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data="{\"base_statement_id\":\"$STMT_ID\",\"scenario_id\":\"$SCN_ID\",\"projection_periods\":12,\"period_type\":\"monthly\"}" \
  http://localhost:3000/projections/generate)

echo "\n=== Result ==="
echo "$PROJECTION" | head -100

echo "\n\nProjection test completed!"
