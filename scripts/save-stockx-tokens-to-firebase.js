#!/usr/bin/env node

/**
 * Save StockX tokens from cookies to Firebase
 * This is needed for the cron job to access the tokens
 */

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🔐 StockX Token to Firebase Saver\n');
  console.log('This script will save your StockX tokens to Firebase so the cron job can access them.\n');

  // Get the access token from user
  const accessToken = await question('Enter your StockX access token (from browser cookies): ');
  const refreshToken = await question('Enter your StockX refresh token (from browser cookies): ');
  const userId = await question('Enter your user ID (site-user-id from cookies): ');

  if (!accessToken || !refreshToken || !userId) {
    console.error('\n❌ All fields are required!');
    rl.close();
    process.exit(1);
  }

  console.log('\n📤 Sending tokens to API...');

  const data = JSON.stringify({
    userId,
    accessToken,
    refreshToken
  });

  const options = {
    hostname: 'www.solesmarket.com',
    path: '/api/stockx/save-tokens',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log(`\n📊 Response Status: ${res.statusCode}`);
      
      try {
        const result = JSON.parse(responseData);
        console.log('\n✅ Response:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.success) {
          console.log('\n✅ Tokens saved successfully!');
          console.log('The cron job can now access your StockX tokens.');
        } else {
          console.log('\n❌ Failed to save tokens');
        }
      } catch (error) {
        console.error('❌ Failed to parse response:', error.message);
        console.log('Raw response:', responseData);
      }
      
      rl.close();
    });
  });

  req.on('error', (error) => {
    console.error('\n❌ Request failed:', error.message);
    rl.close();
    process.exit(1);
  });

  req.write(data);
  req.end();
}

console.log('📖 How to get your tokens from browser:\n');
console.log('1. Open https://www.solesmarket.com in your browser');
console.log('2. Open DevTools (F12 or Right-click → Inspect)');
console.log('3. Go to Application tab → Cookies → https://www.solesmarket.com');
console.log('4. Find these cookies:');
console.log('   - stockx_access_token');
console.log('   - stockx_refresh_token');
console.log('   - site-user-id');
console.log('5. Copy their values and paste below\n');

main().catch(error => {
  console.error('❌ Error:', error);
  rl.close();
  process.exit(1);
});

