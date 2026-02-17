#!/bin/bash
# CFO Platform - Health Check Script
# Usage: ./health-check.sh

set -e

echo "🏥 CFO Platform - Health Check"
echo "================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check Backend
echo "Checking Backend API (http://localhost:3000)..."
if curl -s -f http://localhost:3000/api > /dev/null 2>&1; then
    print_success "Backend API: Accessible (Swagger at /api)"
    echo "   Swagger UI: http://localhost:3000/api"
else
    print_error "Backend API: Not responding"
    echo "   Try: npm run logs:backend"
fi

echo ""

# Check Frontend
echo "Checking Frontend (http://localhost:8080)..."
if curl -s -f http://localhost:8080 > /dev/null 2>&1; then
    print_success "Frontend: Accessible (Docker)"
else
    print_error "Frontend: Not accessible"
    echo "   Try: cd infra && docker compose logs frontend"
fi

echo ""

# Check Keycloak
echo "Checking Keycloak (http://localhost:8081)..."
if curl -s -f http://localhost:8081 > /dev/null 2>&1; then
    print_success "Keycloak: Accessible"
else
    print_warning "Keycloak: Not accessible (may be starting)"
    echo "   Try: npm run logs | grep keycloak"
fi

echo ""

# Check Docker Containers
echo "Checking Docker Containers..."
cd infra 2>/dev/null || cd ../infra 2>/dev/null || true

if command -v docker &> /dev/null; then
    RUNNING=$(docker compose ps --services --filter "status=running" 2>/dev/null | wc -l)
    TOTAL=$(docker compose ps --services 2>/dev/null | wc -l)
    
    if [ "$RUNNING" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
        print_success "Docker: All $TOTAL containers running"
        docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
    elif [ "$RUNNING" -gt 0 ]; then
        print_warning "Docker: $RUNNING/$TOTAL containers running"
        docker compose ps
    else
        print_error "Docker: No containers running"
        echo "   Try: npm start"
    fi
else
    print_error "Docker: Not found"
fi

cd .. 2>/dev/null || true

echo ""
echo "================================"
echo "Health Check Complete"
echo ""
echo "If any service is down, try:"
echo "  npm run logs      # View logs"
echo "  npm run restart   # Restart services"
echo "  npm start         # Start all services"
