#!/bin/bash
# CFO Platform - Stop Script
# Usage: ./stop.sh

echo "🛑 Stopping CFO Platform..."
echo "==========================="
echo ""

cd infra

# Stop all Docker Compose services
echo "Stopping infrastructure services..."
docker compose down

echo ""
echo "✅ All services stopped"
echo ""
echo "To start again: ./start.sh"
