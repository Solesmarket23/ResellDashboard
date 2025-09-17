#!/usr/bin/env node

/**
 * Test script for FedEx API integration
 * Run with: node scripts/test-fedex-api.js
 */

const https = require('https');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const TEST_TRACKING_NUMBER = '123456789012'; // Replace with real FedEx tracking number

async function testFedExAPI() {
  console.log('🧪 Testing FedEx API Integration');
  console.log('================================');
  
  try {
    // Test 1: Check API configuration
    console.log('\n1. Testing API configuration...');
    const configResponse = await makeRequest('GET', '/api/tracking/test-fedex');
    
    if (configResponse.success) {
      console.log('✅ API configuration check passed');
      console.log('   - Can detect tracking numbers:', configResponse.configuration.canDetectTrackingNumber);
      console.log('   - Environment variables configured:', configResponse.configuration.environmentVariables);
    } else {
      console.log('❌ API configuration check failed:', configResponse.error);
      return;
    }
    
    // Test 2: Test with tracking number
    console.log('\n2. Testing with tracking number...');
    const trackingResponse = await makeRequest('POST', '/api/tracking/test-fedex', {
      trackingNumber: TEST_TRACKING_NUMBER
    });
    
    if (trackingResponse.success) {
      console.log('✅ Tracking API test passed');
      console.log('   - Tracking number:', trackingResponse.trackingInfo.trackingNumber);
      console.log('   - Carrier:', trackingResponse.trackingInfo.carrier);
      console.log('   - Status:', trackingResponse.trackingInfo.status);
      console.log('   - Updates count:', trackingResponse.trackingInfo.updates.length);
      
      if (trackingResponse.trackingInfo.error) {
        console.log('   - Note: API returned error, using fallback data');
      }
    } else {
      console.log('❌ Tracking API test failed:', trackingResponse.error);
    }
    
    console.log('\n🎉 FedEx API integration test completed!');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FedEx-API-Test/1.0'
      }
    };
    
    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }
    
    const req = (url.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve(parsedData);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Run the test
if (require.main === module) {
  testFedExAPI().catch(console.error);
}

module.exports = { testFedExAPI };
