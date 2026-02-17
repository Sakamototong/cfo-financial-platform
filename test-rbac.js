#!/usr/bin/env node

/**
 * RBAC Testing Script for CFO Platform
 * 
 * Tests role-based access control with different user roles
 * 
 * Usage:
 *   node test-rbac.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test endpoints with different role tokens
 */
const testCases = [
  {
    role: 'super_admin',
    token: 'demo-token-super-admin',
    tests: [
      { method: 'GET', path: '/super-admin/users', shouldPass: true },
      { method: 'GET', path: '/budgets', shouldPass: true },
      { method: 'POST', path: '/budgets', shouldPass: true },
      { method: 'GET', path: '/version-control/versions', shouldPass: true },
    ],
  },
  {
    role: 'finance_manager',
    token: 'demo-token-finance-manager',
    tests: [
      { method: 'GET', path: '/super-admin/users', shouldPass: false }, // Only super admin
      { method: 'GET', path: '/budgets', shouldPass: true },
      { method: 'POST', path: '/budgets', shouldPass: true },
      { method: 'DELETE', path: '/budgets/test-id', shouldPass: true },
      { method: 'GET', path: '/etl/templates', shouldPass: true },
    ],
  },
  {
    role: 'finance_user',
    token: 'demo-token-finance-user',
    tests: [
      { method: 'GET', path: '/budgets', shouldPass: true }, // Analyst can view
      { method: 'POST', path: '/budgets', shouldPass: false }, // Only finance manager can create
      { method: 'GET', path: '/etl/imports', shouldPass: true },
      { method: 'POST', path: '/etl/import', shouldPass: true },
    ],
  },
  {
    role: 'analyst',
    token: 'demo-token-analyst',
    tests: [
      { method: 'GET', path: '/budgets', shouldPass: true },
      { method: 'POST', path: '/budgets', shouldPass: false },
      { method: 'GET', path: '/version-control/versions', shouldPass: true },
      { method: 'POST', path: '/etl/import', shouldPass: false }, // Need finance_user
    ],
  },
  {
    role: 'viewer',
    token: 'demo-token-viewer',
    tests: [
      { method: 'GET', path: '/budgets', shouldPass: false }, // Need analyst
      { method: 'GET', path: '/scenarios', shouldPass: true }, // Public endpoint
      { method: 'POST', path: '/budgets', shouldPass: false },
      { method: 'DELETE', path: '/budgets/test-id', shouldPass: false },
    ],
  },
];

async function testEndpoint(token, method, path, shouldPass) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${path}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-tenant-id': 'admin',
      },
      validateStatus: () => true, // Don't throw
    };

    // Add dummy body for POST requests
    if (method === 'POST') {
      config.data = { test: 'data' };
    }

    const response = await axios(config);

    const passed = response.status < 400;
    const expected = shouldPass;
    const result = passed === expected;

    if (result) {
      log(`    ✅ ${method} ${path}: ${response.status} (expected: ${expected ? 'pass' : 'fail'})`, 'green');
    } else {
      log(`    ❌ ${method} ${path}: ${response.status} (expected: ${expected ? 'pass' : 'fail'})`, 'red');
      if (response.data && response.data.message) {
        log(`       Error: ${response.data.message}`, 'yellow');
      }
    }

    return result;
  } catch (error) {
    log(`    ❌ ${method} ${path}: Error - ${error.message}`, 'red');
    return false;
  }
}

async function runTests() {
  log('\n🔐 Starting RBAC Testing', 'blue');
  log(`API Base URL: ${BASE_URL}\n`, 'blue');

  let totalTests = 0;
  let passedTests = 0;

  for (const testCase of testCases) {
    log(`\n${'='.repeat(60)}`, 'magenta');
    log(`Testing Role: ${testCase.role.toUpperCase()}`, 'magenta');
    log('='.repeat(60), 'magenta');

    for (const test of testCase.tests) {
      totalTests++;
      const result = await testEndpoint(
        testCase.token,
        test.method,
        test.path,
        test.shouldPass
      );
      
      if (result) passedTests++;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Test Results: ${passedTests}/${totalTests} passed`, passedTests === totalTests ? 'green' : 'yellow');
  log('='.repeat(60), 'blue');

  if (passedTests === totalTests) {
    log('\n✅ All RBAC tests passed!', 'green');
  } else {
    log(`\n⚠️  ${totalTests - passedTests} test(s) failed`, 'yellow');
  }

  // Test role extraction from JWT
  log('\n📋 Role Hierarchy:', 'blue');
  log('  100: super_admin (Full system access)', 'magenta');
  log('   50: tenant_admin (Full tenant access)', 'blue');
  log('   40: finance_manager (Budget/forecast management)', 'blue');
  log('   30: finance_user (Create/edit financial data)', 'blue');
  log('   20: analyst (Read-write scenarios/reports)', 'blue');
  log('   10: viewer (Read-only)', 'blue');
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
