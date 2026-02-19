#!/bin/bash
TOKEN="demo-token-super-admin-$(date +%s)"
BASE="http://localhost:3000"
TID="admin"

test_ep() {
  local name="$1"
  local path="$2"
  local hdr="$3"
  local code
  code=$(curl -s -o /tmp/api_resp -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H "x-tenant-id: $hdr" "${BASE}${path}")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "OK $name -> $code"
  else
    local body
    body=$(cat /tmp/api_resp | head -c 200)
    echo "FAIL $name -> $code : $body"
  fi
}

echo "=== admin tenant ==="
test_ep "Financial" "/financial/statements" "$TID"
test_ep "Scenarios" "/scenarios" "$TID"
test_ep "Dimensions" "/dim/dimensions" "$TID"
test_ep "DimTemplates" "/dim/templates" "$TID"
test_ep "CoA" "/coa" "$TID"
test_ep "CoATemplates" "/coa/templates" "$TID"
test_ep "Projections" "/projections/list" "$TID"
test_ep "Budgets" "/budgets" "$TID"
test_ep "CashFlowForecasts" "/cashflow/forecasts" "$TID"
test_ep "CashFlowCategories" "/cashflow/categories" "$TID"
test_ep "ETLImports" "/etl/imports" "$TID"
test_ep "ETLTemplates" "/etl/templates" "$TID"
test_ep "WorkflowChains" "/workflow/chains" "$TID"
test_ep "VersionStats" "/version-control/stats" "$TID"
test_ep "Versions" "/version-control/versions" "$TID"
echo ""
echo "=== acme-corp ==="
TID="acme-corp"
test_ep "Financial" "/financial/statements" "$TID"
test_ep "Scenarios" "/scenarios" "$TID"
test_ep "Dimensions" "/dim/dimensions" "$TID"
test_ep "DimTemplates" "/dim/templates" "$TID"
test_ep "CoA" "/coa" "$TID"
test_ep "CoATemplates" "/coa/templates" "$TID"
test_ep "Projections" "/projections/list" "$TID"
test_ep "Budgets" "/budgets" "$TID"
test_ep "CashFlowForecasts" "/cashflow/forecasts" "$TID"
test_ep "CashFlowCategories" "/cashflow/categories" "$TID"
test_ep "ETLImports" "/etl/imports" "$TID"
test_ep "WorkflowChains" "/workflow/chains" "$TID"
