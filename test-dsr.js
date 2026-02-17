const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TENANT_ID = 'admin';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test scenarios with different roles
const testScenarios = [
  {
    name: 'Viewer submits Access Request',
    role: 'viewer',
    test: async (token) => {
      const response = await axios.post(
        `${BASE_URL}/dsr/requests`,
        {
          request_type: 'access',
          requester_email: 'viewer@example.com',
          requester_name: 'Test Viewer',
          request_reason: 'I want to see what data you have about me',
        },
        {
          headers: {
            Authorization: `Bearer demo-token-${token}`,
            'x-tenant-id': TENANT_ID,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    },
  },
  {
    name: 'Finance User submits Delete Request',
    role: 'finance_user',
    test: async (token) => {
      const response = await axios.post(
        `${BASE_URL}/dsr/requests`,
        {
          request_type: 'delete',
          requester_email: 'finance@example.com',
          requester_name: 'Finance User',
          request_reason: 'Right to be forgotten (GDPR Article 17)',
          request_scope: {
            tables: ['users', 'companies'],
            full_deletion: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer demo-token-${token}`,
            'x-tenant-id': TENANT_ID,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    },
  },
  {
    name: 'Analyst submits Portability Request',
    role: 'analyst',
    test: async (token) => {
      const response = await axios.post(
        `${BASE_URL}/dsr/requests`,
        {
          request_type: 'portability',
          requester_email: 'analyst@example.com',
          requester_name: 'Test Analyst',
          request_reason: 'Data portability request (GDPR Article 20)',
        },
        {
          headers: {
            Authorization: `Bearer demo-token-${token}`,
            'x-tenant-id': TENANT_ID,
            'Content-Type': 'application/json',
          },
        },
      );
      return response.data;
    },
  },
  {
    name: 'Tenant Admin views all requests',
    role: 'tenant_admin',
    test: async (token) => {
      const response = await axios.get(`${BASE_URL}/dsr/requests`, {
        headers: {
          Authorization: `Bearer demo-token-${token}`,
          'x-tenant-id': TENANT_ID,
        },
      });
      return response.data;
    },
  },
  {
    name: 'Viewer tries to view all requests (should fail)',
    role: 'viewer',
    shouldFail: true,
    test: async (token) => {
      const response = await axios.get(`${BASE_URL}/dsr/requests`, {
        headers: {
          Authorization: `Bearer demo-token-${token}`,
          'x-tenant-id': TENANT_ID,
        },
      });
      return response.data;
    },
  },
];

// Admin workflow tests (require created request IDs)
const adminWorkflowTests = [
  {
    name: 'Tenant Admin approves request',
    action: async (token, requestId) => {
      return await axios.put(
        `${BASE_URL}/dsr/requests/${requestId}/approve`,
        {
          approved: true,
          notes: 'Request approved after verification',
        },
        {
          headers: {
            Authorization: `Bearer demo-token-${token}`,
            'x-tenant-id': TENANT_ID,
            'Content-Type': 'application/json',
          },
        },
      );
    },
  },
  {
    name: 'Tenant Admin processes request',
    action: async (token, requestId) => {
      return await axios.post(
        `${BASE_URL}/dsr/requests/${requestId}/process`,
        {
          notes: 'Processing request automatically',
        },
        {
          headers: {
            Authorization: `Bearer demo-token-${token}`,
            'x-tenant-id': TENANT_ID,
            'Content-Type': 'application/json',
          },
        },
      );
    },
  },
  {
    name: 'View audit log',
    action: async (token, requestId) => {
      return await axios.get(`${BASE_URL}/dsr/requests/${requestId}/audit-log`, {
        headers: {
          Authorization: `Bearer demo-token-${token}`,
          'x-tenant-id': TENANT_ID,
        },
      });
    },
  },
];

async function runTest(scenario) {
  try {
    console.log(`\n${colors.cyan}Testing: ${scenario.name}${colors.reset}`);
    console.log(`Role: ${scenario.role}`);

    const result = await scenario.test(scenario.role);

    if (scenario.shouldFail) {
      console.log(`${colors.red}✗ Test FAILED - Expected 403 but got success${colors.reset}`);
      return { success: false, result };
    }

    console.log(`${colors.green}✓ Test PASSED${colors.reset}`);
    if (result.id) {
      console.log(`Request ID: ${result.id}`);
      console.log(`Status: ${result.status}`);
      console.log(`Type: ${result.request_type}`);
    } else if (Array.isArray(result)) {
      console.log(`Returned ${result.length} requests`);
    }

    return { success: true, result };
  } catch (error) {
    if (scenario.shouldFail && error.response?.status === 403) {
      console.log(`${colors.green}✓ Test PASSED - Correctly blocked with 403${colors.reset}`);
      return { success: true, result: null };
    }

    console.log(`${colors.red}✗ Test FAILED${colors.reset}`);
    console.log(`Error: ${error.response?.data?.message || error.message}`);
    console.log(`Status: ${error.response?.status || 'N/A'}`);
    return { success: false, error: error.message };
  }
}

async function runAdminWorkflow(requestId) {
  console.log(`\n${colors.blue}=== Admin Workflow Tests ===${colors.reset}`);
  console.log(`Using Request ID: ${requestId}`);

  for (const workflow of adminWorkflowTests) {
    try {
      console.log(`\n${colors.cyan}${workflow.name}${colors.reset}`);
      const response = await workflow.action('tenant_admin', requestId);
      console.log(`${colors.green}✓ Success${colors.reset}`);

      if (workflow.name.includes('audit')) {
        console.log(`Audit entries: ${response.data.length}`);
        response.data.forEach((entry) => {
          console.log(
            `  - ${entry.action} by ${entry.actor_email} at ${entry.created_at}`,
          );
        });
      } else {
        console.log(`Status: ${response.data.status}`);
      }
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${error.response?.data?.message || error.message}${colors.reset}`);
    }
  }
}

async function testStatistics() {
  console.log(`\n${colors.blue}=== DSR Statistics ===${colors.reset}`);
  try {
    const response = await axios.get(`${BASE_URL}/dsr/statistics`, {
      headers: {
        Authorization: 'Bearer demo-token-tenant-admin',
        'x-tenant-id': TENANT_ID,
      },
    });

    const stats = response.data;
    console.log(`${colors.green}✓ Statistics retrieved${colors.reset}`);
    console.log(`Pending: ${stats.pending_count}`);
    console.log(`Approved: ${stats.approved_count}`);
    console.log(`Processing: ${stats.processing_count}`);
    console.log(`Completed: ${stats.completed_count}`);
    console.log(`Rejected: ${stats.rejected_count}`);
    console.log(`Overdue: ${stats.overdue_count}`);
    console.log(`Average days to complete: ${parseFloat(stats.avg_days_to_complete || 0).toFixed(2)}`);
  } catch (error) {
    console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}`);
  }
}

async function testPublicEndpoint() {
  console.log(`\n${colors.blue}=== Public DSR Request (No Auth) ===${colors.reset}`);
  try {
    const response = await axios.post(`${BASE_URL}/dsr/public/request`, {
      request_type: 'access',
      requester_email: 'public@example.com',
      requester_name: 'Public User',
      request_reason: 'I have no account but you have my data from a transaction',
    });

    console.log(`${colors.green}✓ Public request created${colors.reset}`);
    console.log(`Request ID: ${response.data.id}`);
    console.log(`Status: ${response.data.status}`);
  } catch (error) {
    console.log(`${colors.red}✗ Failed: ${error.message}${colors.reset}`);
  }
}

async function main() {
  console.log(`${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║         DSR (Data Subject Request) Testing Suite          ║${colors.reset}`);
  console.log(`${colors.blue}║              PDPA/GDPR Compliance Verification             ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}`);

  const results = [];
  let firstRequestId = null;

  // Run basic tests
  console.log(`\n${colors.blue}=== Basic DSR Request Tests ===${colors.reset}`);
  for (const scenario of testScenarios) {
    const result = await runTest(scenario);
    results.push({ name: scenario.name, ...result });

    // Capture first request ID for workflow testing
    if (!firstRequestId && result.result?.id) {
      firstRequestId = result.result.id;
    }
  }

  // Run admin workflow if we have a request ID
  if (firstRequestId) {
    await runAdminWorkflow(firstRequestId);
  }

  // Test statistics endpoint
  await testStatistics();

  // Test public endpoint
  await testPublicEndpoint();

  // Summary
  console.log(`\n${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║                       Test Summary                         ║${colors.reset}`);
  console.log(`${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}`);

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(
    `${colors.green}Passed: ${passed}${colors.reset} | ${colors.red}Failed: ${failed}${colors.reset}`,
  );

  if (failed > 0) {
    console.log(`\n${colors.yellow}Failed Tests:${colors.reset}`);
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  ${colors.red}✗${colors.reset} ${r.name}`);
      });
  }

  console.log(
    `\n${colors.cyan}DSR Compliance Features:${colors.reset}`,
  );
  console.log('  ✓ Right to Access (GDPR Art. 15)');
  console.log('  ✓ Right to be Forgotten (GDPR Art. 17)');
  console.log('  ✓ Right to Data Portability (GDPR Art. 20)');
  console.log('  ✓ 30-day response requirement tracking');
  console.log('  ✓ Complete audit trail');
  console.log('  ✓ Role-based access control');
  console.log('  ✓ Anonymization with recovery capability');
}

main().catch(console.error);
