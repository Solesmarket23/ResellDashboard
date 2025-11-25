#!/usr/bin/env node

/**
 * Fix Nike Giannis pricing strategy to beat_lowest
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
  project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

console.log('🔧 Firebase config:', {
  hasProjectId: !!serviceAccount.project_id,
  hasClientEmail: !!serviceAccount.client_email,
  hasPrivateKey: !!serviceAccount.private_key
});

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixPricingStrategy() {
  try {
    const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
    const listingId = '279771c7-5fe9-4049-b959-7c7c9806be97';
    
    console.log('🔍 Looking for Nike Giannis pricing settings...');
    
    const snapshot = await db.collection('stockxPricingSettings')
      .where('userId', '==', userId)
      .where('listingId', '==', listingId)
      .get();
    
    if (snapshot.empty) {
      console.log('❌ No settings found for Nike Giannis');
      process.exit(1);
    }
    
    const doc = snapshot.docs[0];
    const currentData = doc.data();
    
    console.log('📋 Current strategy:', currentData.pricingStrategy);
    
    // Update to beat_lowest
    await doc.ref.update({
      pricingStrategy: {
        type: 'beat_lowest',
        value: 1
      },
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Updated pricing strategy to beat_lowest by $1');
    console.log('🎯 Nike Giannis will now auto-reprice every minute!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPricingStrategy();

