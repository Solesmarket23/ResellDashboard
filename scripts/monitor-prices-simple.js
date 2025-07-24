const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

console.log('🚀 Starting price monitor...');

// Parse service account from environment variable
let serviceAccount;
try {
  // If FIREBASE_SERVICE_ACCOUNT is set, use that (full JSON)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Otherwise use individual variables
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
  }
  
  console.log('✅ Service account loaded for project:', serviceAccount.projectId);
} catch (error) {
  console.error('❌ Failed to parse service account:', error);
  process.exit(1);
}

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(app);

async function monitorPrices() {
  console.log('🔍 Connecting to Firebase...');
  
  try {
    // Test connection
    const testDoc = await db.collection('users').limit(1).get();
    console.log('✅ Firebase connection successful');
    
    // Get all monitored products count
    const productsSnapshot = await db.collection('monitored_products').get();
    console.log(`📦 Total products in monitoring: ${productsSnapshot.size}`);
    
    // Count by user
    const userProducts = {};
    productsSnapshot.forEach(doc => {
      const data = doc.data();
      const userId = data.userId || 'unknown';
      userProducts[userId] = (userProducts[userId] || 0) + 1;
    });
    
    console.log('\n👥 Products per user:');
    Object.entries(userProducts).forEach(([userId, count]) => {
      console.log(`   User ${userId}: ${count} products`);
    });
    
    console.log('\n✅ Monitoring check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the monitor
monitorPrices();