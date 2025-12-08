#!/usr/bin/env node

/**
 * Test script to verify tracking number extraction for order 14797812286991753494
 * Expected tracking number: 886737858181
 */

const https = require('https');
const http = require('http');

const ORDER_NUMBER = '14797812286991753494';
const EXPECTED_TRACKING = '886737858181';
const API_ENDPOINT = process.env.API_URL || 'http://localhost:3000/api/gmail/extract-tracking-via-gmail';

async function testTrackingExtraction() {
  console.log('🧪 Testing Tracking Number Extraction');
  console.log('=====================================');
  console.log(`Order Number: ${ORDER_NUMBER}`);
  console.log(`Expected Tracking: ${EXPECTED_TRACKING}`);
  console.log(`API Endpoint: ${API_ENDPOINT}`);
  console.log('');

  const url = new URL(API_ENDPOINT);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  const postData = JSON.stringify({
    orderNumber: ORDER_NUMBER
  });

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    console.log('📡 Sending request to API...');
    console.log('');

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`📥 Response Status: ${res.statusCode} ${res.statusMessage}`);
        console.log('');

        try {
          const result = JSON.parse(data);
          
          if (res.statusCode === 200 && result.success) {
            console.log('✅ SUCCESS!');
            console.log('===========');
            console.log(`Tracking Number: ${result.trackingNumber}`);
            console.log(`Carrier: ${result.carrier || 'Unknown'}`);
            console.log(`Extracted Via: ${result.extractedVia || 'Unknown'}`);
            
            if (result.fedexUrl) {
              console.log(`FedEx URL: ${result.fedexUrl}`);
            }
            
            console.log('');
            
            // Verify the tracking number matches expected
            if (result.trackingNumber === EXPECTED_TRACKING) {
              console.log('🎉 CORRECT! Extracted tracking number matches expected value!');
              console.log(`   Expected: ${EXPECTED_TRACKING}`);
              console.log(`   Got:      ${result.trackingNumber}`);
            } else {
              console.log('⚠️  WARNING: Tracking number does not match expected value');
              console.log(`   Expected: ${EXPECTED_TRACKING}`);
              console.log(`   Got:      ${result.trackingNumber}`);
            }
            
            resolve(result);
          } else {
            console.log('❌ FAILED');
            console.log('==========');
            console.log(`Error: ${result.error || 'Unknown error'}`);
            
            if (result.debug) {
              console.log('\nDebug Info:');
              console.log(JSON.stringify(result.debug, null, 2));
            }
            
            if (result.suggestion) {
              console.log(`\nSuggestion: ${result.suggestion}`);
            }
            
            reject(new Error(result.error || 'Unknown error'));
          }
        } catch (error) {
          console.log('❌ FAILED to parse response');
          console.log('Raw response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.log('❌ REQUEST ERROR');
      console.log('================');
      console.log(`Error: ${error.message}`);
      console.log('');
      console.log('Make sure:');
      console.log('1. The Next.js server is running (npm run dev)');
      console.log('2. You are authenticated with Gmail');
      console.log('3. The API endpoint is correct');
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run the test
console.log('Starting test in 2 seconds...');
console.log('(Make sure your Next.js dev server is running and you are logged in)');
console.log('');

setTimeout(() => {
  testTrackingExtraction()
    .then(() => {
      console.log('');
      console.log('✅ Test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.log('');
      console.log('❌ Test failed!');
      console.error(error);
      process.exit(1);
    });
}, 2000);



