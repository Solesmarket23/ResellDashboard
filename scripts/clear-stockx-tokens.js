#!/usr/bin/env node

/**
 * Clear StockX tokens from Firebase to force a fresh reconnection
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

async function clearTokens() {
  try {
    const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
    
    console.log('🗑️  Clearing StockX tokens from Firebase...\n');
    console.log(`User ID: ${userId}\n`);

    await db.collection('users').doc(userId).update({
      stockxTokens: admin.firestore.FieldValue.delete()
    });

    console.log('✅ StockX tokens cleared from Firebase!');
    console.log('\nNow you can:');
    console.log('1. Refresh https://www.solesmarket.com/dashboard?section=stockx-arbitrage');
    console.log('2. Click "Connect to StockX"');
    console.log('3. The new tokens will be automatically saved to Firebase');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

clearTokens();

