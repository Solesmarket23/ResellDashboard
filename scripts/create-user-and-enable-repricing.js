/**
 * Create User and Enable Auto-Repricing
 * 
 * This script creates a user document in Firebase if it doesn't exist,
 * then enables auto-repricing for that user.
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Check for required environment variables
const requiredVars = {
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID': process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  'FIREBASE_CLIENT_EMAIL': process.env.FIREBASE_CLIENT_EMAIL,
  'FIREBASE_PRIVATE_KEY': process.env.FIREBASE_PRIVATE_KEY
};

const missingVars = Object.entries(requiredVars)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error('\n❌ Missing required environment variables in .env.local:\n');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Add them to your .env.local file.\n');
  process.exit(1);
}

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

async function createUserAndEnableRepricing() {
  console.log('\n🤖 Auto-Repricing Setup\n');
  console.log('This will create your user account and enable automated repricing.\n');

  // Get user email
  const email = await question('Enter your email address: ');
  
  // Check if user exists
  let usersSnapshot = await db.collection('users')
    .where('email', '==', email.trim())
    .limit(1)
    .get();

  let userId;
  let userDoc;

  if (usersSnapshot.empty) {
    console.log('\n📝 User not found. Creating new user account...\n');
    
    // Get display name
    const displayName = await question('Enter your display name (optional, press Enter to skip): ');
    
    // Create new user document
    const newUserRef = db.collection('users').doc();
    userId = newUserRef.id;
    
    const userData = {
      email: email.trim(),
      displayName: displayName.trim() || email.split('@')[0],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stockxAutoRepricingEnabled: false
    };
    
    await newUserRef.set(userData);
    console.log(`✅ Created user account: ${userId}\n`);
    
    userDoc = await newUserRef.get();
  } else {
    userDoc = usersSnapshot.docs[0];
    userId = userDoc.id;
    const userData = userDoc.data();
    console.log('\n✅ Found user:', userData.displayName || email);
  }

  const userData = userDoc.data();
  
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
createUserAndEnableRepricing().catch(error => {
  console.error('\n❌ Error:', error.message);
  rl.close();
  process.exit(1);
});

