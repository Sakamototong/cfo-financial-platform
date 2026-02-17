# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in the CFO Platform, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email: **security@your-company.com** with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

We will respond within **48 hours** and provide a timeline for resolution.

---

## Security Best Practices

### For Development

#### ⚠️ Default Credentials (Development Only)
The repository includes **development credentials** for local testing:
- Postgres: `postgres/postgres`
- Keycloak Admin: `admin/admin`
- Frontend Demo: `admin/admin`

**NEVER use these credentials in production.**

#### Environment Variables
**Required** environment variables for secure operation:
```bash
# Generate strong KMS master key
export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# OpenAI API key (optional, for AI features)
export OPENAI_API_KEY="sk-your-key-here"
```

#### Secrets Management
- ✅ Copy `.env.example` → `.env`
- ✅ Generate unique passwords for each environment
- ✅ Never commit `.env` files
- ✅ Use secret management tools (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)

---

### For Production Deployment

#### Pre-Deployment Checklist

✅ **Authentication & Authorization**
- [ ] Change all default passwords
- [ ] Configure Keycloak with confidential client + secret rotation
- [ ] Implement RBAC with proper role assignments
- [ ] Enable MFA for admin accounts
- [ ] Review JWT expiration settings (default: 1h access, 7d refresh)

✅ **Database Security**
- [ ] Use strong PostgreSQL passwords (min 32 characters)
- [ ] Enable SSL/TLS for database connections
- [ ] Configure network isolation (private subnets)
- [ ] Implement automated backups with encryption
- [ ] Review database user permissions (principle of least privilege)

✅ **API Security**
- [ ] Enable rate limiting (default: 100 req/min per IP)
- [ ] Configure CORS with specific allowed origins
- [ ] Disable Swagger in production (`ENABLE_SWAGGER=false`)
- [ ] Enable HTTPS only (redirect HTTP → HTTPS)
- [ ] Implement request size limits
- [ ] Add API gateway with WAF rules
- [ ] Enable audit logging with log rotation

✅ **Encryption**
- [ ] Generate unique KMS master key per environment
- [ ] Implement key rotation policy (quarterly recommended)
- [ ] Use envelope encryption for tenant database passwords
- [ ] Enable field-level encryption for PII data
- [ ] Encrypt backups at rest

✅ **Network Security**
- [ ] Deploy behind reverse proxy (nginx/CloudFlare)
- [ ] Configure firewall rules (whitelist only necessary ports)
- [ ] Enable DDoS protection
- [ ] Use VPC/private networks for database
- [ ] Implement network segmentation

✅ **Monitoring & Incident Response**
- [ ] Enable centralized logging (ELK, Splunk, CloudWatch)
- [ ] Configure security alerts (failed logins, privilege escalation)
- [ ] Implement intrusion detection (IDS/IPS)
- [ ] Set up uptime monitoring
- [ ] Create incident response playbook
- [ ] Enable automated security scanning (Snyk, Dependabot)

✅ **Compliance**
- [ ] Review GDPR/PDPA requirements
- [ ] Implement Data Subject Request (DSR) endpoints
- [ ] Configure data retention policies
- [ ] Enable audit trail for all financial transactions
- [ ] Create privacy policy & terms of service

---

## Known Security Considerations

### Development Environment
- **Demo tokens** (`demo-token-12345`) are accepted for local testing
  - **MUST BE DISABLED** in production (check [auth.guard.ts](backend/src/auth/guards/auth.guard.ts))
- Docker Compose uses plaintext passwords
  - Replace with Docker secrets or orchestration secrets for production

### Password Requirements
Current validation rules:
- Minimum 8 characters (increase to 12+ for production)
- At least 1 uppercase, lowercase, number, special character
- Implement password history (prevent reuse of last 5 passwords)
- Add password expiration policy (90 days recommended)

### Rate Limiting
Current settings (development):
- 100 requests per minute per IP
- Adjust for production based on load testing
- Consider user-based rate limiting (not just IP)

### Session Management
- JWT access tokens expire in 1 hour
- Refresh tokens expire in 7 days
- Review token expiration based on security policy
- Implement token revocation for logout

---

## Vulnerability Disclosure Policy

We follow **responsible disclosure** principles:

1. **Report**: Security researcher reports vulnerability privately
2. **Acknowledge**: We confirm receipt within 48 hours
3. **Assess**: We evaluate severity and impact (1-5 business days)
4. **Fix**: We develop and test patch (timeline depends on severity)
5. **Release**: We deploy fix and notify reporter
6. **Disclose**: Public disclosure after 90 days or once patch is deployed (whichever is sooner)

### Severity Levels
- **Critical** (CVSS 9.0-10.0): Immediate response, patch within 48 hours
- **High** (CVSS 7.0-8.9): Response within 7 days, patch within 2 weeks
- **Medium** (CVSS 4.0-6.9): Response within 30 days
- **Low** (CVSS 0.1-3.9): Addressed in next scheduled release

---

## Security Updates

We recommend:
- Subscribe to security advisories for dependencies (npm audit, Snyk)
- Update dependencies monthly (patch versions weekly)
- Review security advisories for NestJS, React, PostgreSQL, Keycloak
- Test updates in staging before production

### Automated Security Scanning
Enable GitHub security features:
- ✅ Dependabot alerts
- ✅ Secret scanning
- ✅ Code scanning (CodeQL)

---

## Compliance & Certifications

Target certifications (future roadmap):
- [ ] SOC 2 Type II
- [ ] ISO 27001
- [ ] GDPR compliance
- [ ] PDPA compliance (Thailand)

---

## Contact

- **Security Email**: security@your-company.com
- **Emergency Hotline**: +66-xxx-xxx-xxxx (24/7)
- **PGP Key**: [https://your-company.com/security/pgp-key.asc](https://your-company.com/security/pgp-key.asc)

---

**Last Updated**: January 2026  
**Next Review**: April 2026
