#!/bin/bash
TOKEN="demo-token-super-admin-$(date +%s)"
BASE="http://localhost:3000"
TID="admin-tenant"

test_endpoint() {
  local name="$1"
  local path="$2"
  local code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "${BASE}${path}")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "✅ $name -> $code"
  else
    echo "❌ $name -> $code"
    curl -s -H "Authorization: Bearer $TOKEN" "${BASE}${path}" | head -c 200
    echo ""
  fi
}

echo "=== Testing API Endpoints (tenant: $TID) ==="
echo ""
test_endpoint "Financial Statements" "/financial/statements?tenantId=$TID"
test_endpoint "Scenarios" "/scenarios?tenantId=$TID"
test_endpoint "Dimensions" "/dim?tenantId=$TID"
test_endpoint "Dim Templates" "/dim/templates?tenantId=$TID"
test_endpoint "CoA" "/coa?tenantId=$TID"
test_endpoint "CoA Templates" "/coa/templates?tenantId=$TID"
test_endpoint "Projections" "/projections?tenantId=$TID"
test_endpoint "Budgets" "/budgets?tenantId=$TID"
test_endpoint "Cash Flow" "/cashflow?tenantId=$TID"
test_endpoint "ETL History" "/etl/history?tenantId=$TID"
test_endpoint "Workflow Chains" "/workflow/chains?tenantId=$TID"
test_endpoint "Reports" "/reports?tenantId=$TID"
test_endpoint "Version Control" "/version-control?tenantId=$TID"
echo ""
echo "=== Testing with acme-corp tenant ==="
TID="acme-corp"
test_endpoint "Financial Statements" "/financial/statements?tenantId=$TID"
test_endpoint "Dimensions" "/dim?tenantId=$TID"
test_endpoint "CoA" "/coa?tenantId=$TID"
test_endpoint "Projections" "/projections?tenantId=$TID"
test_endpoint "Budgets" "/budgets?tenantId=$TID"
