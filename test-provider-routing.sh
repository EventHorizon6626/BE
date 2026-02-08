#!/bin/bash

# Test script for Unified Provider System
# Tests different AGENT_PROVIDER configurations

echo "======================================"
echo "Unified Provider System - Test Script"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="http://localhost:4000"
AUTH_TOKEN="${AUTH_TOKEN:-YOUR_TOKEN_HERE}"

echo "Base URL: $BASE_URL"
echo "Auth Token: ${AUTH_TOKEN:0:20}..."
echo ""

# Function to test an agent endpoint
test_agent() {
  local agent_name=$1
  local provider=$2

  echo -e "${YELLOW}Testing ${agent_name} agent with provider: ${provider}${NC}"

  # Make request
  response=$(curl -s -X POST "$BASE_URL/api/ai/agents/$agent_name" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{
      "stocks": ["AAPL"],
      "timeframe": "1d",
      "period": "30d",
      "days": 7,
      "indicators": ["SMA", "RSI", "MACD"]
    }')

  # Check if response contains _provider field
  if echo "$response" | grep -q '"_provider"'; then
    provider_used=$(echo "$response" | grep -o '"_provider":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✅ Success - Provider used: ${provider_used}${NC}"
  else
    echo -e "${RED}❌ Failed - No _provider field in response${NC}"
    echo "Response: ${response:0:200}..."
  fi
  echo ""
}

# Test 1: Check current AGENT_PROVIDER setting
echo "======================================"
echo "Current Configuration"
echo "======================================"
echo ""

if [ -f ".env" ]; then
  current_provider=$(grep "^AGENT_PROVIDER=" .env | cut -d'=' -f2)
  echo "Current AGENT_PROVIDER: $current_provider"
else
  echo "⚠️  No .env file found"
fi
echo ""

# Test 2: Test all data agents with current provider
echo "======================================"
echo "Testing All Data Agents"
echo "======================================"
echo ""

agents=("candlestick" "earnings" "news" "technical" "fundamentals")

for agent in "${agents[@]}"; do
  test_agent "$agent" "$current_provider"
  sleep 1
done

# Test 3: Instructions for switching providers
echo "======================================"
echo "Provider Switching Instructions"
echo "======================================"
echo ""
echo "To test different providers, update .env and restart the backend:"
echo ""
echo -e "${YELLOW}1. Event-Horizon-AI:${NC}"
echo "   AGENT_PROVIDER=event-horizon-ai"
echo "   npm run dev"
echo ""
echo -e "${YELLOW}2. EH Multi-Agent:${NC}"
echo "   AGENT_PROVIDER=eh-multi-agent"
echo "   npm run dev"
echo ""
echo -e "${YELLOW}3. Google (with fallback):${NC}"
echo "   AGENT_PROVIDER=google"
echo "   npm run dev"
echo ""

# Test 4: Check backend logs
echo "======================================"
echo "Expected Backend Logs"
echo "======================================"
echo ""
echo "Check your backend console for these logs:"
echo ""
echo -e "${GREEN}[Agent Router] Routing {agentName} to provider: {provider}${NC}"
echo -e "${GREEN}[EH-Multi-Agent Data] Calling http://20.74.82.247:8030/data/{agentName}${NC}"
echo -e "${GREEN}[EH-Multi-Agent Data] {agentName} call successful${NC}"
echo -e "${GREEN}[AI Proxy] {agentName} agent completed (provider: {provider})${NC}"
echo ""

# Test 5: Manual curl examples
echo "======================================"
echo "Manual Test Commands"
echo "======================================"
echo ""
echo "Test earnings agent:"
echo ""
echo "curl -X POST http://localhost:4000/api/ai/agents/earnings \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -d '{\"stocks\": [\"AAPL\", \"MSFT\"]}'"
echo ""
echo "Test technical agent:"
echo ""
echo "curl -X POST http://localhost:4000/api/ai/agents/technical \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Authorization: Bearer YOUR_TOKEN' \\"
echo "  -d '{\"stocks\": [\"AAPL\"], \"indicators\": [\"SMA\", \"RSI\", \"MACD\"]}'"
echo ""

echo "======================================"
echo "Test Complete"
echo "======================================"
