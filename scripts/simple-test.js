#!/usr/bin/env node

/**
 * Simple Email Parser Test
 * 
 * This script tests the email parser with a simple approach
 * Usage: node scripts/simple-test.js <email-file-path>
 */

const fs = require('fs');
const cheerio = require('cheerio');

function testEmailFile(filePath) {
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
    
    // Parse with cheerio
    const $ = cheerio.load(htmlContent);
    
    console.log('🔍 Extracting key information...');
    
    // Extract key information from the HTML
    const extractedInfo = {
      // Look for order number
      orderNumber: extractOrderNumber($),
      
      // Look for product name
      productName: extractProductName($),
      
      // Look for pricing
      pricing: extractPricing($),
      
      // Look for size
      size: extractSize($),
      
      // Look for dates
      dates: extractDates($),
      
      // Look for tracking
      tracking: extractTracking($)
    };
    
    console.log('📦 Extracted Information:');
    console.log(JSON.stringify(extractedInfo, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing email file:', error.message);
  }
}

function extractOrderNumber($) {
  // Look for order number patterns
  const text = $.text();
  const orderPatterns = [
    /Order number:\s*([0-9-]+)/i,
    /Order #([0-9-]+)/i,
    /Order:\s*([0-9-]+)/i
  ];
  
  for (const pattern of orderPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractProductName($) {
  // Look for Nike product names
  const text = $.text();
  const productPatterns = [
    /Nike\s+[^(]+(?:\([^)]+\))?/i,
    /A'ja Wilson A'One[^(]*(?:\([^)]+\))?/i
  ];
  
  for (const pattern of productPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

function extractPricing($) {
  const text = $.text();
  const pricing = {};
  
  // Look for pricing patterns
  const pricePatterns = [
    { key: 'purchasePrice', pattern: /Purchase Price:\s*\$([0-9.]+)/i },
    { key: 'processingFee', pattern: /Processing Fee:\s*\$([0-9.]+)/i },
    { key: 'shipping', pattern: /Shipping:\s*\$([0-9.]+)/i },
    { key: 'total', pattern: /TOTAL PAYMENT\s*\$([0-9.]+)/i }
  ];
  
  for (const { key, pattern } of pricePatterns) {
    const match = text.match(pattern);
    if (match) {
      pricing[key] = parseFloat(match[1]);
    }
  }
  
  return pricing;
}

function extractSize($) {
  const text = $.text();
  const sizePatterns = [
    /US W ([0-9.]+)/i,
    /Size:\s*([0-9.]+)/i
  ];
  
  for (const pattern of sizePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractDates($) {
  const text = $.text();
  const dates = {};
  
  // Look for delivery dates
  const deliveryMatch = text.match(/Estimated Arrival:\s*([^-]+)\s*-\s*([^\n]+)/i);
  if (deliveryMatch) {
    dates.estimatedStart = deliveryMatch[1].trim();
    dates.estimatedEnd = deliveryMatch[2].trim();
  }
  
  return dates;
}

function extractTracking($) {
  // Look for tracking numbers in links or text
  const text = $.text();
  const trackingPatterns = [
    /tracknumbers=([0-9]+)/i,
    /tracking[:\s]+([0-9]+)/i
  ];
  
  for (const pattern of trackingPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// Main execution
const emailFilePath = process.argv[2];

if (!emailFilePath) {
  console.log('Usage: node scripts/simple-test.js <email-file-path>');
  console.log('Example: node scripts/simple-test.js "test-data/emails/stockx/✅ Order Verified & Shipped_ Nike A\'ja Wilson A\'One Pink A\'ura (Women\'s).html"');
  process.exit(1);
}

testEmailFile(emailFilePath);

