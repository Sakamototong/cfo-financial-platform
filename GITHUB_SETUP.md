# GitHub Setup Guide

This guide will help you prepare the CFO Platform repository for GitHub upload.

---

## ✅ Pre-Upload Checklist

### 1. Security Review

**✓ Completed:**
- [x] `.gitignore` created with comprehensive exclusions
- [x] `.env.example` template created
- [x] `SECURITY.md` added with vulnerability disclosure policy
- [x] No `.env` files in repository
- [x] Sensitive data audit completed

**⚠️ Known Development Credentials:**

The repository contains **development-only** credentials in:
- `infra/docker-compose.yml`: 
  - `POSTGRES_PASSWORD: postgres`
  - `KEYCLOAK_ADMIN_PASSWORD: admin`
  - `PG_ROOT_PASSWORD: postgres`

**These are acceptable for local development** but must be changed for production. This is documented in:
- [SECURITY.md](SECURITY.md) - Production security checklist
- [.env.example](.env.example) - Environment variable template
- [README.md](README.md) - Deployment notes

### 2. Documentation Review

**✓ Files Created:**
- [x] `README.md` - Updated with E2E testing section
- [x] `CONTRIBUTING.md` - Developer contribution guidelines
- [x] `SECURITY.md` - Security policy & vulnerability disclosure
- [x] `CHANGELOG.md` - Version history (v0.0.1 to v0.1.0)
- [x] `LICENSE` - MIT License
- [x] `.env.example` - Environment variable template
- [x] `GITHUB_SETUP.md` - This file

### 3. GitHub-Specific Files

**✓ Files Created:**
- [x] `.github/workflows/ci.yml` - CI/CD pipeline with E2E tests
- [x] `.github/PULL_REQUEST_TEMPLATE.md` - PR template
- [x] `.github/ISSUE_TEMPLATE/bug_report.md` - Bug report template
- [x] `.github/ISSUE_TEMPLATE/feature_request.md` - Feature request template
- [x] `.github/ISSUE_TEMPLATE/question.md` - Question template

### 4. Docker Configuration

**✓ Files Created:**
- [x] `backend/.dockerignore` - Exclude unnecessary files from Docker build
- [x] `frontend/.dockerignore` - Exclude unnecessary files from Docker build

---

## 🚀 Upload to GitHub

### Step 1: Initialize Git (if not already done)

```bash
cd /Users/sommanutketpong/Documents/GitHub/project-cfo-poc-4

# Check if Git is already initialized
git status

# If not initialized:
git init
git branch -M main
```

### Step 2: Review Files Before Commit

```bash
# Check what will be committed
git status

# Review .gitignore is working
git check-ignore -v node_modules  # Should show it's ignored
git check-ignore -v .env  # Should show it's ignored

# View files that will be tracked
git ls-files
```

### Step 3: Commit Files

```bash
# Add all files (respecting .gitignore)
git add .

# Review staged files
git status

# Commit
git commit -m "feat: initial commit - CFO Financial Platform v0.1.0

- Complete backend (NestJS, 120+ API endpoints)
- Complete frontend (React, TypeScript, Vite)
- E2E test suite (16 phases, 100% success rate)
- Multi-tenant architecture with Keycloak auth
- Docker Compose infrastructure
- Comprehensive documentation (README, CONTRIBUTING, SECURITY)
- CI/CD pipeline with GitHub Actions"
```

### Step 4: Create GitHub Repository

