#!/bin/bash

# bunq API testen — voer dit uit met jouw API key

API_KEY="${1:-}"
ENVIRONMENT="${2:-sandbox}"

if [ -z "$API_KEY" ]; then
  echo "Usage: bash test-bunq.sh 'jouw_api_key_hier' [sandbox|production]"
  exit 1
fi

BASE_URL="https://public-api.sandbox.bunq.com/v1"
if [ "$ENVIRONMENT" = "production" ]; then
  BASE_URL="https://api.bunq.com/v1"
fi

echo "🔗 Testing bunq API ($ENVIRONMENT)..."
echo "API Key: ${API_KEY:0:10}..."
echo ""

# Stap 1: User info ophalen
echo "1️⃣  Fetching user info..."
USER_RESPONSE=$(curl -s -X GET "$BASE_URL/user" \
  -H "X-Bunq-Client-Request-Id: $(uuidgen)" \
  -H "X-Bunq-Client-Authentication: Bearer $API_KEY" \
  -H "Cache-Control: no-cache" \
  -H "User-Agent: SquashBot/1.0" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$USER_RESPONSE" | tail -n 1)
USER_JSON=$(echo "$USER_RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response: $USER_JSON"
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ API key geldig? Status $HTTP_CODE — check je credentials."
  exit 1
fi

# Parse User ID
USER_ID=$(echo "$USER_JSON" | grep -o '"id": [0-9]*' | head -1 | grep -o '[0-9]*')

if [ -z "$USER_ID" ]; then
  echo "❌ User ID niet gevonden in response"
  echo "Volledige response: $USER_JSON"
  exit 1
fi

echo "✅ User ID: $USER_ID"
echo ""

# Stap 2: Accounts ophalen
echo "2️⃣  Fetching monetary accounts..."
ACCOUNT_RESPONSE=$(curl -s -X GET "$BASE_URL/user/$USER_ID/monetary-account" \
  -H "X-Bunq-Client-Request-Id: $(uuidgen)" \
  -H "X-Bunq-Client-Authentication: Bearer $API_KEY" \
  -H "Cache-Control: no-cache" \
  -H "User-Agent: SquashBot/1.0" \
  -w "\n%{http_code}")

HTTP_CODE=$(echo "$ACCOUNT_RESPONSE" | tail -n 1)
ACCOUNT_JSON=$(echo "$ACCOUNT_RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response (first 500 chars): ${ACCOUNT_JSON:0:500}..."
echo ""

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Kon accounts niet ophalen. Status $HTTP_CODE"
  echo "Volledige response: $ACCOUNT_JSON"
  exit 1
fi

# Parse Account ID
ACCOUNT_ID=$(echo "$ACCOUNT_JSON" | grep -o '"id": [0-9]*' | head -1 | grep -o '[0-9]*')

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Account ID niet gevonden"
  echo "Volledige response: $ACCOUNT_JSON"
  exit 1
fi

echo "✅ Account ID: $ACCOUNT_ID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Succes! Gebruik deze waarden in je instellingen:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "bunqApiKey:    $API_KEY"
echo "bunqUserId:    $USER_ID"
echo "bunqAccountId: $ACCOUNT_ID"
echo "bunqEnvironment: $ENVIRONMENT"
echo ""
echo "Of stuur deze naar: POST /api/bunq/discover"
echo "  {\"apiKey\":\"$API_KEY\",\"environment\":\"$ENVIRONMENT\"}"
