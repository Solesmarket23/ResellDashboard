#!/usr/bin/env node

/**
 * Script to add tracking numbers to purchases in Firebase
 * Usage: node scripts/add-tracking.js
 */

const https = require('https');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Sample tracking data - replace with your real tracking numbers
const trackingData = [
  {
    orderNumber: 'SX123456789', // Replace with real order number
    tracking: '1Z999AA1234567890', // Replace with real UPS tracking
    carrier: 'UPS',
    shippingStatus: 'shipped'
  },
  {
    orderNumber: 'SX987654321', // Replace with real order number  
    tracking: '123456789012', // Replace with real FedEx tracking
    carrier: 'FedEx',
    shippingStatus: 'in_transit'
  },
  {
    orderNumber: 'SX555666777', // Replace with real order number
    tracking: '9400128206212345678901', // Replace with real USPS tracking
    carrier: 'USPS',
    shippingStatus: 'out_for_delivery'
  }
];

async function addTrackingToPurchases() {
  console.log('📦 Adding tracking numbers to purchases...');
  console.log('=====================================');
  
  try {
    // First, get all purchases to see what we have
    console.log('\n1. Fetching existing purchases...');
    const purchasesResponse = await makeRequest('GET', '/api/purchases');
    
    if (purchasesResponse.success) {
      console.log(`✅ Found ${purchasesResponse.purchases.length} purchases`);
      
      // Show first few purchases
      purchasesResponse.purchases.slice(0, 3).forEach((purchase, index) => {
        console.log(`   ${index + 1}. Order: ${purchase.orderNumber} | Tracking: ${purchase.tracking || 'None'}`);
      });
    } else {
      console.log('❌ Failed to fetch purchases:', purchasesResponse.error);
      return;
    }
    
    // Now add tracking data
    console.log('\n2. Adding tracking data...');
    
    for (const tracking of trackingData) {
      try {
        console.log(`   Adding tracking for order ${tracking.orderNumber}...`);
        
        // Use the update tracking API
        const updateResponse = await makeRequest('POST', '/api/gmail/update-tracking', {
          orderNumber: tracking.orderNumber,
          tracking: tracking.tracking,
          carrier: tracking.carrier,
          shippingStatus: tracking.shippingStatus
        });
        
        if (updateResponse.success) {
          console.log(`   ✅ Updated order ${tracking.orderNumber}`);
        } else {
          console.log(`   ❌ Failed to update order ${tracking.orderNumber}: ${updateResponse.error}`);
        }
        
      } catch (error) {
        console.log(`   ❌ Error updating order ${tracking.orderNumber}:`, error.message);
      }
    }
    
    console.log('\n🎉 Tracking update process completed!');
    console.log('\n3. Testing AfterShip integration...');
    
    // Test AfterShip with one of the tracking numbers
    const testTracking = trackingData[0].tracking;
    const testResponse = await makeRequest('POST', '/api/tracking/test-aftership', {
      trackingNumber: testTracking
    });
    
    if (testResponse.success) {
      console.log(`✅ AfterShip test successful for ${testTracking}`);
      console.log(`   Status: ${testResponse.trackingInfo.status}`);
      console.log(`   Carrier: ${testResponse.trackingInfo.carrier}`);
    } else {
      console.log(`❌ AfterShip test failed: ${testResponse.error}`);
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  }
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Add-Tracking-Script/1.0'
      }
    };
    
    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }
    
    const req = (url.protocol === 'https:' ? https : require('http')).request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve(parsedData);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Run the script
if (require.main === module) {
  addTrackingToPurchases().catch(console.error);
}

module.exports = { addTrackingToPurchases };
