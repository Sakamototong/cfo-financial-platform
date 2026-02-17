#!/bin/bash
# UAT Quick Deployment Script
# Auto-setup CFO Platform on UAT server

set -e  # Exit on error

echo "=========================================="
echo "CFO Platform - UAT Quick Deploy"
echo "Version: v0.1.0"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please do not run as root. Run as regular user with sudo access.${NC}"
   exit 1
fi

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."
echo ""

if command_exists docker; then
    echo -e "${GREEN}✅ Docker installed: $(docker --version)${NC}"
else
    echo -e "${YELLOW}⚠️  Docker not found. Installing...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo -e "${GREEN}✅ Docker installed${NC}"
    echo -e "${YELLOW}⚠️  Please logout and login again, then re-run this script${NC}"
    exit 0
fi

if command_exists docker-compose; then
    echo -e "${GREEN}✅ Docker Compose installed: $(docker-compose --version)${NC}"
else
    echo -e "${YELLOW}⚠️  Docker Compose not found. Installing...${NC}"
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
fi

if command_exists git; then
    echo -e "${GREEN}✅ Git installed: $(git --version)${NC}"
else
    echo -e "${RED}❌ Git not found. Please install: sudo apt install git${NC}"
    exit 1
fi

if command_exists node; then
    echo -e "${GREEN}✅ Node.js installed: $(node --version)${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js not found. Installing...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    echo -e "${GREEN}✅ Node.js installed${NC}"
fi

echo ""

# Step 2: Check if already deployed
echo "📂 Step 2: Checking deployment directory..."
echo ""

DEPLOY_DIR="/opt/cfo-platform"

if [ -d "$DEPLOY_DIR" ]; then
    echo -e "${YELLOW}⚠️  Directory $DEPLOY_DIR already exists${NC}"
    read -p "Do you want to reinstall? (This will backup and remove existing installation) [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Creating backup..."
        sudo tar -czf /tmp/cfo-platform-backup-$(date +%Y%m%d-%H%M%S).tar.gz $DEPLOY_DIR
        echo -e "${GREEN}✅ Backup created in /tmp/${NC}"
        
        echo "Stopping services..."
        cd $DEPLOY_DIR
        docker-compose -f infra/docker-compose.yml down
        
        echo "Removing old installation..."
        sudo rm -rf $DEPLOY_DIR
    else
        echo "Exiting..."
        exit 0
    fi
fi

# Step 3: Create directory and clone repository
echo "📥 Step 3: Cloning repository..."
echo ""

sudo mkdir -p $DEPLOY_DIR
sudo chown $USER:$USER $DEPLOY_DIR

cd $DEPLOY_DIR
git clone https://github.com/Sakamototong/cfo-financial-platform.git .

echo -e "${GREEN}✅ Repository cloned${NC}"
echo ""

# Step 4: Generate environment configuration
echo "🔑 Step 4: Generating environment configuration..."
echo ""

# Generate KMS master key
KMS_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
PG_PASSWORD=$(openssl rand -base64 32)
KC_ADMIN_PASSWORD=$(openssl rand -base64 32)
KC_CLIENT_SECRET=$(openssl rand -hex 32)

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

# Create .env file
cat > .env << EOF
# CFO Platform UAT Environment
# Generated: $(date)

# === Security & Encryption ===
KMS_MASTER_KEY=${KMS_KEY}

# === Database ===
PG_ROOT_USER=postgres
PG_ROOT_PASSWORD=${PG_PASSWORD}
PG_HOST=db
PG_PORT=5432
PG_DATABASE=postgres

# === Backend ===
PORT=3000
NODE_ENV=production
API_PREFIX=api

# === Keycloak ===
KEYCLOAK_HOST=http://keycloak:8080
KEYCLOAK_CLIENT_ID=cfo-client
KEYCLOAK_CLIENT_SECRET=${KC_CLIENT_SECRET}
KEYCLOAK_REALM=master
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${KC_ADMIN_PASSWORD}

# === Frontend ===
VITE_API_BASE=http://${SERVER_IP}:3000
VITE_KEYCLOAK_URL=http://${SERVER_IP}:8081
VITE_KEYCLOAK_REALM=master
VITE_KEYCLOAK_CLIENT_ID=cfo-client

# === Security ===
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
CORS_ORIGIN=http://${SERVER_IP}:5173,http://localhost:5173

# === Monitoring ===
LOG_LEVEL=info
ENABLE_SWAGGER=false
DEBUG=false
EOF

echo -e "${GREEN}✅ Environment configured${NC}"
echo ""

