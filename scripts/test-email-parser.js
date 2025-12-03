/**
 * Test Email Parser - Analyze all 8 sample emails
 * 
 * This script tests the parser against all sample emails and reports:
 * - What fields are extracted correctly
 * - What fields are missing
 * - HTML structure differences
 * - Patterns that work vs patterns that fail
 */

const fs = require('fs');
const path = require('path');
const { parseGmailApiMessage } = require('../src/lib/email/orderConfirmationParser');

// Sample email files
const emailFiles = [
  '01-order-confirmed.eml',
  '02-order-confirmation.eml',
  '03-xpress-order-confirmed.eml',
  '04-order-verified-shipped.eml',
  '05-order-shipped.eml',
  '06-xpress-order-shipped.eml',
  '07-xpress-ship-order-delivered.eml',
  '08-order-delivered.eml'
];

function parseEmailFile(filePath) {
  try {
    const emailContent = fs.readFileSync(filePath, 'utf-8');
    
    // Convert EML format to Gmail API message format
    const gmailMessage = convertEmToGmailFormat(emailContent);
    
    // Parse with debug enabled
    const orderInfo = parseGmailApiMessage(gmailMessage, true);
    
    return {
      success: true,
      orderInfo,
      fileName: path.basename(filePath)
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      fileName: path.basename(filePath)
    };
  }
}

function convertEmToGmailFormat(emlContent) {
  // Extract headers
  const subjectMatch = emlContent.match(/^Subject:\s*(.+)$/m);
  const fromMatch = emlContent.match(/^From:\s*(.+)$/m);
  const dateMatch = emlContent.match(/^Date:\s*(.+)$/m);
  
  // Extract HTML content (everything after first blank line)
  const htmlStart = emlContent.indexOf('\n\n');
  const htmlContent = htmlStart > 0 ? emlContent.substring(htmlStart).trim() : emlContent;
  
  // Create Gmail API message format
  return {
    id: 'test-' + Date.now(),
    payload: {
      headers: [
        { name: 'Subject', value: subjectMatch ? subjectMatch[1] : '' },
        { name: 'From', value: fromMatch ? fromMatch[1] : '' },
        { name: 'Date', value: dateMatch ? dateMatch[1] : '' }
      ],
      body: {
        data: Buffer.from(htmlContent).toString('base64')
      },
      parts: [
        {
          mimeType: 'text/html',
          body: {
            data: Buffer.from(htmlContent).toString('base64')
          },
          headers: [
            { name: 'Content-Type', value: 'text/html; charset=utf-8' },
            { name: 'Content-Transfer-Encoding', value: 'quoted-printable' }
          ]
        }
      ]
    }
  };
}

function analyzeResults(results) {
  console.log('\n📊 ===== EMAIL PARSER ANALYSIS RESULTS =====\n');
  
  const fieldStats = {
    order_number: { found: 0, missing: 0 },
    product_name: { found: 0, missing: 0 },
    size: { found: 0, missing: 0 },
    purchase_price: { found: 0, missing: 0 },
    processing_fee: { found: 0, missing: 0 },
    shipping_fee: { found: 0, missing: 0 },
    total_amount: { found: 0, missing: 0 },
    tracking_number: { found: 0, missing: 0 },
    style_id: { found: 0, missing: 0 }
  };
  
  results.forEach((result, index) => {
    console.log(`\n📧 Email ${index + 1}: ${result.fileName}`);
    console.log('─'.repeat(60));
    
    if (!result.success) {
      console.log(`❌ FAILED: ${result.error}`);
      return;
    }
    
    const oi = result.orderInfo;
    
    // Check each field
    const fields = [
      { key: 'order_number', label: 'Order Number' },
      { key: 'product_name', label: 'Product Name' },
      { key: 'size', label: 'Size' },
      { key: 'purchase_price', label: 'Purchase Price' },
      { key: 'processing_fee', label: 'Processing Fee' },
      { key: 'shipping_fee', label: 'Shipping Fee' },
      { key: 'total_amount', label: 'Total Amount' },
      { key: 'tracking_number', label: 'Tracking Number' },
      { key: 'style_id', label: 'Style ID' }
    ];
    
    fields.forEach(field => {
      const value = oi[field.key];
      const hasValue = value !== undefined && value !== null && value !== '' && value !== 0;
      
      if (hasValue) {
        fieldStats[field.key].found++;
        console.log(`✅ ${field.label}: ${value}`);
      } else {
        fieldStats[field.key].missing++;
        console.log(`❌ ${field.label}: MISSING`);
      }
    });
    
    console.log(`📦 Status: ${oi.shipping_status || 'unknown'}`);
    console.log(`📦 Type: ${oi.order_type || 'unknown'}`);
  });
  
  // Summary statistics
  console.log('\n\n📈 ===== SUMMARY STATISTICS =====\n');
  Object.keys(fieldStats).forEach(key => {
    const stats = fieldStats[key];
    const total = stats.found + stats.missing;
    const percentage = total > 0 ? ((stats.found / total) * 100).toFixed(1) : 0;
    const status = stats.found === total ? '✅' : stats.found === 0 ? '❌' : '⚠️';
    console.log(`${status} ${key.padEnd(20)}: ${stats.found}/${total} (${percentage}%)`);
  });
  
  const overallSuccess = Object.values(fieldStats).every(s => s.missing === 0);
  console.log(`\n${overallSuccess ? '✅' : '⚠️'} Overall: ${overallSuccess ? 'ALL FIELDS EXTRACTED' : 'SOME FIELDS MISSING'}`);
}

// Main execution
console.log('🔍 Testing email parser against all 8 sample emails...\n');

const results = emailFiles.map(file => {
  const filePath = path.join(__dirname, '..', 'sample-emails', file);
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: 'File not found',
      fileName: file
    };
  }
  return parseEmailFile(filePath);
});

analyzeResults(results);
