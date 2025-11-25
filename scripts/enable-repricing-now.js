/**
 * Enable Auto-Repricing (Non-Interactive)
 * 
 * Usage: node scripts/enable-repricing-now.js [strategy]
 * Strategies: competitive, margin, velocity, hybrid
 * Default: competitive
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

async function enableRepricing() {
  // Your user details
  const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
  const email = 'solesmarket23@gmail.com';

  // Get strategy and interval from command line or use defaults
  const strategyArg = process.argv[2] || 'competitive';
  const intervalArg = parseInt(process.argv[3]) || 5; // Default: 5 minutes

  console.log('\n🤖 Auto-Repricing Setup\n');
  console.log('User:', email);
  console.log('User ID:', userId);
  console.log('Strategy:', strategyArg);
  console.log('Interval:', intervalArg + ' minutes');

  // Define strategy configs
  const strategies = {
    competitive: {
      strategy: 'competitive',
      competitiveBuffer: 1,
      maxReduction: 20,
      minProfitMargin: 5,
      enabled: true,
      intervalMinutes: intervalArg
    },
    margin: {
      strategy: 'margin',
      minProfitMargin: 15,
      maxReduction: 15,
      competitiveBuffer: 2,
      enabled: true,
      intervalMinutes: intervalArg
    },
    velocity: {
      strategy: 'velocity',
      maxDaysListed: 30,
      maxReduction: 25,
      minProfitMargin: 5,
      enabled: true,
      intervalMinutes: intervalArg
    },
    hybrid: {
      strategy: 'hybrid',
      competitiveBuffer: 2,
      maxReduction: 15,
      minProfitMargin: 10,
      enabled: true,
      intervalMinutes: intervalArg
    }
  };

  const config = strategies[strategyArg] || strategies.competitive;

  console.log('\n📋 Configuration:');
  console.log('  Strategy:', config.strategy);
  console.log('  Repricing Interval:', config.intervalMinutes + ' minutes');
  console.log('  Competitive Buffer: $' + (config.competitiveBuffer || 'N/A'));
  console.log('  Max Reduction:', config.maxReduction + '%');
  console.log('  Min Profit Margin:', config.minProfitMargin + '%');
  if (config.maxDaysListed) {
    console.log('  Max Days Listed:', config.maxDaysListed + ' days');
  }

  // Check if user document exists
  const userDocRef = db.collection('users').doc(userId);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    console.log('\n📝 Creating Firestore user document...');
    await userDocRef.set({
      email: email,
      displayName: 'Solesmarket23',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stockxAutoRepricingEnabled: false
    });
    console.log('✅ Created user document');
  }

  // Update with repricing config
  await userDocRef.update({
    stockxAutoRepricingEnabled: true,
    stockxAutoRepricingConfig: config,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('\n✅ Auto-repricing enabled successfully!\n');
  console.log('🤖 Your listings will be repriced automatically every ' + intervalArg + ' minutes.\n');
  console.log('📊 View your settings:');
  console.log('   https://console.firebase.google.com/project/flip-flow-4d55c/firestore/data/users/' + userId + '\n');
  console.log('⚙️  To change interval: npm run enable-repricing-now ' + strategyArg + ' [minutes]');
  console.log('⚙️  To disable: npm run disable-repricing\n');

  process.exit(0);
}

// Run the script
enableRepricing().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

