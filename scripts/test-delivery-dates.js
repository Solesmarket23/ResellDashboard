#!/usr/bin/env node

/**
 * Test script for delivery date extraction
 * Usage: node scripts/test-delivery-dates.js [tracking_number1] [tracking_number2] ...
 */

const fetch = require('node-fetch');

// Sample FedEx tracking numbers for testing
const SAMPLE_TRACKING_NUMBERS = [
  '794894589430', // From the FedEx schema example
  '794887035251', // From the FedEx schema example
  '123456789012'  // Test number from schema
];

async function testDeliveryDates(trackingNumbers) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  console.log('🧪 Testing Enhanced Delivery Date Extraction');
  console.log('==============================================');
  console.log(`Testing ${trackingNumbers.length} tracking numbers:`);
  trackingNumbers.forEach((tn, index) => console.log(`  ${index + 1}. ${tn}`));
  console.log('');

  try {
    const response = await fetch(`${baseUrl}/api/tracking/test-delivery-dates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackingNumbers })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    console.log('📊 Test Results Summary:');
    console.log(`✅ Successful: ${data.summary.successful}`);
    console.log(`❌ Failed: ${data.summary.failed}`);
    console.log(`📅 With Estimated Delivery: ${data.summary.withEstimatedDelivery}`);
    console.log(`📦 With Actual Delivery: ${data.summary.withActualDelivery}`);
    console.log(`📋 With Commitment Date: ${data.summary.withCommitmentDate}`);
    console.log(`📅 With Appointment Date: ${data.summary.withAppointmentDate}`);
    console.log('');

    console.log('📋 Detailed Results:');
    console.log('====================');
    
    data.results.forEach((result, index) => {
      console.log(`\n${index + 1}. Tracking Number: ${result.trackingNumber}`);
      console.log(`   Carrier: ${result.carrier}`);
      console.log(`   Status: ${result.status}`);
      
      if (result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      } else {
        console.log(`   📅 Estimated Delivery: ${result.estimatedDelivery || 'Not available'}`);
        console.log(`   📦 Actual Delivery: ${result.actualDelivery || 'Not available'}`);
        console.log(`   📋 Commitment Date: ${result.commitmentDate || 'Not available'}`);
        console.log(`   📅 Appointment Date: ${result.appointmentDeliveryDate || 'Not available'}`);
        
        if (result.deliveryTimeWindow?.estimated) {
          console.log(`   ⏰ Estimated Window: ${result.deliveryTimeWindow.estimated.starts} - ${result.deliveryTimeWindow.estimated.ends}`);
        }
        
        if (result.deliveryDetails) {
          console.log(`   📍 Delivery Location: ${result.deliveryDetails.location || 'Not available'}`);
          console.log(`   ✍️  Signature Required: ${result.deliveryDetails.signatureName || 'Not available'}`);
        }
        
        console.log(`   🔄 Updates Count: ${result.updatesCount}`);
        console.log(`   📦 Service Type: ${result.serviceType || 'Not available'}`);
        
        if (result.recentScans.length > 0) {
          console.log(`   📋 Recent Scans:`);
          result.recentScans.forEach(scan => {
            console.log(`      - ${scan.timestamp}: ${scan.description} (${scan.location})`);
          });
        }
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Get tracking numbers from command line arguments or use samples
const trackingNumbers = process.argv.slice(2).length > 0 
  ? process.argv.slice(2)
  : SAMPLE_TRACKING_NUMBERS;

// Run the test
testDeliveryDates(trackingNumbers)
  .then(() => {
    console.log('\n✅ Test completed successfully!');
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
