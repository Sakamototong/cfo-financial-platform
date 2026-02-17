#!/bin/bash

# Get JWT Token from Keycloak
# Usage: ./get-token.sh

KEYCLOAK_URL="http://localhost:8081"
REALM="master"
CLIENT_ID="cfo-client"
USERNAME="admin"  # เปลี่ยนเป็น username ของคุณ
PASSWORD="admin"  # เปลี่ยนเป็น password ของคุณ

echo "🔑 Requesting token from Keycloak..."

RESPONSE=$(curl -s -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=$CLIENT_ID" \
  -d "username=$USERNAME" \
  -d "password=$PASSWORD")

if [ $? -eq 0 ]; then
    TOKEN=$(echo $RESPONSE | jq -r '.access_token')
    
    if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
        echo ""
        echo "✅ Token received successfully!"
        echo ""
        echo "📋 Access Token:"
        echo "$TOKEN"
        echo ""
        
        EXPIRES_IN=$(echo $RESPONSE | jq -r '.expires_in')
        echo "⏱️  Token expires in: $EXPIRES_IN seconds"
        echo ""
        echo "💡 To use in Swagger:"
        echo "   1. Go to http://localhost:3000/api"
        echo "   2. Click 'Authorize' button"
        echo "   3. Paste the token above"
        echo ""
    else
        echo ""
        echo "❌ Failed to get token"
        echo "$RESPONSE"
    fi
else
    echo ""
    echo "❌ Error connecting to Keycloak"
    echo "Please check:"
    echo "  1. Keycloak is running (docker ps)"
    echo "  2. URL is correct: $KEYCLOAK_URL"
fi
