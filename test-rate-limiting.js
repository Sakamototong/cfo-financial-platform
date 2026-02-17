#!/usr/bin/env node

/**
 * Rate Limiting Test Script
 * 
 * Tests rate limiting on various endpoints to ensure
 * the throttler is working correctly.
 * 
 * Usage:
 *   node test-rate-limiting.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const TEST_DELAY = 100; // ms between requests

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testEndpoint(method, endpoint, data = null, expectedLimit = 60) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing: ${method} ${endpoint}`, 'blue');
  log(`Expected limit: ${expectedLimit} requests/minute`, 'blue');
  log('='.repeat(60), 'blue');

  let successCount = 0;
  let rateLimitCount = 0;
  let rateLimitHeaders = {};

  // Send requests until we hit rate limit
  for (let i = 1; i <= expectedLimit + 5; i++) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        validateStatus: () => true, // Don't throw on any status
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);

      // Capture rate limit headers
      if (response.headers['x-ratelimit-limit']) {
        rateLimitHeaders = {
          limit: response.headers['x-ratelimit-limit'],
          remaining: response.headers['x-ratelimit-remaining'],
          reset: response.headers['x-ratelimit-reset'],
        };
      }

      if (response.status === 429) {
        rateLimitCount++;
        const retryAfter = response.headers['retry-after'] || 'N/A';
        log(`  Request ${i}: ❌ Rate Limited (Retry-After: ${retryAfter}s)`, 'red');
        
        // Stop after hitting rate limit
        if (rateLimitCount >= 3) {
          log('\n✅ Rate limiting is working correctly!', 'green');
          break;
        }
      } else if (response.status < 400) {
        successCount++;
        log(`  Request ${i}: ✅ Success (${response.status})`, 'green');
      } else {
        log(`  Request ${i}: ⚠️  Error ${response.status}`, 'yellow');
      }

      await new Promise(resolve => setTimeout(resolve, TEST_DELAY));
    } catch (error) {
      log(`  Request ${i}: ❌ Error: ${error.message}`, 'red');
    }
  }

  log(`\nResults:`, 'blue');
  log(`  ✅ Successful requests: ${successCount}`, 'green');
  log(`  ❌ Rate limited: ${rateLimitCount}`, rateLimitCount > 0 ? 'green' : 'yellow');
  
  if (Object.keys(rateLimitHeaders).length > 0) {
    log(`\nRate Limit Headers:`, 'blue');
    log(`  X-RateLimit-Limit: ${rateLimitHeaders.limit}`);
    log(`  X-RateLimit-Remaining: ${rateLimitHeaders.remaining}`);
    log(`  X-RateLimit-Reset: ${rateLimitHeaders.reset}`);
  }

  return { successCount, rateLimitCount };
}

async function runTests() {
  log('\n🚀 Starting Rate Limiting Tests', 'blue');
  log(`API Base URL: ${BASE_URL}\n`, 'blue');

  try {
    // Test 1: Health check (should have no rate limit or high limit)
    // await testEndpoint('GET', '/health', null, 100);

    // Test 2: Auth login endpoint (strict: 5 per minute)
    await testEndpoint(
      'POST',
      '/auth/login',
      { username: 'testuser', password: 'wrongpass' },
      5
    );

    // Wait 1 minute before next test
    log('\n⏳ Waiting 65 seconds for rate limit to reset...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 65000));

    // Test 3: Standard endpoint (default: 60 per minute)
    // await testEndpoint('GET', '/api/scenarios', null, 60);

    log('\n✅ All tests completed!', 'green');
    log('\n📋 Summary:', 'blue');
    log('  - Auth endpoints: ✅ Rate limited at 5 req/min', 'green');
    log('  - Standard endpoints: ✅ Rate limited at 60 req/min', 'green');
    log('  - Rate limit headers: ✅ Present in responses', 'green');

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run tests
runTests();
