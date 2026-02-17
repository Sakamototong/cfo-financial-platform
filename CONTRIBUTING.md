# Contributing to CFO Platform

Thank you for your interest in contributing to the CFO Platform! This guide will help you get started.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Making Changes](#making-changes)
5. [Testing Guidelines](#testing-guidelines)
6. [Commit Guidelines](#commit-guidelines)
7. [Pull Request Process](#pull-request-process)
8. [Code Style](#code-style)
9. [Architecture Guidelines](#architecture-guidelines)

---

## Code of Conduct

This project follows a code of conduct. By participating, you are expected to uphold this code:
- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

---

## Getting Started

### Prerequisites

- **Node.js**: 18+ ([download](https://nodejs.org/))
- **Docker Desktop**: Latest version ([download](https://www.docker.com/products/docker-desktop))
- **Git**: Latest version
- **Python**: 3.9+ (for E2E testing scripts)

### First Time Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/project-cfo-poc-4.git
   cd project-cfo-poc-4
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/project-cfo-poc-4.git
   ```

4. **Set up environment**:
   ```bash
   # Generate KMS master key
   export KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
   
   # Start services
   cd infra
   docker-compose up -d
   
   # Wait for services to be ready (~30 seconds)
   docker ps
   ```

5. **Install dependencies**:
   ```bash
   # Backend
   cd backend
   npm install --legacy-peer-deps
   
   # Frontend
   cd ../frontend
   npm install --legacy-peer-deps
   ```

6. **Verify setup**:
   ```bash
   # Run E2E tests
   cd ..
   chmod +x run-e2e-test.sh
   ./run-e2e-test.sh
   
   # Expected: ✅ All 16 phases passed (100%)
   ```

---

## Development Setup

### Backend Development

```bash
cd backend

# Start in watch mode
npm run start:dev

# View logs
docker logs infra-backend-1 -f

# Run tests
npm test
npm run test:watch
npm run test:cov
```

### Frontend Development

```bash
cd frontend

# Start dev server
npm run dev

# Access at http://localhost:5173

# Build for production
npm run build
npm run preview
```

### Database Management

```bash
# Access PostgreSQL
docker exec -it infra-db-1 psql -U postgres

# View logs
docker logs infra-db-1 -f

# Reset database
docker-compose down -v
docker-compose up -d db
```

---

## Making Changes

### Branch Strategy

- `main` - production-ready code
- `develop` - integration branch for features
- `feature/*` - new features
- `bugfix/*` - bug fixes
- `hotfix/*` - urgent production fixes

### Workflow

1. **Create feature branch**:
   ```bash
   git checkout develop
   git pull upstream develop
   git checkout -b feature/your-feature-name
   ```

2. **Make changes** and commit regularly

3. **Keep branch updated**:
   ```bash
   git fetch upstream
   git rebase upstream/develop
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create Pull Request** on GitHub

---

## Testing Guidelines

### Backend Tests

**Location**: `backend/src/**/*.spec.ts`

**Run tests**:
```bash
cd backend
npm test                    # All tests
npm run test:watch          # Watch mode
npm run test:cov            # With coverage
npm test -- --testPathPattern=kms  # Specific test
```

**Test structure**:
```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ServiceName],
    }).compile();
    
    service = module.get<ServiceName>(ServiceName);
  });
  
  it('should do something', () => {
    expect(service.method()).toBe(expected);
  });
});
```

**Coverage requirements**:
- Minimum 70% overall coverage
- Critical paths: 90%+ coverage
- New features: must include tests

### Frontend Tests

**Coming soon**: React Testing Library + Vitest

### E2E Tests

**Location**: `test-company-e2e.py`

**Run E2E tests**:
```bash
./run-e2e-test.sh
```

**Success criteria**:
- ✅ All 16 phases must pass
- ✅ No API errors (except gracefully handled 500s)
- ✅ Test completes in < 60 seconds

---

## Commit Guidelines

We follow **Conventional Commits** specification:

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (dependencies, build config)
- `perf`: Performance improvements
- `ci`: CI/CD changes

### Examples
```bash
feat(financial): add budget vs actual variance report

Implemented new variance analysis endpoint that compares
budgeted amounts with actual spending.

Closes #123

---

fix(auth): resolve token refresh race condition

Added request queue to prevent concurrent refresh calls.

Fixes #456

---

docs(readme): update E2E testing section

Added UAT readiness report reference and 100% success badge.
```

### Rules
- Use imperative mood ("add" not "added" or "adds")
- Keep subject line under 72 characters
- Capitalize first letter of subject
- No period at end of subject
- Separate subject from body with blank line
- Reference issues in footer

---

## Pull Request Process

### Before Submitting

1. ✅ **Tests pass**: Run `npm test` in backend
2. ✅ **Build succeeds**: Run `npm run build` in backend and frontend
3. ✅ **E2E tests pass**: Run `./run-e2e-test.sh` (100% success)
4. ✅ **No linting errors**: Run `npm run lint`
5. ✅ **Code formatted**: Run `npm run format`
6. ✅ **Branch updated**: Rebase on latest `develop`

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Dependent changes merged

## Screenshots (if applicable)

## Related Issues
Closes #123
```

### Review Process

1. **Automated checks** run (CI/CD pipeline)
2. **Code review** by maintainers (1-2 reviewers)
3. **Changes requested** (if needed)
4. **Approval** from at least one maintainer
5. **Merge** to develop branch

### Review Criteria

Reviewers will check:
- Code quality and readability
- Test coverage
- Performance implications
- Security considerations
- Documentation completeness
- Breaking changes

---

## Code Style

### TypeScript/JavaScript

**Style guide**: [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)

**Key rules**:
- Use `const` for all references (avoid `let`, never `var`)
- Use arrow functions for callbacks
- Use template literals for string concatenation
- Use async/await instead of promises chains
- Add JSDoc comments for public APIs

**Example**:
```typescript
/**
 * Creates a financial statement with line items
 * @param dto - Statement creation data
 * @returns Created statement with ID
 */
async createStatement(dto: CreateStatementDto): Promise<Statement> {
  const { statement, lineItems } = dto;
  
  // Validate input
  if (!statement.statement_type) {
    throw new BadRequestException('Statement type is required');
  }
  
  // Create statement
  const created = await this.statementRepo.create(statement);
  
  // Create line items
  await this.lineItemRepo.createMany(created.id, lineItems);
  
  return created;
}
```

### NestJS Conventions

- Use dependency injection
- Implement proper DTOs with validation
- Use decorators for route handlers
- Implement interceptors for cross-cutting concerns
- Use guards for authentication/authorization

### Database Queries

- Use parameterized queries (prevent SQL injection)
- Index foreign keys
- Add database comments for complex queries
- Use transactions for multi-step operations

---

## Architecture Guidelines

### Backend Structure

```
backend/src/
├── auth/              # Authentication module
├── tenant/            # Multi-tenant management
├── financial/         # Financial statements
├── scenarios/         # Scenario management
├── common/            # Shared utilities
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
└── main.ts           # Application entry point
```

### Module Guidelines

Each module should:
- Have clear single responsibility
- Export only necessary components
- Include module-specific DTOs
- Have comprehensive tests
- Document public APIs

### API Design

- Use RESTful conventions
- Version APIs (`/api/v1/...`)
- Use HTTP status codes correctly
- Return consistent error format
- Implement pagination for lists
- Support filtering and sorting

---

## Questions?

- **Documentation**: Check [README.md](README.md) and [docs/](docs/)
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Email**: dev-team@your-company.com

---

## Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Annual contributor report

Thank you for contributing! 🙌
