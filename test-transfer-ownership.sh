#!/bin/bash
# Test Transfer Ownership API endpoints

BASE_URL="http://localhost:3000"
TENANT_ID="testco"

echo "=== Transfer Ownership API Tests ==="
echo ""

# Use demo token for testing
echo "1. Using demo token..."
TOKEN="demo-token-admin"
TENANT_ID="testco"

echo "✅ Using demo token"
echo ""

# Test 1: Initiate Transfer
echo "2. Initiating ownership transfer..."
TRANSFER_RESPONSE=$(curl -s -X POST "$BASE_URL/users/transfer-ownership" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID" \
  -d '{
    "new_owner_email": "newowner@example.com",
    "reason": "Ownership transfer for testing"
  }')

echo "Response: $TRANSFER_RESPONSE"

TRANSFER_ID=$(echo $TRANSFER_RESPONSE | jq -r '.id // ""')

if [ -z "$TRANSFER_ID" ] || [ "$TRANSFER_ID" = "null" ]; then
  echo "⚠️  Transfer initiation might have failed or returned different format"
else
  echo "✅ Transfer initiated. ID: $TRANSFER_ID"
fi
echo ""

# Test 2: Get Pending Transfers
echo "3. Getting pending transfer requests..."
PENDING_RESPONSE=$(curl -s -X GET "$BASE_URL/users/transfer-ownership/pending" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID")

echo "Pending transfers:"
echo $PENDING_RESPONSE | jq '.'
echo ""

# Test 3: Get All Transfers
echo "4. Getting all transfer requests..."
ALL_RESPONSE=$(curl -s -X GET "$BASE_URL/users/transfer-ownership/all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-tenant-id: $TENANT_ID")

echo "All transfers:"
echo $ALL_RESPONSE | jq '.'
echo ""

# Extract first pending transfer ID for further tests
FIRST_TRANSFER_ID=$(echo $PENDING_RESPONSE | jq -r '.[0].id // ""')

if [ ! -z "$FIRST_TRANSFER_ID" ] && [ "$FIRST_TRANSFER_ID" != "null" ]; then
  echo "5. Testing accept transfer (will fail if not authorized)..."
  ACCEPT_RESPONSE=$(curl -s -X POST "$BASE_URL/users/transfer-ownership/accept" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-tenant-id: $TENANT_ID" \
    -d "{
      \"transfer_request_id\": \"$FIRST_TRANSFER_ID\"
    }")
  
  echo "Accept response: $ACCEPT_RESPONSE"
  echo ""

  echo "6. Testing reject transfer..."
  REJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/users/transfer-ownership/reject" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-tenant-id: $TENANT_ID" \
    -d "{
      \"transfer_request_id\": \"$FIRST_TRANSFER_ID\",
      \"reason\": \"Testing rejection\"
    }")
  
  echo "Reject response: $REJECT_RESPONSE"
  echo ""

  echo "7. Testing cancel transfer..."
  CANCEL_RESPONSE=$(curl -s -X DELETE "$BASE_URL/users/transfer-ownership/$FIRST_TRANSFER_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-tenant-id: $TENANT_ID")
  
  echo "Cancel response: $CANCEL_RESPONSE"
  echo ""
else
  echo "⚠️  No pending transfers found to test accept/reject/cancel"
fi

echo ""
echo "=== Tests Completed ==="
