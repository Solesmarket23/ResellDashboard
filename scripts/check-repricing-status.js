/**
 * Check Auto-Repricing Status
 */

const admin = require('firebase-admin');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  };

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkStatus() {
  const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
  
  console.log('\n🔍 Auto-Repricing Status Check\n');
  console.log('User ID:', userId);
  console.log('Email: solesmarket23@gmail.com\n');
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log('❌ User document not found!');
      process.exit(1);
    }
    
    const userData = userDoc.data();
    
    console.log('📊 Current Settings:\n');
    console.log('  Auto-Repricing Enabled:', userData.stockxAutoRepricingEnabled ? '✅ YES' : '❌ NO');
    
    if (userData.stockxAutoRepricingConfig) {
      console.log('\n  Configuration:');
      console.log('    Strategy:', userData.stockxAutoRepricingConfig.strategy);
      console.log('    Interval:', userData.stockxAutoRepricingConfig.intervalMinutes, 'minutes');
      console.log('    Competitive Buffer: $' + (userData.stockxAutoRepricingConfig.competitiveBuffer || 'N/A'));
      console.log('    Max Reduction:', (userData.stockxAutoRepricingConfig.maxReduction || 'N/A') + '%');
      console.log('    Min Profit Margin:', (userData.stockxAutoRepricingConfig.minProfitMargin || 'N/A') + '%');
    } else {
      console.log('  ⚠️  No configuration found');
    }
    
    console.log('\n  Last Repriced:', userData.lastRepricedAt || 'Never');
    
    if (userData.lastRepricedAt) {
      const lastDate = new Date(userData.lastRepricedAt);
      const now = new Date();
      const diffMs = now.getTime() - lastDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      console.log('  Time Since Last Reprice:', diffMins, 'minutes ago');
      
      if (userData.stockxAutoRepricingConfig?.intervalMinutes) {
        const nextReprice = new Date(lastDate.getTime() + userData.stockxAutoRepricingConfig.intervalMinutes * 60000);
        if (nextReprice > now) {
          const minsUntil = Math.ceil((nextReprice.getTime() - now.getTime()) / 60000);
          console.log('  Next Repricing:', 'In', minsUntil, 'minutes');
        } else {
          console.log('  Next Repricing:', 'Due now!');
        }
      }
    }
    
    console.log('\n📋 What You Should See on Settings Page:\n');
    console.log('  1. Toggle at top-right:', userData.stockxAutoRepricingEnabled ? '✅ ON (cyan/blue)' : '❌ OFF (gray)');
    console.log('  2. Interval options:', userData.stockxAutoRepricingEnabled ? '✅ Visible' : '❌ Hidden (toggle is OFF)');
    console.log('  3. Active interval:', (userData.stockxAutoRepricingConfig?.intervalMinutes || 30) + ' minutes');
    console.log('  4. Save button appears when:', 'You click a different interval');
    
    console.log('\n🔗 Settings Page URL:');
    console.log('   https://solesmarket.com/auto-repricing-settings\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

checkStatus();