1. Go to [https://github.com/new](https://github.com/new)
2. **Repository name**: `project-cfo-platform` (or your preferred name)
3. **Description**: "Multi-tenant CFO Financial Planning & Analysis Platform with AI-powered features"
4. **Visibility**: 
   - ✅ **Private** (recommended) - Keep credentials private
   - ⚠️ **Public** - Only if you've reviewed all files for sensitive data
5. **DO NOT** initialize with README, .gitignore, or license (we already have them)
6. Click **Create repository**

### Step 5: Push to GitHub

```bash
# Add remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# Verify remote
git remote -v

# Push to GitHub
git push -u origin main
```

### Step 6: Configure GitHub Repository Settings

After pushing, configure your repository:

#### 6.1 Enable GitHub Features

Go to **Settings** → **General**:
- [x] Issues
- [x] Discussions (optional)
- [x] Projects (optional)
- [x] Wiki (optional)

#### 6.2 Configure Branch Protection

Go to **Settings** → **Branches** → **Add rule**:

**Branch name pattern**: `main`

**Protect matching branches:**
- [x] Require a pull request before merging
- [x] Require status checks to pass before merging
  - Select: `backend-tests`, `frontend-build`, `e2e-tests`
- [x] Require conversation resolution before merging
- [x] Do not allow bypassing the above settings

**Rules applied to administrators:**
- [x] Include administrators (recommended)

#### 6.3 Add Secrets

Go to **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add the following secrets:

| Secret Name | Value | How to Generate |
|------------|-------|-----------------|
| `KMS_MASTER_KEY_TEST` | Base64 32-byte key | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `OPENAI_API_KEY` | OpenAI API key | From OpenAI dashboard (optional) |
| `CODECOV_TOKEN` | Codecov token | From Codecov dashboard (optional) |

**Example:**
```bash
# Generate test KMS key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Copy output → Paste into GitHub secret KMS_MASTER_KEY_TEST
```

#### 6.4 Configure Security

Go to **Settings** → **Code security and analysis**:

**Enable:**
- [x] Dependency graph
- [x] Dependabot alerts
- [x] Dependabot security updates
- [x] Secret scanning
- [x] Code scanning (CodeQL)

#### 6.5 Add Repository Topics

Go to **About** (top right of main page) → **Add topics**:

Suggested topics:
- `nestjs`
- `react`
- `typescript`
- `postgresql`
- `keycloak`
- `docker`
- `multi-tenant`
- `financial-platform`
- `cfo`
- `fin-tech`

---

## 📋 Post-Upload Checklist

### Verify GitHub Actions

1. Go to **Actions** tab
2. Trigger workflow: `git push` or manually run workflow
3. Verify all jobs pass:
   - ✅ `backend-tests`
   - ✅ `frontend-build`
   - ✅ `e2e-tests` (runs full E2E suite)
   - ✅ `security-scan`

**Note:** E2E tests will run Docker Compose in GitHub Actions and verify 100% success rate.

### Update README Badges (Optional)

Add CI/CD badges to [README.md](README.md):

```markdown
![CI](https://github.com/YOUR_USERNAME/REPO_NAME/workflows/CI%2FCD%20Pipeline/badge.svg)
![Test Coverage](https://codecov.io/gh/YOUR_USERNAME/REPO_NAME/branch/main/graph/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![E2E Tests](https://img.shields.io/badge/E2E%20Tests-100%25%20Pass-brightgreen)
```

### Create GitHub Releases (Optional)

Go to **Releases** → **Create a new release**:

**Tag version**: `v0.1.0`
**Release title**: `v0.1.0 - E2E Testing Framework (Production Ready)`
**Description**: Copy from [CHANGELOG.md](CHANGELOG.md)

---

## 🔐 Security Reminders

### Before Making Repository Public

If you plan to make the repository public:

1. ✅ **Review ALL files** for sensitive data
2. ✅ **Change all default passwords** in examples
3. ✅ **Remove demo tokens** from code
4. ✅ **Review commit history** for leaked secrets
5. ✅ **Run**: `git log --all --source -- *secret* *password* *token* *.env`
6. ✅ **Consider using**: [git-secrets](https://github.com/awslabs/git-secrets)

### If Secrets Were Committed

**DO NOT** just delete the file - it's still in Git history!

```bash
# Remove file from entire Git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/secret.env" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (DANGEROUS - only for private repos)
git push origin --force --all

# Rotate all exposed credentials immediately
```

Better: **Create a new repository** and migrate clean files.

---

## 🤝 Collaboration Setup

### Add Collaborators

Go to **Settings** → **Collaborators and teams** → **Add people**

### Create Development Branch

```bash
# Create and push develop branch
git checkout -b develop
git push -u origin develop

# Set develop as default branch in GitHub Settings
```

### Set Up Code Review Process

1. All changes via Pull Requests
2. Minimum 1 approval required
3. CI/CD must pass
4. Use PR template for consistency

---

## 📚 Additional Resources

### Documentation
- [README.md](README.md) - Project overview & setup
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [SECURITY.md](SECURITY.md) - Security policy
- [UAT-READINESS-REPORT.md](UAT-READINESS-REPORT.md) - Production readiness

### Testing
- [TEST-E2E-GUIDE.md](TEST-E2E-GUIDE.md) - E2E testing comprehensive guide
- [TEST-E2E-README.md](TEST-E2E-README.md) - E2E testing quick start

### Scripts
- `run-e2e-test.sh` - Run E2E tests
- `test-company-e2e.py` - E2E test suite (1322 lines)

---

## ✅ Final Checklist

Before pushing to GitHub:

- [ ] `.gitignore` created
- [ ] `.env.example` created (no secrets)
- [ ] All documentation reviewed
- [ ] GitHub Actions workflow tested locally (if possible)
- [ ] CI/CD secrets prepared (KMS_MASTER_KEY_TEST)
- [ ] Branch protection rules planned
- [ ] Collaborators list prepared
- [ ] Security scanning enabled
- [ ] README badges updated (optional)
- [ ] All tests passing locally (`npm test`, `./run-e2e-test.sh`)

---

## 🎉 Success Criteria

Your repository is ready when:

1. ✅ All files committed and pushed
2. ✅ GitHub Actions CI/CD passing (all jobs green)
3. ✅ E2E tests showing 100% success in Actions
4. ✅ No secrets in repository
5. ✅ Documentation complete and accurate
6. ✅ Branch protection enabled
7. ✅ Security features enabled

---

## 💬 Need Help?

- **GitHub Docs**: [https://docs.github.com](https://docs.github.com)
- **Git Basics**: [https://git-scm.com/doc](https://git-scm.com/doc)
- **Issues**: Create an issue in your repository for team discussion

---

**Setup Guide Version**: 1.0  
**Last Updated**: January 31, 2026  
**Compatible with**: CFO Platform v0.1.0+
