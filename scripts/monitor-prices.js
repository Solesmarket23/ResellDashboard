const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin with GitHub Secrets
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore(app);

async function monitorPrices() {
  console.log('🔍 Starting StockX price monitoring...');
  
  try {
    // Get all users with monitoring enabled
    const usersSnapshot = await db.collection('users').get();
    let totalProductsChecked = 0;
    let totalAlerts = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Skip if monitoring is disabled
      if (userData.stockxMonitoringActive === false) {
        continue;
      }
      
      // Get user's monitored products
      const productsSnapshot = await db
        .collection('monitored_products')
        .where('userId', '==', userId)
        .get();
        
      if (productsSnapshot.empty) {
        continue;
      }
      
      console.log(`👤 Checking ${productsSnapshot.size} products for user ${userId}`);
      
      // Check if user has StockX tokens
      if (!userData.stockxTokens?.access_token) {
        console.log(`⚠️ No StockX token for user ${userId}, skipping...`);
        continue;
      }
      
      // For each product, we would normally:
      // 1. Fetch current price from StockX
      // 2. Compare with last known price
      // 3. Create alerts if thresholds are met
      // 4. Update the product in Firebase
      
      // For now, just count products
      totalProductsChecked += productsSnapshot.size;
      
      // Log sample product
      if (productsSnapshot.size > 0) {
        const sampleProduct = productsSnapshot.docs[0].data();
        console.log(`📦 Sample product: ${sampleProduct.title} (${sampleProduct.size})`);
        console.log(`💰 Current ask: $${sampleProduct.currentAsk}, Bid: $${sampleProduct.currentBid}`);
      }
    }
    
    console.log(`\n✅ Monitoring complete!`);
    console.log(`📊 Total products checked: ${totalProductsChecked}`);
    console.log(`🚨 Total alerts created: ${totalAlerts}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during monitoring:', error);
    process.exit(1);
  }
}

// Run the monitor
monitorPrices();