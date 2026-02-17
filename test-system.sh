#!/bin/bash

echo "======================================"
echo "CFO Platform - System Health Check"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

test_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# 1. Docker Services
echo "1️⃣  Checking Docker Services..."
docker compose -f infra/docker-compose.yml ps | grep -q "Up"
test_result $? "Docker services are running"
echo ""

# 2. Backend API
echo "2️⃣  Testing Backend API..."
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$BACKEND_RESPONSE" == "404" ] || [ "$BACKEND_RESPONSE" == "200" ]; then
    test_result 0 "Backend is responding (HTTP $BACKEND_RESPONSE)"
else
    test_result 1 "Backend is not responding"
fi
echo ""

# 3. Frontend
echo "3️⃣  Testing Frontend..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
if [ "$FRONTEND_RESPONSE" == "200" ]; then
    test_result 0 "Frontend is accessible (HTTP 200)"
else
    test_result 1 "Frontend is not accessible (HTTP $FRONTEND_RESPONSE)"
fi
echo ""

# 4. Keycloak
echo "4️⃣  Testing Keycloak..."
KEYCLOAK_RESPONSE=$(curl -s http://localhost:8081/realms/master/.well-known/openid-configuration | jq -r '.issuer' 2>/dev/null)
if [ "$KEYCLOAK_RESPONSE" == "http://localhost:8081/realms/master" ]; then
    test_result 0 "Keycloak is running"
else
    test_result 1 "Keycloak is not responding"
fi
echo ""

# 5. Database
echo "5️⃣  Testing Database..."
DB_CHECK=$(docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d postgres -c "SELECT 1;" 2>&1 | grep -c "1 row")
if [ "$DB_CHECK" -gt 0 ]; then
    test_result 0 "PostgreSQL is working"
else
    test_result 1 "PostgreSQL connection failed"
fi

# Check tenants
TENANT_COUNT=$(docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM tenants;" 2>&1 | grep -oE '[0-9]+' | head -1)
if [ "$TENANT_COUNT" -ge 2 ]; then
    test_result 0 "Tenants exist in database ($TENANT_COUNT tenants)"
else
    test_result 1 "Insufficient tenants in database"
fi
echo ""

# 6. Admin Tenant Database
echo "6️⃣  Testing Admin Tenant Database..."
ADMIN_DB_CHECK=$(docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d admin_tenant_db -c "\dt" 2>&1 | grep -c "scenarios")
if [ "$ADMIN_DB_CHECK" -gt 0 ]; then
    test_result 0 "Admin tenant database schema exists"
else
    test_result 1 "Admin tenant database schema missing"
fi

# Check scenarios table structure
SCENARIO_COLS=$(docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d admin_tenant_db -c "\d scenarios" 2>&1 | grep -c "scenario_type")
if [ "$SCENARIO_COLS" -gt 0 ]; then
    test_result 0 "Scenarios table has correct schema"
else
    test_result 1 "Scenarios table schema incomplete"
fi
echo ""

# 7. System Users
echo "7️⃣  Testing System Users..."
ADMIN_USER=$(docker compose -f infra/docker-compose.yml exec -T db psql -U postgres -d postgres -c "SELECT COUNT(*) FROM system_users WHERE role='super_admin';" 2>&1 | grep -oE '[0-9]+' | head -1)
if [ "$ADMIN_USER" -ge 1 ]; then
    test_result 0 "Super admin user exists"
else
    test_result 1 "No super admin user found"
fi
echo ""

# 8. Check for critical errors in backend logs
echo "8️⃣  Checking Backend Logs for Errors..."
CRITICAL_ERRORS=$(docker compose -f infra/docker-compose.yml logs backend --tail=50 2>&1 | grep -i "FATAL\|CRITICAL" | wc -l)
if [ "$CRITICAL_ERRORS" -eq 0 ]; then
    test_result 0 "No critical errors in backend logs"
else
    test_result 1 "Found $CRITICAL_ERRORS critical errors in backend logs"
fi
echo ""

# Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Total Tests: ${YELLOW}$TOTAL_TESTS${NC}"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! System is healthy.${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please check the system.${NC}"
    exit 1
fi
