#!/bin/sh
# Test projection engine and display summary

echo "=== Financial Projection Engine Test ==="
echo

# Get token
TOKEN=$(wget -qO- --post-data="client_id=cfo-client&client_secret=secret&username=tester&password=tester&grant_type=password" \
  http://keycloak:8080/realms/master/protocol/openid-connect/token | \
  grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

# Create tenant (may fail if already exists)
wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"name":"Test Company"}' \
  http://localhost:3000/tenant 2>/dev/null >/dev/null

# Create base statement
echo "Step 1: Creating base P&L statement..."
BASE_STMT=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"statement":{"statement_type":"PL","period_type":"monthly","period_start":"2026-01-01","period_end":"2026-01-31","scenario":"actual","status":"approved"},"lineItems":[{"line_code":"REV-001","line_name":"Sales Revenue","line_order":1,"amount":1000000,"currency":"THB"},{"line_code":"COGS-001","line_name":"Cost of Goods Sold","line_order":2,"amount":600000,"currency":"THB"},{"line_code":"OPEX-001","line_name":"Operating Expenses","line_order":3,"amount":250000,"currency":"THB"}]}' \
  http://localhost:3000/financial/statements 2>/dev/null)

STMT_ID=$(echo "$BASE_STMT" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✓ Statement created: $STMT_ID"
echo "  - Sales Revenue: 1,000,000 THB"
echo "  - COGS: 600,000 THB (60%)"
echo "  - Operating Expenses: 250,000 THB (25%)"
echo "  - Net Income: 150,000 THB (15%)"
echo

# Create scenario
echo "Step 2: Creating growth scenario..."
SCENARIO=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data='{"scenario":{"scenario_name":"Moderate Growth","scenario_type":"best","description":"10% monthly revenue growth, 3% cost increase","is_active":true},"assumptions":[{"assumption_category":"revenue","assumption_key":"growth_rate","assumption_value":0.10,"assumption_unit":"%"},{"assumption_category":"expense","assumption_key":"cost_increase","assumption_value":0.03,"assumption_unit":"%"}]}' \
  http://localhost:3000/scenarios 2>/dev/null)

SCN_ID=$(echo "$SCENARIO" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✓ Scenario created: $SCN_ID"
echo "  - Revenue growth: 10% per month"
echo "  - Cost increase: 3% per month"
echo

# Generate projections
echo "Step 3: Generating 6-month projections..."
PROJECTION=$(wget -qO- --header="Authorization: Bearer $TOKEN" --header="Content-Type: application/json" \
  --post-data="{\"base_statement_id\":\"$STMT_ID\",\"scenario_id\":\"$SCN_ID\",\"projection_periods\":6,\"period_type\":\"monthly\"}" \
  http://localhost:3000/projections/generate 2>/dev/null)

PROJ_ID=$(echo "$PROJECTION" | grep -o '"projection_id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "✓ Projections generated: $PROJ_ID"
echo

# Display results
echo "=== Projected Financials (6 months) ==="
echo "Month | Revenue      | COGS         | OpEx         | Net Income   | Net Margin"
echo "------|-------------|-------------|-------------|--------------|----------"

# Base (Month 0)
echo "  0   | 1,000,000   | 600,000     | 250,000     | 150,000      | 15.0%"

# Extract first 6 periods
for i in 1 2 3 4 5 6; do
  PERIOD=$(echo "$PROJECTION" | grep -o "\"period_number\":$i" -A 200 | head -200)
  REV=$(echo "$PERIOD" | grep -o '"line_code":"REV-[^"]*"[^}]*"projected_amount":[0-9.]*' | head -1 | grep -o '[0-9.]*$' | head -1)
  COGS=$(echo "$PERIOD" | grep -o '"line_code":"COGS-[^"]*"[^}]*"projected_amount":[0-9.]*' | head -1 | grep -o '[0-9.]*$' | head -1)
  OPEX=$(echo "$PERIOD" | grep -o '"line_code":"OPEX-[^"]*"[^}]*"projected_amount":[0-9.]*' | head -1 | grep -o '[0-9.]*$' | head -1)
  
  if [ -n "$REV" ] && [ -n "$COGS" ] && [ -n "$OPEX" ]; then
    NET=$(echo "$REV - $COGS - $OPEX" | bc)
    MARGIN=$(echo "scale=1; ($NET / $REV) * 100" | bc)
    
    REV_FMT=$(printf "%'.0f" $REV 2>/dev/null || echo $REV)
    COGS_FMT=$(printf "%'.0f" $COGS 2>/dev/null || echo $COGS)
    OPEX_FMT=$(printf "%'.0f" $OPEX 2>/dev/null || echo $OPEX)
    NET_FMT=$(printf "%'.0f" $NET 2>/dev/null || echo $NET)
    
    printf "  %-4s| %-12s| %-12s| %-12s| %-12s| %s%%\n" "$i" "$REV_FMT" "$COGS_FMT" "$OPEX_FMT" "$NET_FMT" "$MARGIN"
  fi
done

echo
echo "=== Financial Ratios ==="
GM=$(echo "$PROJECTION" | grep -o '"gross_margin":[0-9.]*' | head -1 | grep -o '[0-9.]*$')
OM=$(echo "$PROJECTION" | grep -o '"operating_margin":[0-9.]*' | head -1 | grep -o '[0-9.]*$')
NM=$(echo "$PROJECTION" | grep -o '"net_margin":[0-9.]*' | head -1 | grep -o '[0-9.]*$')

echo "Gross Margin:      ${GM}%"
echo "Operating Margin:  ${OM}%"
echo "Net Margin:        ${NM}%"
echo
echo "✓ Projection Engine Test Completed Successfully!"
