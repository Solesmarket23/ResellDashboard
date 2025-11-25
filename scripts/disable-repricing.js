/**
 * Disable Auto-Repricing
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

async function disableRepricing() {
  const userId = 'pPK6LZ0u8Qcsdxqj21yra3esJ493';
  const email = 'solesmarket23@gmail.com';

  console.log('\n⏸️  Disabling Auto-Repricing\n');
  console.log('User:', email);

  await db.collection('users').doc(userId).update({
    stockxAutoRepricingEnabled: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log('\n✅ Auto-repricing disabled!\n');
  console.log('🔄 To re-enable, run: npm run enable-repricing-now\n');

  process.exit(0);
}

disableRepricing().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});

