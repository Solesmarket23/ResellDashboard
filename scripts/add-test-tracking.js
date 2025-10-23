#!/usr/bin/env node

/**
 * Script to add multiple test UPS tracking numbers
 * Usage: node scripts/add-test-tracking.js
 */

const testTrackingNumbers = [
  {
    trackingNumber: "1Z999AA1234567890",
    productName: "Nike Air Jordan 1 Retro High OG",
    productBrand: "Nike",
    productSize: "10.5",
    carrier: "UPS"
  },
  {
    trackingNumber: "1Z999BB2345678901",
    productName: "Adidas Yeezy 350 V2",
    productBrand: "Adidas",
    productSize: "11",
    carrier: "UPS"
  },
  {
    trackingNumber: "1Z999CC3456789012",
    productName: "Travis Scott Jordan 1 Low",
    productBrand: "Nike",
    productSize: "9.5",
    carrier: "UPS"
  },
  {
    trackingNumber: "1Z999DD4567890123",
    productName: "Off-White Air Max 90",
    productBrand: "Nike",
    productSize: "10",
    carrier: "UPS"
  },
  {
    trackingNumber: "1Z999EE5678901234",
    productName: "Fragment Design Jordan 1",
    productBrand: "Nike",
    productSize: "12",
    carrier: "UPS"
  }
];

async function addTrackingNumber(trackingData) {
  try {
    const response = await fetch('http://localhost:3000/api/deliveries/sync', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'test',
        ...trackingData
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Added tracking: ${trackingData.trackingNumber} - ${trackingData.productName}`);
    } else {
      console.log(`❌ Failed to add tracking: ${trackingData.trackingNumber} - ${result.error}`);
    }
  } catch (error) {
    console.log(`❌ Error adding tracking: ${trackingData.trackingNumber} - ${error.message}`);
  }
}

async function addAllTrackingNumbers() {
  console.log('🚀 Adding test UPS tracking numbers...\n');
  
  for (const trackingData of testTrackingNumbers) {
    await addTrackingNumber(trackingData);
    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n✅ All tracking numbers added!');
  console.log('\n📋 You can now test these tracking numbers in your deliveries page.');
}

// Run the script
addAllTrackingNumbers().catch(console.error);
