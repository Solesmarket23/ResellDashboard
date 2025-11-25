/**
 * Enable Auto-Repricing for Your Account
 * 
 * This script updates your Firebase user document to enable automated repricing.
 * Run this after deploying to Vercel.
 */

const admin = require('firebase-admin');
const readline = require('readline');

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

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function enableAutoRepricing() {
  console.log('\n🤖 Auto-Repricing Configuration\n');
  console.log('This will enable automated repricing for your StockX listings.\n');

  // Get user email
  const email = await question('Enter your email address: ');
  
  // Find user by email
  const usersSnapshot = await db.collection('users')
    .where('email', '==', email.trim())
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.log('\n❌ User not found with email:', email);
    console.log('Please make sure you\'re logged in to the app first.\n');
    rl.close();
    return;
  }

  const userDoc = usersSnapshot.docs[0];
  const userId = userDoc.id;
  const userData = userDoc.data();

  console.log('\n✅ Found user:', userData.displayName || email);
  console.log('\n📊 Current Settings:');
  console.log('  Auto-Repricing Enabled:', userData.stockxAutoRepricingEnabled || false);
  console.log('  Current Strategy:', userData.stockxAutoRepricingConfig?.strategy || 'Not set');

  console.log('\n\n🎯 Choose Your Repricing Strategy:\n');
  console.log('1. Competitive (Recommended for fast sales)');
  console.log('   - Prices $1 below lowest ask');
  console.log('   - Best for high-velocity sales\n');
  
  console.log('2. Margin-Based (Recommended for profit protection)');
  console.log('   - Maintains 15% minimum profit');
  console.log('   - Never goes below cost + margin\n');
  
  console.log('3. Velocity-Based (Recommended for clearing inventory)');
  console.log('   - Reduces prices on slow-moving items');
  console.log('   - Aggressive on old inventory\n');
  
  console.log('4. Hybrid (Balanced approach)');
  console.log('   - Combines all strategies');
  console.log('   - Best for overall optimization\n');

  const strategyChoice = await question('Select strategy (1-4): ');

  let strategy = 'competitive';
  let config = {};

  switch(strategyChoice.trim()) {
    case '1':
      strategy = 'competitive';
      config = {
        strategy: 'competitive',
        competitiveBuffer: 1,
        maxReduction: 20,
        minProfitMargin: 5,
        enabled: true
      };
      break;
    case '2':
      strategy = 'margin';
      config = {
        strategy: 'margin',
        minProfitMargin: 15,
        maxReduction: 15,
        competitiveBuffer: 2,
        enabled: true
      };
      break;
    case '3':
      strategy = 'velocity';
      config = {
        strategy: 'velocity',
        maxDaysListed: 30,
        maxReduction: 25,
        minProfitMargin: 5,
        enabled: true
      };
      break;
    case '4':
      strategy = 'hybrid';
      config = {
        strategy: 'hybrid',
        competitiveBuffer: 2,
        maxReduction: 15,
        minProfitMargin: 10,
        enabled: true
      };
      break;
    default:
      console.log('\n❌ Invalid choice. Using default (Competitive).');
      config = {
        strategy: 'competitive',
        competitiveBuffer: 1,
        maxReduction: 20,
        minProfitMargin: 5,
        enabled: true
      };
  }

  console.log('\n\n📋 Configuration Summary:');
  console.log('  Strategy:', config.strategy);
  console.log('  Competitive Buffer:', config.competitiveBuffer || 'N/A');
  console.log('  Max Reduction:', config.maxReduction + '%');
  console.log('  Min Profit Margin:', config.minProfitMargin + '%');
  console.log('  Max Days Listed:', config.maxDaysListed || 'N/A');

  const confirm = await question('\n✅ Enable auto-repricing with these settings? (yes/no): ');

  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Cancelled. No changes made.\n');
    rl.close();
    return;
  }

  // Update Firebase
  await db.collection('users').doc(userId).update({
    stockxAutoRepricingEnabled: true,
    stockxAutoRepricingConfig: config,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('\n✅ Auto-repricing enabled successfully!\n');
  console.log('🤖 Your listings will now be repriced automatically every 5 minutes.\n');
  console.log('📊 Monitor your repricing logs in Firebase: repricing_logs collection\n');
  console.log('⚙️  To disable, set stockxAutoRepricingEnabled to false in Firebase\n');

  rl.close();
}

// Run the script
enableAutoRepricing().catch(error => {
  console.error('\n❌ Error:', error.message);
  rl.close();
  process.exit(1);
});

