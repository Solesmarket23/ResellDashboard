#!/usr/bin/env node

/**
 * Test the auto-reprice cron job manually
 * This script calls the cron endpoint to trigger repricing immediately
 */

const https = require('https');

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://solesmarket.com';

if (!CRON_SECRET) {
  console.error('❌ Error: CRON_SECRET environment variable is not set');
  console.log('\nPlease set it in your .env.local file:');
  console.log('CRON_SECRET=your-secret-here');
  process.exit(1);
}

console.log('🔄 Triggering auto-reprice cron job...');
console.log(`📍 URL: ${APP_URL}/api/cron/auto-reprice`);
console.log('');

const url = new URL(`${APP_URL}/api/cron/auto-reprice`);

const options = {
  hostname: url.hostname,
  path: url.pathname,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${CRON_SECRET}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`📊 Response Status: ${res.statusCode}`);
    console.log('');
    
    try {
      const result = JSON.parse(data);
      console.log('✅ Response:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('\n✅ Cron job executed successfully!');
        if (result.results) {
          console.log(`\n📈 Summary:`);
          console.log(`   - Total users: ${result.results.totalUsers}`);
          console.log(`   - Listings repriced: ${result.results.totalListingsRepriced}`);
          if (result.results.errors && result.results.errors.length > 0) {
            console.log(`   - Errors: ${result.results.errors.length}`);
            result.results.errors.forEach(err => console.log(`     ❌ ${err}`));
          }
        }
      } else {
        console.log('\n❌ Cron job failed');
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
        if (result.message) {
          console.log(`   Message: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  process.exit(1);
});

req.end();

