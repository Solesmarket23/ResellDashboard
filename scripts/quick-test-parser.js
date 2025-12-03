/**
 * Quick Test Email Parser - Run locally from Cursor
 * 
 * This script tests the parser against all 8 sample emails locally
 * Run: node scripts/quick-test-parser.js
 */

const fs = require('fs');
const path = require('path');

// Import the parser (we'll use require since it's TypeScript)
// For Node.js, we need to use the compiled version or require directly
const { OrderConfirmationParser } = require('../src/lib/email/orderConfirmationParser.ts');

const EMAIL_FILES = [
  '01-order-confirmed.eml',
  '02-order-confirmation.eml',
  '03-xpress-order-confirmed.eml',
  '04-order-verified-shipped.eml',
  '05-order-shipped.eml',
  '06-xpress-order-shipped.eml',
  '07-xpress-ship-order-delivered.eml',
  '08-order-delivered.eml'
];

console.log('📧 Testing Email Parser with 8 Sample Emails\n');
console.log('='.repeat(80));

const parser = new OrderConfirmationParser(true); // Enable debug
const results = [];

for (const filename of EMAIL_FILES) {
  const filePath = path.join(__dirname, '..', 'sample-emails', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`\n❌ ${filename}: FILE NOT FOUND`);
    results.push({ filename, success: false, error: 'File not found' });
    continue;
  }
  
  try {
    const emailContent = fs.readFileSync(filePath, 'utf-8');
    const orderInfo = parser.parseEmail(emailContent);
    
    console.log(`\n✅ ${filename}`);
    console.log(`   Order #: ${orderInfo.order_number || 'NOT FOUND'}`);
    console.log(`   Type: ${orderInfo.order_type || 'NOT FOUND'}`);
    console.log(`   Status: ${orderInfo.shipping_status || 'NOT FOUND'}`);
    console.log(`   Product: ${orderInfo.product_name || 'NOT FOUND'}`);
    console.log(`   Size: ${orderInfo.size || 'NOT FOUND'}`);
    console.log(`   Style ID: ${orderInfo.style_id || 'NOT FOUND'}`);
    console.log(`   Total: $${orderInfo.total_amount?.toFixed(2) || '0.00'}`);
    console.log(`   Tracking: ${orderInfo.tracking_number || 'NOT FOUND'}`);
    
    results.push({ filename, success: true, data: orderInfo });
  } catch (error) {
    console.log(`\n❌ ${filename}: ERROR`);
    console.log(`   ${error.message}`);
    results.push({ filename, success: false, error: error.message });
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📊 Summary:');
console.log(`   Successful: ${results.filter(r => r.success).length}/${results.length}`);
console.log(`   With Order #: ${results.filter(r => r.success && r.data?.order_number).length}`);
console.log(`   With Size: ${results.filter(r => r.success && r.data?.size).length}`);
console.log(`   With Tracking: ${results.filter(r => r.success && r.data?.tracking_number).length}`);

