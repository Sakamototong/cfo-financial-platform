#!/bin/bash
#
# CFO Platform E2E Test Runner
# ============================
# Wrapper script to run end-to-end system test with automatic prerequisite checks
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3000"
SWAGGER_URL="http://localhost:3000/api"
FRONTEND_URL="http://localhost:8080"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${SCRIPT_DIR}/infra"

# Functions
print_header() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_step() {
    echo -e "${CYAN}→${NC} $1"
}

check_docker() {
    print_step "Checking Docker..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found. Please install Docker Desktop."
        exit 1
    fi
    
    if ! docker ps &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_success "Docker is running"
}

check_docker_compose() {
    print_step "Checking Docker Compose services..."
    
    cd "${INFRA_DIR}"
    
    # Check if services are running
    if ! docker compose ps | grep -q "Up"; then
        print_warning "Docker services not running. Starting services..."
        docker compose up -d
        
        print_step "Waiting for services to be ready..."
        sleep 15
    else
        print_success "Docker services are running"
    fi
    
    cd "${SCRIPT_DIR}"
}

check_backend() {
    print_step "Checking backend API..."
    
    local max_retries=10
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        if curl -s -f "${BACKEND_URL}/api" > /dev/null 2>&1; then
            print_success "Backend API is accessible at ${BACKEND_URL}"
            return 0
        fi
        
        retry=$((retry + 1))
        if [ $retry -lt $max_retries ]; then
            print_warning "Backend not ready, waiting... (${retry}/${max_retries})"
            sleep 3
        fi
    done
    
    print_error "Backend API is not accessible at ${BACKEND_URL}"
    print_info "Check backend logs: docker compose -f infra/docker-compose.yml logs backend"
    exit 1
}

check_python() {
    print_step "Checking Python..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 not found. Please install Python 3.7+"
        exit 1
    fi
    
    local python_version=$(python3 --version | awk '{print $2}')
    print_success "Python ${python_version} found"
}

check_dependencies() {
    print_step "Checking Python dependencies..."
    
    if ! python3 -c "import requests" 2>&1 > /dev/null; then
        print_warning "requests library not found. Installing..."
        pip3 install requests
    fi
    
    print_success "Python dependencies installed"
}

show_summary() {
    echo ""
    print_header "Test Environment Summary"
    echo ""
    echo "  Backend API:   ${BACKEND_URL}"
    echo "  Swagger Docs:  ${SWAGGER_URL}"
    echo "  Frontend UI:   ${FRONTEND_URL}"
    echo "  Test Script:   ${SCRIPT_DIR}/test-company-e2e.py"
    echo ""
}

run_test() {
    print_header "Running End-to-End System Test"
    echo ""
    
    # Parse arguments
    local test_args=""
    local verbose=false
    local no_cleanup=false
    
    for arg in "$@"; do
        case $arg in
            --verbose|-v)
                verbose=true
                test_args="${test_args} --verbose"
                ;;
            --no-cleanup)
                no_cleanup=true
                test_args="${test_args} --no-cleanup"
                ;;
            --no-demo-tokens)
                test_args="${test_args} --no-demo-tokens"
                ;;
            --help|-h)
                python3 "${SCRIPT_DIR}/test-company-e2e.py" --help
                exit 0
                ;;
            *)
                print_error "Unknown argument: $arg"
                print_info "Use --help to see available options"
                exit 1
                ;;
        esac
    done
    
    # Run the test
    if python3 "${SCRIPT_DIR}/test-company-e2e.py" ${test_args}; then
        echo ""
        print_header "Test Completed Successfully!"
        
        if [ "$no_cleanup" = true ]; then
            echo ""
            print_info "Test data was kept (--no-cleanup flag used)"
            print_info "You can inspect the data:"
            echo ""
            echo "  Database:  docker compose -f infra/docker-compose.yml exec db psql -U postgres -d acme-corp"
            echo "  Frontend:  ${FRONTEND_URL} (login: admin@acme-corp.com / Admin123!)"
            echo "  Swagger:   ${SWAGGER_URL}"
            echo ""
            print_warning "To cleanup manually, run:"
            echo "  python3 test-company-e2e.py --cleanup-only"
            echo ""
        fi
        
        return 0
    else
        echo ""
        print_header "Test Failed"
        echo ""
        print_info "Troubleshooting tips:"
        echo ""
        echo "  1. Check backend logs:"
        echo "     docker compose -f infra/docker-compose.yml logs backend | tail -50"
        echo ""
        echo "  2. Check database:"
        echo "     docker compose -f infra/docker-compose.yml exec db psql -U postgres -l"
        echo ""
        echo "  3. Restart services:"
        echo "     cd infra && docker compose restart"
        echo ""
        echo "  4. Run with verbose output:"
        echo "     ./run-e2e-test.sh --verbose"
        echo ""
        return 1
    fi
}

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Run CFO Platform End-to-End System Test"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -v, --verbose       Enable verbose logging"
    echo "  --no-cleanup        Keep test data after test"
    echo "  --no-demo-tokens    Use real authentication"
    echo ""
    echo "Examples:"
    echo "  $0                       # Run basic test"
    echo "  $0 --verbose             # Run with detailed logs"
    echo "  $0 --verbose --no-cleanup # Run and keep test data"
    echo ""
}

# Main execution
main() {
    # Show help if requested
    if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
        show_help
        exit 0
    fi
    
    print_header "CFO Platform E2E Test - Pre-flight Checks"
    echo ""
    
    # Run all checks
    check_docker
    check_docker_compose
    check_backend
    check_python
    check_dependencies
    
    echo ""
    print_success "All prerequisites passed!"
    
    # Show summary
    show_summary
    
    # Run the test
    run_test "$@"
}

# Run main function
main "$@"