# Save credentials to file
cat > /tmp/cfo-uat-credentials.txt << EOF
========================================
CFO Platform UAT Credentials
========================================
Generated: $(date)

Server IP: ${SERVER_IP}

=== PostgreSQL ===
Username: postgres
Password: ${PG_PASSWORD}

=== Keycloak Admin ===
URL: http://${SERVER_IP}:8081
Username: admin
Password: ${KC_ADMIN_PASSWORD}

=== Application URLs ===
Backend API: http://${SERVER_IP}:3000
Frontend: http://${SERVER_IP}:5173
API Docs: http://${SERVER_IP}:3000/api

=== Test Users ===
After deployment, create users via:
./infra/create-super-admin-user.sh

========================================
⚠️  IMPORTANT: Save these credentials securely!
⚠️  This file will be deleted after 10 minutes.
========================================
EOF

chmod 600 /tmp/cfo-uat-credentials.txt

echo -e "${YELLOW}⚠️  Credentials saved to: /tmp/cfo-uat-credentials.txt${NC}"
echo -e "${YELLOW}⚠️  Please save these credentials NOW!${NC}"
echo ""
cat /tmp/cfo-uat-credentials.txt
echo ""
read -p "Press Enter after you've saved the credentials..."

# Schedule credential file deletion
(sleep 600 && rm -f /tmp/cfo-uat-credentials.txt) &

# Step 5: Build Docker images
echo "🐳 Step 5: Building Docker images..."
echo ""

export KMS_MASTER_KEY=${KMS_KEY}
cd $DEPLOY_DIR/infra
docker-compose build

echo -e "${GREEN}✅ Docker images built${NC}"
echo ""

# Step 6: Start services
echo "🚀 Step 6: Starting services..."
echo ""

docker-compose up -d

echo "Waiting for services to be ready (30 seconds)..."
sleep 30

echo -e "${GREEN}✅ Services started${NC}"
echo ""

# Step 7: Check services
echo "🔍 Step 7: Checking service health..."
echo ""

# Check docker containers
echo "Docker containers:"
docker-compose ps

echo ""

# Check backend health
if curl -s http://localhost:3000/health > /dev/null; then
    echo -e "${GREEN}✅ Backend is healthy${NC}"
else
    echo -e "${RED}❌ Backend health check failed${NC}"
fi

# Check database
if docker-compose exec -T db psql -U postgres -c "SELECT version();" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database is healthy${NC}"
else
    echo -e "${RED}❌ Database health check failed${NC}"
fi

echo ""

# Step 8: Run E2E tests
echo "🧪 Step 8: Running E2E tests (optional)..."
echo ""

read -p "Do you want to run E2E tests? (takes ~30 seconds) [Y/n]: " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    cd $DEPLOY_DIR
    
    # Install Python dependencies
    if command_exists pip3; then
        pip3 install -q requests colorama
    fi
    
    # Run tests
    chmod +x run-e2e-test.sh
    ./run-e2e-test.sh
    
    echo ""
fi

# Step 9: Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ UAT Deployment Complete!${NC}"
echo "=========================================="
echo ""
echo "📍 Server IP: ${SERVER_IP}"
echo ""
echo "🌐 Application URLs:"
echo "   Backend API:  http://${SERVER_IP}:3000"
echo "   Frontend:     http://${SERVER_IP}:5173"
echo "   API Docs:     http://${SERVER_IP}:3000/api"
echo "   Keycloak:     http://${SERVER_IP}:8081"
echo ""
echo "👤 Admin Credentials:"
echo "   Keycloak Admin: admin / (see credentials file)"
echo "   Database: postgres / (see credentials file)"
echo ""
echo "📚 Next Steps:"
echo "   1. Review credentials: /tmp/cfo-uat-credentials.txt"
echo "   2. Create test users: cd $DEPLOY_DIR && ./infra/create-super-admin-user.sh"
echo "   3. Configure firewall: sudo ufw allow 3000,5173,8081/tcp"
echo "   4. Setup SSL/HTTPS (production)"
echo "   5. Review deployment guide: $DEPLOY_DIR/UAT-DEPLOYMENT-GUIDE.md"
echo ""
echo "🔧 Useful Commands:"
echo "   View logs:    cd $DEPLOY_DIR/infra && docker-compose logs -f"
echo "   Restart:      cd $DEPLOY_DIR/infra && docker-compose restart"
echo "   Stop:         cd $DEPLOY_DIR/infra && docker-compose down"
echo "   Start:        cd $DEPLOY_DIR/infra && docker-compose up -d"
echo ""
echo "=========================================="
