#!/bin/bash
# CFO Platform - Docker Compose Startup Script
# Usage: ./start.sh

set -e  # Exit on error

echo "🚀 CFO Platform - Quick Start"
echo "=============================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Step 1: Check Prerequisites
echo "Step 1/4: Checking Prerequisites..."
echo "-----------------------------------"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi
print_success "Docker found: $(docker --version)"

# Check Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi
print_success "Docker is running"

# Check Node.js (for KMS key generation only)
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed (needed for KMS key generation)"
    echo "Please install Node.js 18+ from: https://nodejs.org"
    exit 1
fi
print_success "Node.js found: $(node --version)"

echo ""

# Step 2: Generate KMS Master Key
echo "Step 2/4: Setting up KMS Master Key..."
echo "---------------------------------------"

if [ -z "$KMS_MASTER_KEY" ]; then
    export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    print_success "Generated KMS_MASTER_KEY"
    
    # Save to .env file for future use
    echo "export KMS_MASTER_KEY=\"$KMS_MASTER_KEY\"" > .env.local
    echo "# Optional: Set OpenAI API key for Swagger AI assistant" >> .env.local
    echo "#export OPENAI_API_KEY=\"sk-...\"" >> .env.local
    print_info "Saved to .env.local (source this file in future sessions)"
    print_info "Next time run: source .env.local && ./start.sh"
else
    print_success "Using existing KMS_MASTER_KEY"
fi

echo ""

# Step 3: Start All Docker Services
echo "Step 3/4: Starting Docker Services..."
echo "--------------------------------------"

cd infra

# Check if services are already running
if docker compose ps 2>/dev/null | grep -q "Up"; then
    print_warning "Some services already running. Use 'npm run restart' if needed."
    print_info "To restart: docker compose restart"
else
    print_info "Starting all services (db, keycloak, backend, frontend)..."
    docker compose up -d
    print_info "Waiting for services to initialize (15 seconds)..."
    sleep 15
fi

# Check container status
RUNNING=$(docker compose ps --services --filter "status=running" 2>/dev/null | wc -l | tr -d ' ')
TOTAL=$(docker compose ps --services 2>/dev/null | wc -l | tr -d ' ')

if [ "$RUNNING" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
    print_success "All $TOTAL services are running"
    docker compose ps
else
    print_warning "$RUNNING/$TOTAL services running"
    docker compose ps
fi

cd ..
echo ""

# Step 4: Verify Services
echo "Step 4/4: Verifying Access..."
echo "------------------------------"

print_info "Checking Backend API..."
if curl -s http://localhost:3000/api > /dev/null 2>&1; then
    print_success "Backend API is accessible"
else
    print_warning "Backend may still be starting (this is normal)"
    print_info "Check logs: npm run logs:backend"
fi

print_info "Checking Frontend..."
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    print_success "Frontend is accessible"
else
    print_warning "Frontend may still be starting (this is normal)"
    print_info "Check logs: npm run logs:frontend"
fi

echo ""

# Show Access Information
echo "=============================="
echo "🎉 CFO Platform is Ready!"
echo "=============================="
echo ""
print_success "All services are running in Docker containers"
echo ""
echo "📍 Access Points:"
echo "   Frontend:  http://localhost:8080"
echo "   Backend:   http://localhost:3000"
echo "   Swagger:   http://localhost:3000/api"
echo "   Keycloak:  http://localhost:8081"
echo "   Database:  localhost:5432"
echo ""
echo "👤 Default Login:"
echo "   Username: admin"
echo "   Password: admin"
echo ""
echo "📚 Quick Reference:"
echo "   - User Guide:    USER_JOURNEY_QUICK_REF.md"
echo "   - API Docs:      http://localhost:3000/api"
echo ""
echo "🔧 Useful Commands:"
echo "   - View logs:     npm run logs"
echo "   - Stop all:      npm stop"
echo "   - Restart:       npm run restart"
echo "   - Status:        npm run status"
echo ""
echo "💡 Development Mode (with hot-reload):"
echo "   - Backend:  cd backend && npm run start:dev"
echo "   - Frontend: cd frontend && npm run dev (port 5173)"
echo ""
print_info "Your KMS_MASTER_KEY is saved in .env.local"
print_info "Next time: source .env.local && npm start"
echo ""
