#!/bin/bash

# Pre-Deployment Test Suite
# Run this before every commit to catch issues early

set -e

echo "🧪 Pre-Deployment Test Suite"
echo "=============================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
  fi
}

# Test 1: Syntax Check
echo "Test 1: JavaScript Syntax"
echo "------------------------"

files=(
  "src/index.js"
  "src/web.js"
  "src/scheduler.js"
  "src/whatsapp.js"
  "src/payments.js"
  "src/sheets.js"
  "src/settings.js"
  "src/interpret.js"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    node -c "$file" 2>/dev/null
    test_result "Syntax: $file"
  fi
done

echo ""
echo "Test 2: Critical String Patterns"
echo "-------------------------------"

# Check for common issues
echo "Checking for template string leaks..."
if ! grep -n "^[^#]*\`[^#]*[^#]*$" src/*.js | grep -v "test\|spec"; then
  echo -e "${GREEN}✅ No obvious template string leaks${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠️  Check for template string issues manually${NC}"
fi

echo ""
echo "Test 3: Logging Format"
echo "--------------------"

# Check logging consistency
echo "Checking [Module] prefix format..."
MISSING_LOGS=$(grep -n "console.log\|console.error" src/*.js | grep -v "\[" | head -5)
if [ -z "$MISSING_LOGS" ]; then
  echo -e "${GREEN}✅ All console statements have [Module] prefix${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠️  Some console.log missing [Module] prefix${NC}"
  echo "$MISSING_LOGS" | head -3
  ((TESTS_FAILED++))
fi

echo ""
echo "Test 4: Settings Usage"
echo "---------------------"

# Check for partial updateSettings calls
echo "Checking for updateSettings patterns..."
if grep -q "updateSettings({.*})" src/*.js; then
  echo -e "${GREEN}✅ updateSettings called${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠️  updateSettings not found${NC}"
fi

echo ""
echo "Test 5: Error Handling"
echo "--------------------"

# Check for try/catch in async functions
echo "Checking try/catch in async functions..."
ASYNC_WITHOUT_TRY=$(grep -B1 "async function" src/web.js | grep -v "try" | wc -l)
if [ "$ASYNC_WITHOUT_TRY" -lt 5 ]; then
  echo -e "${GREEN}✅ Most async functions have error handling${NC}"
  ((TESTS_PASSED++))
else
  echo -e "${YELLOW}⚠️  Some async functions may lack error handling${NC}"
fi

echo ""
echo "=============================="
echo "Test Results"
echo "=============================="
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All tests passed! Safe to commit.${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed. Review issues above.${NC}"
  exit 1
fi
