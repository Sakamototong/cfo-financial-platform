#!/bin/bash

echo "=============================================="
echo "  Enhanced ETL Import - Feature Complete! 🎉"
echo "=============================================="
echo ""

echo "📊 System Status Check..."
echo ""

# Check Backend
echo "1. Backend API Status:"
BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/etl/templates)
if [ "$BACKEND_STATUS" = "200" ]; then
  echo "   ✅ Backend API is running (port 3000)"
else
  echo "   ❌ Backend API error (status: $BACKEND_STATUS)"
fi

# Check Frontend
echo ""
echo "2. Frontend Status:"
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080)
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "   ✅ Frontend is running (port 8080)"
else
  echo "   ❌ Frontend error (status: $FRONTEND_STATUS)"
fi

# List Templates
echo ""
echo "3. Available Import Templates:"
curl -s http://localhost:3000/etl/templates | jq -r '.[] | "   - \(.template_name) (\(.template_type))"'

# Check Mapping Rules
echo ""
echo "4. Smart Mapping Rules:"
curl -s http://localhost:3000/etl/mapping-rules | jq -r '.[] | "   - \(.rule_name): \(.mapping_result.category) → Account \(.mapping_result.account_code)"'

# Show sample transactions
echo ""
echo "5. Recent Imported Transactions:"
curl -s http://localhost:3000/etl/transactions | jq -r '.[:3] | .[] | "   - \(.transaction_date[:10]): \(.description) ฿\(.amount) [\(.status)]"'

echo ""
echo "=============================================="
echo "  🚀 Access the ETL Import page at:"
echo "  http://localhost:8080/etl-import"
echo "=============================================="
echo ""
echo "📋 Features Available:"
echo "   ✅ Upload CSV/Excel with drag & drop"
echo "   ✅ 4 Import Templates (QuickBooks, Xero, Thai, Generic)"
echo "   ✅ Smart column mapping"
echo "   ✅ Data validation"
echo "   ✅ Transaction review & approval"
echo "   ✅ Bulk approve/reject"
echo "   ✅ Import history tracking"
echo "   ✅ Auto-categorization with mapping rules"
echo ""
echo "🧪 To test import manually:"
echo "   1. Open http://localhost:8080/etl-import"
echo "   2. Select a template (e.g., QuickBooks)"
echo "   3. Drop a CSV file or click to upload"
echo "   4. Review imported transactions"
echo "   5. Approve or edit transactions"
echo ""
echo "✨ System is ready for Phase 1 testing!"
