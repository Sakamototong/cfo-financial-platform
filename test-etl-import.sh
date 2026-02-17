#!/bin/bash

# Test Enhanced ETL Import
echo "=== Enhanced ETL Import Test ==="
echo ""

# Get QuickBooks template ID
echo "1. Getting QuickBooks template..."
TEMPLATE_ID=$(curl -s http://localhost:3000/etl/templates | jq -r '.[] | select(.template_type == "quickbooks") | .id')
echo "Template ID: $TEMPLATE_ID"
echo ""

# Sample transaction data (QuickBooks format)
echo "2. Importing sample transactions..."
curl -s -X POST http://localhost:3000/etl/import \
  -H "Content-Type: application/json" \
  -d "{
    \"template_id\": \"$TEMPLATE_ID\",
    \"file_data\": [
      {
        \"Date\": \"01/15/2026\",
        \"Memo/Description\": \"Office supplies purchase\",
        \"Amount\": 250.50,
        \"Account\": \"6300\",
        \"Name\": \"Office Depot\",
        \"Transaction Type\": \"Expense\"
      },
      {
        \"Date\": \"01/16/2026\",
        \"Memo/Description\": \"Software license - Microsoft 365\",
        \"Amount\": 1200.00,
        \"Account\": \"6400\",
        \"Name\": \"Microsoft\",
        \"Transaction Type\": \"Expense\"
      },
      {
        \"Date\": \"01/17/2026\",
        \"Memo/Description\": \"Client payment - Project ABC invoice\",
        \"Amount\": 5000.00,
        \"Account\": \"4100\",
        \"Name\": \"ABC Corp\",
        \"Transaction Type\": \"Income\"
      },
      {
        \"Date\": \"01/18/2026\",
        \"Memo/Description\": \"Monthly salary payment - January\",
        \"Amount\": 3500.00,
        \"Account\": \"6100\",
        \"Name\": \"John Doe\",
        \"Transaction Type\": \"Expense\"
      },
      {
        \"Date\": \"01/19/2026\",
        \"Memo/Description\": \"Office rent - February payment\",
        \"Amount\": 2000.00,
        \"Account\": \"6200\",
        \"Name\": \"Landlord LLC\",
        \"Transaction Type\": \"Expense\"
      }
    ],
    \"auto_approve\": false
  }" | jq '.'

echo ""
echo "3. Checking import logs..."
curl -s http://localhost:3000/etl/imports | jq '.[] | {id, status, total_rows, valid_rows, invalid_rows, file_name}'

echo ""
echo "4. Viewing imported transactions..."
curl -s http://localhost:3000/etl/transactions | jq '.[] | {id, date: .transaction_date, description, amount, account: .account_code, status}'

echo ""
echo "✅ ETL Import test complete!"
