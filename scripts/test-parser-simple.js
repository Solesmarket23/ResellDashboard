/**
 * Simple Parser Test - Test the email parser with sample emails
 * Run: node scripts/test-parser-simple.js
 */

const fs = require('fs');
const path = require('path');

// We'll use a simple approach - read the email and check basic extraction
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

console.log('📧 Testing Email Parser\n');
console.log('='.repeat(80));

const results = [];

for (const filename of EMAIL_FILES) {
  const filePath = path.join(__dirname, '..', 'sample-emails', filename);
  
  if (!fs.existsSync(filePath)) {
    console.log(`\n❌ ${filename}: FILE NOT FOUND`);
    results.push({ filename, found: false });
    continue;
  }
  
  try {
    const emailContent = fs.readFileSync(filePath, 'utf-8');
    
    // Basic checks
    const hasStockX = emailContent.toLowerCase().includes('stockx');
    const hasSubject = emailContent.match(/^Subject:\s*(.+)$/m);
    const hasHtml = emailContent.includes('Content-Type: text/html');
    const hasQuotedPrintable = emailContent.includes('Content-Transfer-Encoding: quoted-printable');
    const hasOrderNumber = emailContent.match(/Order\s+number:\s*([A-Z0-9-]+)/i);
    const hasSize = emailContent.match(/Size:\s*([^<\n]+)/i);
    
    // Check for HTML content
    const htmlStart = emailContent.indexOf('Content-Type: text/html');
    let htmlLength = 0;
    if (htmlStart !== -1) {
      const blankLine = emailContent.indexOf('\n\n', htmlStart);
      if (blankLine !== -1) {
        const htmlContent = emailContent.substring(blankLine + 2);
        htmlLength = htmlContent.length;
      }
    }
    
    console.log(`\n✅ ${filename}`);
    console.log(`   File size: ${(emailContent.length / 1024).toFixed(2)} KB`);
    console.log(`   Has StockX: ${hasStockX ? '✅' : '❌'}`);
    console.log(`   Subject: ${hasSubject ? hasSubject[1].substring(0, 60) + '...' : 'NOT FOUND'}`);
    console.log(`   Has HTML: ${hasHtml ? '✅' : '❌'}`);
    console.log(`   Quoted-Printable: ${hasQuotedPrintable ? '✅' : '❌'}`);
    console.log(`   HTML content length: ${htmlLength > 0 ? htmlLength + ' chars' : 'NOT FOUND'}`);
    console.log(`   Order # pattern: ${hasOrderNumber ? hasOrderNumber[1] : 'NOT FOUND'}`);
    console.log(`   Size pattern: ${hasSize ? hasSize[1].trim() : 'NOT FOUND'}`);
    
    // Check for specific patterns
    const hasAttributesLi = emailContent.includes('class="attributes"') || emailContent.includes('class=3D"attributes"');
    console.log(`   Has <li class="attributes">: ${hasAttributesLi ? '✅' : '❌'}`);
    
    results.push({
      filename,
      found: true,
      hasStockX,
      hasHtml,
      hasQuotedPrintable,
      htmlLength,
      hasOrderNumber: !!hasOrderNumber,
      hasSize: !!hasSize,
      hasAttributesLi
    });
  } catch (error) {
    console.log(`\n❌ ${filename}: ERROR`);
    console.log(`   ${error.message}`);
    results.push({ filename, found: true, error: error.message });
  }
}

console.log('\n' + '='.repeat(80));
console.log('\n📊 Summary:');
console.log(`   Files found: ${results.filter(r => r.found).length}/${EMAIL_FILES.length}`);
console.log(`   Has StockX: ${results.filter(r => r.hasStockX).length}`);
console.log(`   Has HTML: ${results.filter(r => r.hasHtml).length}`);
console.log(`   Quoted-Printable: ${results.filter(r => r.hasQuotedPrintable).length}`);
console.log(`   Has HTML content: ${results.filter(r => r.htmlLength > 0).length}`);
console.log(`   Has Order # pattern: ${results.filter(r => r.hasOrderNumber).length}`);
console.log(`   Has Size pattern: ${results.filter(r => r.hasSize).length}`);
console.log(`   Has <li class="attributes">: ${results.filter(r => r.hasAttributesLi).length}`);

// Check for potential issues
console.log('\n🔍 Potential Issues:');
const noHtml = results.filter(r => r.found && !r.htmlLength);
if (noHtml.length > 0) {
  console.log(`   ⚠️  ${noHtml.length} files have no extractable HTML content`);
  noHtml.forEach(r => console.log(`      - ${r.filename}`));
}

const noQuotedPrintable = results.filter(r => r.found && r.hasHtml && !r.hasQuotedPrintable);
if (noQuotedPrintable.length > 0) {
  console.log(`   ⚠️  ${noQuotedPrintable.length} files have HTML but no quoted-printable encoding`);
}

const noAttributes = results.filter(r => r.found && r.htmlLength > 0 && !r.hasAttributesLi);
if (noAttributes.length > 0) {
  console.log(`   ⚠️  ${noAttributes.length} files don't have <li class="attributes"> pattern`);
  noAttributes.forEach(r => console.log(`      - ${r.filename}`));
}

