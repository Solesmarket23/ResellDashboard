#!/usr/bin/env node

/**
 * Check the repricing logs from Firebase to see when the last repricing ran
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('❌ Error: Missing Firebase Admin credentials');
  console.log('\nRequired environment variables:');
  console.log('  - NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  console.log('  - FIREBASE_CLIENT_EMAIL');
  console.log('  - FIREBASE_PRIVATE_KEY');
  process.exit(1);
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const db = admin.firestore();

async function checkRepricingLogs() {
  try {
    console.log('🔍 Checking repricing logs...\n');

    // Get the last 10 repricing logs
    const logsSnapshot = await db.collection('repricing_logs')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    if (logsSnapshot.empty) {
      console.log('📭 No repricing logs found');
      console.log('   The cron job may not have run yet, or no listings have been repriced.');
      return;
    }

    console.log(`📊 Found ${logsSnapshot.size} recent repricing logs:\n`);

    logsSnapshot.forEach((doc, index) => {
      const data = doc.data();
      const timestamp = new Date(data.timestamp);
      const now = new Date();
      const minutesAgo = Math.floor((now - timestamp) / (1000 * 60));

      console.log(`${index + 1}. ${timestamp.toLocaleString()}`);
      console.log(`   ⏰ ${minutesAgo} minutes ago`);
      console.log(`   👤 User: ${data.userId}`);
      console.log(`   📦 Listings processed: ${data.listingsProcessed}`);
      console.log(`   ✅ Listings repriced: ${data.listingsRepriced}`);
      console.log(`   🎯 Strategy: ${data.strategy || 'individual'}`);
      console.log(`   ⚙️  Interval: ${data.intervalMinutes || 5} minutes`);
      console.log(`   🤖 Automated: ${data.automated ? 'Yes' : 'No'}`);
      console.log('');
    });

    // Check user's auto-repricing settings
    console.log('\n🔧 Checking user auto-repricing settings...\n');
    
    const usersSnapshot = await db.collection('users')
      .where('stockxAutoRepricingEnabled', '==', true)
      .get();

    if (usersSnapshot.empty) {
      console.log('❌ No users have auto-repricing enabled');
      console.log('   Run: npm run enable-repricing');
      return;
    }

    console.log(`✅ ${usersSnapshot.size} user(s) have auto-repricing enabled:\n`);

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const lastRepricedAt = userData.lastRepricedAt ? new Date(userData.lastRepricedAt) : null;
      const config = userData.stockxAutoRepricingConfig || {};

      console.log(`👤 User: ${userDoc.id}`);
      if (lastRepricedAt) {
        const minutesAgo = Math.floor((new Date() - lastRepricedAt) / (1000 * 60));
        console.log(`   ⏰ Last repriced: ${lastRepricedAt.toLocaleString()} (${minutesAgo} minutes ago)`);
      } else {
        console.log(`   ⏰ Last repriced: Never`);
      }
      console.log(`   ⚙️  Interval: ${config.intervalMinutes || 5} minutes`);
      console.log(`   🎯 Strategy: ${config.strategy || 'individual'}`);
      console.log('');
    }

    // Check listing settings
    console.log('\n📋 Checking listing settings...\n');
    
    const settingsSnapshot = await db.collection('stockxListingSettings')
      .limit(20)
      .get();

    if (settingsSnapshot.empty) {
      console.log('❌ No listing settings found');
      console.log('   Users need to set pricing rules for their listings in the dashboard.');
      return;
    }

    console.log(`✅ Found ${settingsSnapshot.size} listing(s) with saved settings:\n`);

    const strategyCount = {};
    settingsSnapshot.forEach((doc) => {
      const data = doc.data();
      const strategyType = data.pricingStrategy?.type || 'unknown';
      strategyCount[strategyType] = (strategyCount[strategyType] || 0) + 1;
    });

    Object.entries(strategyCount).forEach(([strategy, count]) => {
      console.log(`   ${strategy}: ${count} listing(s)`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

checkRepricingLogs();

