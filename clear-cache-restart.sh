#!/bin/bash

echo "======================================"
echo "CFO Platform - Clear Cache & Restart"
echo "======================================"
echo ""

# Stop all services
echo "📦 Stopping services..."
docker compose -f infra/docker-compose.yml down 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN"

# Remove old images (optional but recommended)
echo ""
echo "🗑️  Removing old Docker images..."
docker rmi infra-frontend infra-backend 2>/dev/null || echo "Images already removed or not found"

# Rebuild everything
echo ""
echo "🔨 Building fresh Docker images..."
cd /Users/sommanutketpong/Documents/GitHub/project-cfo-poc-4
docker compose -f infra/docker-compose.yml build --no-cache frontend backend 2>&1 | tail -20

# Start services
echo ""
echo "🚀 Starting services..."
docker compose -f infra/docker-compose.yml up -d 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN"

# Wait for services to start
echo ""
echo "⏳ Waiting for services to start (10 seconds)..."
sleep 10

# Check status
echo ""
echo "✅ Service Status:"
docker compose -f infra/docker-compose.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>&1 | grep -v "KMS_MASTER_KEY" | grep -v "WARN"

# Get new bundle name
echo ""
echo "📦 New Frontend Bundle:"
curl -s http://localhost:8080/ | grep -o 'index-[^"]*\.js' | head -1

echo ""
echo "======================================"
echo "✅ System restarted successfully!"
echo "======================================"
echo ""
echo "📝 Next Steps:"
echo "1. Open browser in PRIVATE/INCOGNITO mode"
echo "2. Go to: http://localhost:8080"
echo "3. Login with: admin / admin"
echo ""
echo "Or if using same browser window:"
echo "1. Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
echo "2. Or press F12 → Application → Clear Storage → Clear site data"
echo ""
