#!/bin/bash
# Test Enhanced Projection Features

BASE_URL="http://localhost:3000"
TOKEN=""

echo "=================================================="
echo "  CFO Platform - Enhanced Projection Test"
echo "=================================================="

# Login
echo -e "\n=== Logging in ==="
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.access_token // .data.access_token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "✗ Login failed"
  exit 1
fi

echo "✓ Login successful"

# Get first financial statement
echo -e "\n=== Getting base statement ==="
STATEMENTS=$(curl -s -X GET "$BASE_URL/financial" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: testco")

STATEMENT_ID=$(echo $STATEMENTS | jq -r '.data[0].id // .statements[0].id // .[0].id // empty')

if [ -z "$STATEMENT_ID" ]; then
  echo "✗ No financial statements found"
  exit 1
fi

echo "✓ Using statement: $STATEMENT_ID"

# Create comprehensive scenario
echo -e "\n=== Creating comprehensive scenario ==="
SCENARIO_RESPONSE=$(curl -s -X POST "$BASE_URL/scenarios" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: testco" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enhanced Projection Test",
    "description": "Testing BS, CF, CAPEX, and ratios",
    "scenario_type": "base",
    "assumptions": [
      {"assumption_category": "revenue", "assumption_key": "growth_rate", "assumption_value": 0.15},
      {"assumption_category": "expense", "assumption_key": "cost_increase", "assumption_value": 0.05},
      {"assumption_category": "asset", "assumption_key": "growth_rate", "assumption_value": 0.10},
      {"assumption_category": "asset", "assumption_key": "capex_amount", "assumption_value": 500000},
      {"assumption_category": "depreciation", "assumption_key": "rate", "assumption_value": 0.10},
      {"assumption_category": "valuation", "assumption_key": "cost_of_equity", "assumption_value": 0.12},
      {"assumption_category": "valuation", "assumption_key": "cost_of_debt", "assumption_value": 0.06},
      {"assumption_category": "tax", "assumption_key": "tax_rate", "assumption_value": 0.20}
    ]
  }')

SCENARIO_ID=$(echo $SCENARIO_RESPONSE | jq -r '.id // empty')

if [ -z "$SCENARIO_ID" ]; then
  echo "✗ Failed to create scenario"
  exit 1
fi

echo "✓ Scenario created: $SCENARIO_ID"

# Generate projection
echo -e "\n=== Generating projection ==="
PROJECTION_RESPONSE=$(curl -s -X POST "$BASE_URL/projections/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: testco" \
  -H "Content-Type: application/json" \
  -d "{
    \"base_statement_id\": \"$STATEMENT_ID\",
    \"scenario_id\": \"$SCENARIO_ID\",
    \"projection_periods\": 12,
    \"period_type\": \"monthly\"
  }")

PROJECTION_ID=$(echo $PROJECTION_RESPONSE | jq -r '.projection_id // empty')

if [ -z "$PROJECTION_ID" ]; then
  echo "✗ Failed to generate projection"
  echo "Response: $PROJECTION_RESPONSE"
  exit 1
fi

echo "✓ Projection generated: $PROJECTION_ID"

# Display results
echo -e "\n=== Financial Ratios ==="
echo $PROJECTION_RESPONSE | jq -r '.ratios | to_entries[] | "  \(.key): \(.value | tonumber | . * 100 | round / 100)"'

echo -e "\n=== CAPEX Schedule (first 3) ==="
echo $PROJECTION_RESPONSE | jq -r '.capex_schedule[:3][] | "  Period \(.period_number): CAPEX=\(.capex_amount), Depr=\(.depreciation_amount), NBV=\(.net_book_value)"'

echo -e "\n=== Cash Flow (first 3) ==="
echo $PROJECTION_RESPONSE | jq -r '.cashflow_projection[:3][] | "  Period \(.period_number): OCF=\(.operating_cashflow), ICF=\(.investing_cashflow), FCF=\(.financing_cashflow)"'

echo -e "\n=================================================="
echo "  ✓ All tests passed!"
echo "=================================================="
