#!/usr/bin/env npx ts-node

/**
 * Email Parser Test Script
 * 
 * This script helps test the email parser with raw HTML email files
 * Usage: npx ts-node scripts/test-email-parser.ts <email-file-path>
 */

const fs = require('fs');
const path = require('path');

// Import your email parser
const { parseGmailApiMessage } = require('../src/lib/email/orderConfirmationParser');

function testEmailFile(filePath: string) {
  try {
    console.log(`📧 Testing email file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      return;
    }
    
    // Read the HTML content
    const htmlContent = fs.readFileSync(filePath, 'utf8');
    console.log(`📄 File size: ${htmlContent.length} characters`);
    
    // Create a mock Gmail API message structure
    const mockGmailMessage = {
      id: 'test-email-123',
      payload: {
        mimeType: 'text/html',
        body: {
          data: Buffer.from(htmlContent).toString('base64')
        },
        headers: [
          { name: 'Subject', value: 'Order Confirmation - Test' },
          { name: 'From', value: 'orders@stockx.com' },
          { name: 'Date', value: new Date().toISOString() }
        ]
      }
    };
    
    console.log('🔍 Mock Gmail message created');
    console.log('📊 HTML content preview:');
    console.log(htmlContent.substring(0, 200) + '...');
    
    console.log('🔍 Parsing email...');
    const orderInfo = parseGmailApiMessage(mockGmailMessage, true); // Enable debug mode
    
    if (orderInfo) {
      console.log('✅ Parsing successful!');
      console.log('📦 Order Info:');
      console.log(JSON.stringify(orderInfo, null, 2));
    } else {
      console.log('❌ Parsing failed - no order info extracted');
    }
    
  } catch (error) {
    console.error('❌ Error testing email file:', (error as Error).message);
  }
}

// Main execution
const emailFilePath = process.argv[2];

if (!emailFilePath) {
  console.log('Usage: node scripts/test-email-parser.js <email-file-path>');
  console.log('Example: node scripts/test-email-parser.js test-data/emails/stockx/stockx_regular_example.html');
  process.exit(1);
}

testEmailFile(emailFilePath);
