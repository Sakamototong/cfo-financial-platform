#!/bin/bash
# Health Check Script for CFO Platform
# Run this to verify all services are working correctly

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "=========================================="
echo "CFO Platform - Health Check"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0
FRONTEND_PORT=${FRONTEND_PORT:-8080}

# Function to check and report
check_service() {
    local service_name=$1
    local check_command=$2
    
    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ ${service_name}: OK${NC}"
        return 0
    else
        echo -e "${RED}❌ ${service_name}: FAILED${NC}"
        ((ERRORS++))
        return 1
    fi
}

# Function for warnings
check_warning() {
    local service_name=$1
    local check_command=$2
    local warning_message=$3
    
    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ ${service_name}: OK${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠️  ${service_name}: ${warning_message}${NC}"
        ((WARNINGS++))
        return 1
    fi
}

# Pre-flight: check port availability before services start
check_port_available() {
    local port=$1
    local name=$2
    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Port ${port} (${name}) is already in use${NC}"
        ((WARNINGS++))
        return 1
    else
        echo -e "${GREEN}✅ Port ${port} (${name}) is available${NC}"
        return 0
    fi
}

echo "🔌 Pre-flight: checking port availability..."
check_port_available 3000 "Backend"
check_port_available "${FRONTEND_PORT}" "Frontend (override with FRONTEND_PORT=<port>)"
check_port_available 5432 "PostgreSQL"
check_port_available 8081 "Keycloak"
echo ""

# Check Docker
echo "🐳 Checking Docker..."
check_service "Docker daemon" "docker ps"
echo ""

# Check Docker Compose
echo "🐳 Checking Docker Compose..."
if [ -d "infra" ]; then
    cd infra
fi

check_service "Docker Compose services" "docker-compose ps"
echo ""

# Check individual containers
echo "📦 Checking containers..."
check_service "Backend container" "docker-compose ps backend | grep -q Up"
check_service "Database container" "docker-compose ps db | grep -q Up"
check_service "Keycloak container" "docker-compose ps keycloak | grep -q Up"
echo ""

# Check backend health endpoint
echo "🔍 Checking backend health..."
check_service "Backend health endpoint" "curl -sf http://localhost:3000/health"

# Check backend response time
BACKEND_RESPONSE=$(curl -o /dev/null -s -w '%{time_total}\n' http://localhost:3000/health 2>/dev/null || echo "999")
if (( $(echo "$BACKEND_RESPONSE < 2" | bc -l) )); then
    echo -e "${GREEN}✅ Backend response time: ${BACKEND_RESPONSE}s (good)${NC}"
else
    echo -e "${YELLOW}⚠️  Backend response time: ${BACKEND_RESPONSE}s (slow)${NC}"
    ((WARNINGS++))
fi
echo ""

# Check database
echo "💾 Checking database..."
check_service "Database connection" "docker-compose exec -T db psql -U postgres -c 'SELECT 1'"
check_service "Database admin tenant" "docker-compose exec -T db psql -U postgres -d admin -c 'SELECT 1'"

# Check database size
DB_SIZE=$(docker-compose exec -T db psql -U postgres -c "SELECT pg_size_pretty(pg_database_size('postgres'));" -t 2>/dev/null | tr -d ' ')
echo -e "${GREEN}ℹ️  Database size: ${DB_SIZE}${NC}"
echo ""

# Check Keycloak
echo "🔐 Checking Keycloak..."
check_service "Keycloak health" "curl -sf http://localhost:8081/health"
echo ""

# Check ports
echo "🔌 Checking ports..."
check_service "Backend port (3000)" "nc -z localhost 3000"
check_service "Frontend port (${FRONTEND_PORT})" "nc -z localhost ${FRONTEND_PORT}"
check_service "Database port (5432)" "nc -z localhost 5432"
check_service "Keycloak port (8081)" "nc -z localhost 8081"
echo ""

# Check disk space
echo "💿 Checking disk space..."
DISK_USAGE=$(df -h . | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo -e "${GREEN}✅ Disk usage: ${DISK_USAGE}% (OK)${NC}"
else
    echo -e "${YELLOW}⚠️  Disk usage: ${DISK_USAGE}% (running low)${NC}"
    ((WARNINGS++))
fi

DOCKER_DISK=$(docker system df --format "{{.Type}}\t{{.Size}}" 2>/dev/null | awk '{sum+=$2} END {print sum}')
echo -e "${GREEN}ℹ️  Docker disk usage: ${DOCKER_DISK}${NC}"
echo ""

# Check memory
echo "🧠 Checking memory..."
FREE_MEM=$(free -m | awk 'NR==2{print $7}')
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
MEM_PERCENT=$((100 - (FREE_MEM * 100 / TOTAL_MEM)))

if [ "$MEM_PERCENT" -lt 90 ]; then
    echo -e "${GREEN}✅ Memory usage: ${MEM_PERCENT}% (OK)${NC}"
else
    echo -e "${YELLOW}⚠️  Memory usage: ${MEM_PERCENT}% (high)${NC}"
    ((WARNINGS++))
fi
echo ""

# Check logs for errors (last 100 lines)
echo "📋 Checking logs for errors..."
ERROR_COUNT=$(docker-compose logs --tail=100 2>/dev/null | grep -ci "error\|exception\|fatal" || echo "0")
if [ "$ERROR_COUNT" -eq 0 ]; then
    echo -e "${GREEN}✅ No recent errors in logs${NC}"
else
    echo -e "${YELLOW}⚠️  Found ${ERROR_COUNT} error messages in recent logs${NC}"
    ((WARNINGS++))
fi
echo ""

# Check SSL certificates (if applicable)
echo "🔒 Checking SSL..."
if [ -f "/etc/ssl/certs/cfo-platform.crt" ]; then
    EXPIRY=$(openssl x509 -enddate -noout -in /etc/ssl/certs/cfo-platform.crt | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))
    
    if [ "$DAYS_LEFT" -gt 30 ]; then
        echo -e "${GREEN}✅ SSL certificate: ${DAYS_LEFT} days until expiry${NC}"
    elif [ "$DAYS_LEFT" -gt 7 ]; then
        echo -e "${YELLOW}⚠️  SSL certificate: ${DAYS_LEFT} days until expiry (renew soon)${NC}"
        ((WARNINGS++))
    else
        echo -e "${RED}❌ SSL certificate: ${DAYS_LEFT} days until expiry (URGENT)${NC}"
        ((ERRORS++))
    fi
else
    echo -e "${YELLOW}⚠️  SSL certificate not found (using HTTP)${NC}"
    ((WARNINGS++))
fi
echo ""

# Summary
echo "=========================================="
echo "Health Check Summary"
echo "=========================================="

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC}"
    echo "System is healthy and ready for use."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  ${WARNINGS} warning(s) found${NC}"
    echo "System is operational but needs attention."
    exit 0
else
    echo -e "${RED}❌ ${ERRORS} error(s) and ${WARNINGS} warning(s) found${NC}"
    echo "System has issues that need immediate attention."
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   - View logs: docker-compose logs -f"
    echo "   - Restart services: docker-compose restart"
    echo "   - Check disk space: df -h"
    echo "   - Check memory: free -m"
    exit 1
fi
