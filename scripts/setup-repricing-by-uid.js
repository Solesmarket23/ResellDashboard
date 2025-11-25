/**
 * Setup Auto-Repricing by User UID
 * 
 * This script creates/updates a user document in Firestore using the UID from Firebase Auth.
 */

const admin = require('firebase-admin');
const readline = require('readline');

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
const auth = admin.auth();

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupRepricing() {
  console.log('\n🤖 Auto-Repricing Setup\n');

  // Hardcoded for solesmarket23@gmail.com
  const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
  const email = 'solesmarket23@gmail.com';

  console.log('Setting up for:');
  console.log('  Email:', email);
  console.log('  User ID:', userId);

  // Check if user document exists in Firestore
  const userDocRef = db.collection('users').doc(userId);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.log('\n📝 Creating Firestore user document...\n');
    
    // Get user from Auth to get display name
    let displayName = 'Solesmarket23';
    try {
      const authUser = await auth.getUser(userId);
      displayName = authUser.displayName || authUser.email.split('@')[0];
    } catch (error) {
      console.log('Could not fetch auth user, using default name');
    }

    await userDocRef.set({
      email: email,
      displayName: displayName,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stockxAutoRepricingEnabled: false
    });
    
    console.log('✅ Created Firestore user document\n');
  } else {
    console.log('\n✅ Found existing Firestore user document\n');
    const userData = userDoc.data();
    console.log('  Display Name:', userData.displayName || 'Not set');
    console.log('  Auto-Repricing:', userData.stockxAutoRepricingEnabled ? 'Enabled' : 'Disabled');
  }

  console.log('\n🎯 Choose Your Repricing Strategy:\n');
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

  let config = {};

  switch(strategyChoice.trim()) {
    case '1':
      config = {
        strategy: 'competitive',
        competitiveBuffer: 1,
        maxReduction: 20,
        minProfitMargin: 5,
        enabled: true
      };
      break;
    case '2':
      config = {
        strategy: 'margin',
        minProfitMargin: 15,
        maxReduction: 15,
        competitiveBuffer: 2,
        enabled: true
      };
      break;
    case '3':
      config = {
        strategy: 'velocity',
        maxDaysListed: 30,
        maxReduction: 25,
        minProfitMargin: 5,
        enabled: true
      };
      break;
    case '4':
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
  console.log('  Competitive Buffer: $' + (config.competitiveBuffer || 'N/A'));
  console.log('  Max Reduction:', config.maxReduction + '%');
  console.log('  Min Profit Margin:', config.minProfitMargin + '%');
  if (config.maxDaysListed) {
    console.log('  Max Days Listed:', config.maxDaysListed + ' days');
  }

  const confirm = await question('\n✅ Enable auto-repricing with these settings? (yes/no): ');

  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Cancelled. No changes made.\n');
    rl.close();
    return;
  }

  // Update Firestore
  await userDocRef.update({
    stockxAutoRepricingEnabled: true,
    stockxAutoRepricingConfig: config,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('\n✅ Auto-repricing enabled successfully!\n');
  console.log('🤖 Your listings will now be repriced automatically every 5 minutes.\n');
  console.log('📊 View your settings:');
  console.log('   https://console.firebase.google.com/project/flip-flow-4d55c/firestore/data/users/' + userId + '\n');
  console.log('⚙️  To disable: Set stockxAutoRepricingEnabled to false in Firebase Console\n');

  rl.close();
}

// Run the script
setupRepricing().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error);
  rl.close();
  process.exit(1);
});

