/**
 * Quick Email Analysis - Extract key patterns from all 8 emails
 */

const fs = require('fs');
const path = require('path');

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

function analyzeEmail(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Extract subject
  const subjectMatch = content.match(/^Subject:\s*(.+)$/m);
  const subject = subjectMatch ? subjectMatch[1] : 'NOT FOUND';
  
  // Extract order number
  const orderMatch = content.match(/Order\s+number:\s*([A-Z0-9-]+)/i);
  const orderNumber = orderMatch ? orderMatch[1] : 'NOT FOUND';
  
  // Extract size
  const sizeMatch = content.match(/Size:\s*([^<\n]+)/i);
  const size = sizeMatch ? sizeMatch[1].trim() : 'NOT FOUND';
  
  // Extract purchase price
  const priceMatch = content.match(/Purchase Price:.*?\$(\d+\.\d{2})/i);
  const price = priceMatch ? priceMatch[1] : 'NOT FOUND';
  
  // Extract processing fee
  const processingMatch = content.match(/Processing Fee:.*?\$(\d+\.\d{2})/i);
  const processingFee = processingMatch ? processingMatch[1] : 'NOT FOUND';
  
  // Extract shipping fee
  const shippingMatch = content.match(/Shipping:.*?\$(\d+\.\d{2})/i);
  const shippingFee = shippingMatch ? shippingMatch[1] : 'NOT FOUND';
  
  // Extract total
  const totalMatch = content.match(/Total Payment.*?\$(\d+\.\d{2})/i);
  const total = totalMatch ? totalMatch[1] : 'NOT FOUND';
  
  // Extract tracking (if present)
  const trackingMatch = content.match(/(?:Tracking|Track).*?([A-Z0-9]{10,})/i);
  const tracking = trackingMatch ? trackingMatch[1] : 'NOT FOUND';
  
  // Check for Style ID
  const styleMatch = content.match(/Style ID:\s*([A-Z0-9-]+)/i);
  const styleId = styleMatch ? styleMatch[1] : 'NOT FOUND';
  
  return {
    subject,
    orderNumber,
    size,
    price,
    processingFee,
    shippingFee,
    total,
    tracking,
    styleId
  };
}

console.log('📧 Analyzing all 8 email samples...\n');
console.log('='.repeat(80));

emailFiles.forEach((file, index) => {
  const filePath = path.join(__dirname, '..', 'sample-emails', file);
  if (!fs.existsSync(filePath)) {
    console.log(`\n${index + 1}. ${file}: ❌ FILE NOT FOUND`);
    return;
  }
  
  const data = analyzeEmail(filePath);
  
  console.log(`\n${index + 1}. ${file}`);
  console.log('─'.repeat(80));
  console.log(`   Subject:      ${data.subject}`);
  console.log(`   Order Number: ${data.orderNumber}`);
  console.log(`   Size:         ${data.size}`);
  console.log(`   Price:        $${data.price}`);
  console.log(`   Processing:   $${data.processingFee}`);
  console.log(`   Shipping:     $${data.shippingFee}`);
  console.log(`   Total:        $${data.total}`);
  console.log(`   Tracking:     ${data.tracking}`);
  console.log(`   Style ID:     ${data.styleId}`);
  
  // Calculate expected total
  if (data.price !== 'NOT FOUND' && data.processingFee !== 'NOT FOUND' && data.shippingFee !== 'NOT FOUND') {
    const calculated = (parseFloat(data.price) + parseFloat(data.processingFee) + parseFloat(data.shippingFee)).toFixed(2);
    const matches = calculated === data.total;
    console.log(`   Calculated:   $${calculated} ${matches ? '✅' : '❌ MISMATCH'}`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('\n✅ Analysis complete!');




