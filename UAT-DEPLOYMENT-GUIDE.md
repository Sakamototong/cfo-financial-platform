# UAT Deployment Guide - CFO Financial Platform

**Version**: v0.1.0  
**Target**: UAT Environment  
**Date**: February 17, 2026

---

## 📋 Pre-Deployment Checklist

### Infrastructure Requirements

✅ **Server Specifications:**
- CPU: 4+ cores
- RAM: 8 GB minimum (16 GB recommended)
- Storage: 50 GB+ SSD
- OS: Ubuntu 22.04 LTS or CentOS 8+

✅ **Software Requirements:**
- Docker Engine 24.0+
- Docker Compose 2.20+
- Git 2.30+
- Node.js 18+ (for admin tasks)
- PostgreSQL Client (for database management)

✅ **Network Requirements:**
- Ports: 80, 443, 3000, 5173, 5432, 8081
- Firewall rules configured
- SSL/TLS certificates prepared
- Domain name configured (optional)

✅ **Security Requirements:**
- SSH key-based authentication
- Firewall enabled (UFW/firewalld)
- Fail2ban installed (recommended)
- SSL certificates (Let's Encrypt or commercial)

---

## 🚀 Deployment Steps

### Step 1: Prepare UAT Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Logout and login for group to take effect
```

---

### Step 2: Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/cfo-platform
sudo chown $USER:$USER /opt/cfo-platform
cd /opt/cfo-platform

# Clone from GitHub
git clone https://github.com/Sakamototong/cfo-financial-platform.git .

# Checkout specific version (recommended)
git checkout v0.1.0  # or specific commit hash
```

---

### Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Generate KMS master key
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# Edit .env file
nano .env
```

**Required Environment Variables for UAT:**

```bash
# === UAT Environment Configuration ===

# KMS Encryption (CRITICAL - Generate unique key)
KMS_MASTER_KEY=<GENERATED_BASE64_KEY>

# Database (Change default passwords!)
PG_ROOT_USER=postgres
PG_ROOT_PASSWORD=<STRONG_PASSWORD_HERE>
PG_HOST=db
PG_PORT=5432
PG_DATABASE=postgres

# Backend
PORT=3000
NODE_ENV=production
API_PREFIX=api

# Keycloak (Change default passwords!)
KEYCLOAK_HOST=http://keycloak:8080  # Internal Docker network
KEYCLOAK_CLIENT_ID=cfo-client
KEYCLOAK_CLIENT_SECRET=<GENERATE_NEW_SECRET>
KEYCLOAK_REALM=master
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<STRONG_PASSWORD_HERE>

# Frontend
VITE_API_BASE=http://<UAT_SERVER_IP>:3000
VITE_KEYCLOAK_URL=http://<UAT_SERVER_IP>:8081
VITE_KEYCLOAK_REALM=master
VITE_KEYCLOAK_CLIENT_ID=cfo-client

# Security
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
CORS_ORIGIN=http://<UAT_SERVER_IP>:5173

# OpenAI (Optional)
OPENAI_API_KEY=<YOUR_OPENAI_KEY>

# Monitoring
LOG_LEVEL=info
ENABLE_SWAGGER=false  # Disable in UAT for security
DEBUG=false
```

**Generate Strong Passwords:**
```bash
# Generate random passwords
openssl rand -base64 32  # For PG_ROOT_PASSWORD
openssl rand -base64 32  # For KEYCLOAK_ADMIN_PASSWORD
openssl rand -hex 32     # For KEYCLOAK_CLIENT_SECRET
```

---

### Step 4: Build Docker Images

```bash
cd /opt/cfo-platform

# Build all services
docker-compose -f infra/docker-compose.yml build

# Verify images
docker images | grep cfo
```

---

### Step 5: Start Services

```bash
# Start all services
cd /opt/cfo-platform
export KMS_MASTER_KEY=$(cat .env | grep KMS_MASTER_KEY | cut -d '=' -f2)
docker-compose -f infra/docker-compose.yml up -d

# Check status
docker-compose -f infra/docker-compose.yml ps

# Expected output:
# infra-backend-1    Up
# infra-db-1         Up
# infra-keycloak-1   Up
# infra-frontend-1   Up (if using Docker frontend)
```

**View logs:**
```bash
# All services
docker-compose -f infra/docker-compose.yml logs -f

# Specific service
docker-compose -f infra/docker-compose.yml logs -f backend
docker-compose -f infra/docker-compose.yml logs -f db
```

---

### Step 6: Initialize Database

```bash
# Wait for database to be ready (30 seconds)
sleep 30

# Create admin tenant (if not exists)
docker-compose -f infra/docker-compose.yml exec backend npm run migration:run

# Verify database
docker-compose -f infra/docker-compose.yml exec db psql -U postgres -d postgres -c "\dt"
```

---

### Step 7: Health Checks

```bash
# Check backend health
curl http://localhost:3000/health

# Expected: {"status":"ok","timestamp":"..."}

# Check database connection
docker-compose -f infra/docker-compose.yml exec backend npm run db:check

# Check Keycloak
curl http://localhost:8081/health

# Check all services
docker-compose -f infra/docker-compose.yml ps
```

---

### Step 8: Create Test Users

```bash
# SSH into UAT server
cd /opt/cfo-platform

# Create super admin user
./infra/create-super-admin-user.sh

# Create tenant-specific users
./infra/create-tenant-specific-users.sh

# Or manually create via API
curl -X POST http://localhost:3000/tenant \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  -d '{"name":"uat-tenant","display_name":"UAT Test Company"}'
```

---

### Step 9: Run E2E Tests (Verification)

```bash
cd /opt/cfo-platform

# Install Python dependencies
pip3 install requests colorama

# Run E2E test suite
./run-e2e-test.sh

# Expected: ✅ 16/16 phases passed (100%)
```

---

### Step 10: Configure Firewall

```bash
# Allow necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Backend API
sudo ufw allow 5173/tcp  # Frontend (if not using nginx)
sudo ufw allow 8081/tcp  # Keycloak

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## 🔐 Security Hardening

### 1. Change Default Credentials

**CRITICAL**: Change all default passwords before going live!

```bash
# Database password
docker-compose exec db psql -U postgres -c "ALTER USER postgres PASSWORD 'NEW_STRONG_PASSWORD';"

# Keycloak admin password
docker-compose exec keycloak /opt/keycloak/bin/kcadm.sh set-password \
  --username admin \
  --new-password 'NEW_STRONG_PASSWORD'
```

### 2. Disable Unnecessary Services

```bash
# Edit docker-compose.yml
# Comment out or remove services not needed in UAT

# Example: Disable frontend container if using nginx
```

### 3. Enable HTTPS (Production Ready)

**Option 1: Using Nginx Reverse Proxy**
```bash
# Install nginx
sudo apt install nginx

# Configure SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d uat.yourdomain.com
```

See [nginx configuration example](#nginx-configuration) below.

### 4. Configure Rate Limiting

Already configured in `.env`:
```bash
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=100
```

Adjust based on UAT load testing results.

---

## 📊 Monitoring & Logs

### View Logs

```bash
# All services
docker-compose -f infra/docker-compose.yml logs -f

# Last 100 lines
docker-compose -f infra/docker-compose.yml logs --tail=100

# Specific service
docker-compose -f infra/docker-compose.yml logs -f backend

# Save logs to file
docker-compose -f infra/docker-compose.yml logs > uat-logs-$(date +%Y%m%d).log
```

### Monitor Resources

```bash
# Docker stats
docker stats

# Disk usage
df -h
docker system df

# System resources
htop
```

### Log Rotation

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/cfo-platform

# Add:
/opt/cfo-platform/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

---

## 🔄 Backup & Recovery

### Database Backup

```bash
# Create backup directory
mkdir -p /opt/cfo-platform/backups

# Backup all databases
docker-compose exec db pg_dumpall -U postgres > backups/backup-$(date +%Y%m%d-%H%M%S).sql

# Backup specific tenant database
docker-compose exec db pg_dump -U postgres -d admin > backups/admin-$(date +%Y%m%d).sql

# Automated daily backup (cron)
0 2 * * * cd /opt/cfo-platform && docker-compose exec -T db pg_dumpall -U postgres > backups/backup-$(date +\%Y\%m\%d).sql
```

### Restore Database

```bash
# Restore from backup
docker-compose exec -T db psql -U postgres < backups/backup-20260217.sql

# Verify restore
docker-compose exec db psql -U postgres -c "\l"
```

---

## 🧪 UAT Testing Checklist

### Functional Testing

- [ ] User login (all roles: Super Admin, Admin, Analyst, Viewer)
- [ ] Tenant creation
- [ ] Financial statement CRUD
- [ ] Scenario management
- [ ] Budget planning
- [ ] Financial projections
- [ ] Drill-down reports
- [ ] ETL data import (CSV/Excel)
- [ ] Chart rendering
- [ ] API rate limiting
- [ ] RBAC permissions

### Performance Testing

- [ ] Response time < 2 seconds (95th percentile)
- [ ] Concurrent users: 10+ without degradation
- [ ] Database query performance
- [ ] Memory usage stable over 24 hours
- [ ] No memory leaks

### Security Testing

- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Authentication working
- [ ] Authorization working
- [ ] Rate limiting active
- [ ] Audit logs recording

### Run E2E Test Suite

```bash
./run-e2e-test.sh

# Expected: ✅ 16/16 phases passed (100%)
```

---

## 🔧 Troubleshooting

### Backend won't start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# 1. Database not ready - wait 30 seconds
# 2. KMS_MASTER_KEY not set
# 3. Port 3000 already in use

# Restart backend
docker-compose restart backend
```

### Database connection errors

```bash
# Check database is running
docker-compose ps db

# Test connection
docker-compose exec db psql -U postgres -c "SELECT version();"

# Restart database
docker-compose restart db

# Reset database (CAUTION: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Frontend can't connect to backend

```bash
# Check VITE_API_BASE in .env
# Should point to: http://<UAT_SERVER_IP>:3000

# Check CORS configuration in backend
# Edit backend/src/main.ts if needed

# Rebuild and restart
docker-compose build frontend backend
docker-compose restart frontend backend
```

### Keycloak not accessible

```bash
# Check Keycloak logs
docker-compose logs keycloak

# Wait for initialization (can take 2-3 minutes)
# Check health
curl http://localhost:8081/health

# Restart if needed
docker-compose restart keycloak
```

---

## 🔄 Update/Rollback Procedures

### Update to New Version

```bash
# Backup first!
cd /opt/cfo-platform
./scripts/backup-all.sh

# Pull latest code
git fetch
git checkout v0.2.0  # or specific version

# Rebuild and restart
export KMS_MASTER_KEY=$(cat .env | grep KMS_MASTER_KEY | cut -d '=' -f2)
docker-compose build
docker-compose down
docker-compose up -d

# Run migrations
docker-compose exec backend npm run migration:run

# Verify
./run-e2e-test.sh
```

### Rollback to Previous Version

```bash
# Checkout previous version
git checkout v0.1.0

# Restore database backup
docker-compose exec -T db psql -U postgres < backups/backup-before-upgrade.sql

# Rebuild and restart
docker-compose build
docker-compose down
docker-compose up -d
```

---

## 📞 Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- Check logs for errors
- Monitor disk space
- Review security alerts

**Weekly:**
- Update dependencies (`npm audit fix`)
- Review performance metrics
- Test backups

**Monthly:**
- Security updates (`apt update && apt upgrade`)
- Review and rotate logs
- Performance optimization

### Support Contacts

- **Development Team**: dev-team@your-company.com
- **Emergency**: +66-xxx-xxx-xxxx (24/7)
- **Documentation**: https://github.com/Sakamototong/cfo-financial-platform

---

## 📚 Additional Resources

- [README.md](README.md) - Project overview
- [UAT-READINESS-REPORT.md](UAT-READINESS-REPORT.md) - Test results
- [SECURITY.md](SECURITY.md) - Security policy
- [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines
- [TEST-E2E-GUIDE.md](TEST-E2E-GUIDE.md) - Testing documentation

---

## ✅ Post-Deployment Checklist

After deployment, verify:

- [ ] All services running (`docker-compose ps`)
- [ ] Health checks passing
- [ ] E2E tests passed (100%)
- [ ] UAT users can login
- [ ] Sample data imported successfully
- [ ] Monitoring configured
- [ ] Backups automated
- [ ] Firewall configured
- [ ] SSL/HTTPS enabled (if applicable)
- [ ] Documentation updated
- [ ] Team trained on UAT environment

---

**Deployment Guide Version**: 1.0  
**Last Updated**: February 17, 2026  
**Tested on**: Ubuntu 22.04 LTS, Docker 24.0.5, Docker Compose 2.23.0
