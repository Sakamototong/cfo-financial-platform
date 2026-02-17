## Description
<!-- Provide a brief description of the changes in this PR -->

**What does this PR do?**


**Why is this change necessary?**


## Type of Change
<!-- Mark the relevant option with an 'x' -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Code style update (formatting, renaming)
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Build/CI configuration change

## Related Issues
<!-- Link to related issues -->

Closes #
Relates to #

## Testing
<!-- Describe the testing you have performed -->

### Test Coverage
- [ ] Unit tests added/updated
- [ ] E2E tests pass (`./run-e2e-test.sh` shows 100%)
- [ ] Manual testing completed

### Test Environment
- [ ] Tested on Linux
- [ ] Tested on macOS
- [ ] Tested on Windows
- [ ] Tested with Docker Compose

### Test Results
```
# Paste test output here
```

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->


## Checklist
<!-- Mark completed items with an 'x' -->

### Code Quality
- [ ] Code follows the project's style guidelines
- [ ] Self-review of code completed
- [ ] Comments added for complex logic
- [ ] No new warnings generated
- [ ] Code is DRY (Don't Repeat Yourself)

### Documentation
- [ ] README updated (if needed)
- [ ] API documentation updated (Swagger/OpenAPI)
- [ ] Inline code documentation added
- [ ] CHANGELOG.md updated

### Security
- [ ] No sensitive data exposed (passwords, API keys, etc.)
- [ ] Input validation added where necessary
- [ ] Authentication/authorization considered
- [ ] SQL injection prevention verified (parameterized queries)
- [ ] XSS prevention verified

### Database
- [ ] Database migrations created (if schema changed)
- [ ] Migration rollback tested
- [ ] Indexes added for new queries
- [ ] Foreign key constraints verified

### Dependencies
- [ ] No unnecessary dependencies added
- [ ] Package versions locked
- [ ] Security vulnerabilities checked (`npm audit`)

### Performance
- [ ] Performance impact considered
- [ ] Database query optimization reviewed
- [ ] No N+1 query problems introduced

### Compatibility
- [ ] Backward compatibility maintained (or breaking changes documented)
- [ ] API versioning followed
- [ ] Feature flags used (if applicable)

## Deployment Notes
<!-- Any special deployment considerations? -->

**Environment Variables:**
<!-- List any new environment variables -->
- `NEW_VAR_NAME` - Description

**Configuration Changes:**
<!-- List any configuration changes needed -->


**Database Migrations:**
<!-- List any database migrations to run -->
```bash
# Example:
npm run migration:run
```

**Post-Deployment Steps:**
<!-- Any manual steps after deployment? -->
1. 
2. 

## Rollback Plan
<!-- How to rollback if this PR causes issues? -->


## Additional Context
<!-- Add any other context about the PR here -->


---

## Reviewer Checklist
<!-- For reviewers - mark completed items with an 'x' -->

- [ ] Code review completed
- [ ] Tests reviewed and adequate coverage
- [ ] Documentation is clear and complete
- [ ] Security considerations addressed
- [ ] Performance implications acceptable
- [ ] Breaking changes properly communicated
- [ ] Deployment plan is clear
