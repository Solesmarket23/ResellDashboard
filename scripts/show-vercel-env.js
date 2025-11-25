/**
 * Show Vercel Environment Variables
 * 
 * This script displays the exact environment variables you need to add to Vercel
 * for Firebase Admin and Cron jobs to work.
 */

require('dotenv').config({ path: '.env.local' });

console.log('\n📋 Vercel Environment Variables\n');
console.log('Copy these EXACT values to Vercel Dashboard → Settings → Environment Variables\n');
console.log('=' .repeat(80));

// Firebase Admin Credentials
console.log('\n🔥 Firebase Admin Credentials:\n');

console.log('1. NEXT_PUBLIC_FIREBASE_PROJECT_ID');
console.log('   Value:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '❌ NOT SET');
console.log('');

console.log('2. FIREBASE_CLIENT_EMAIL');
console.log('   Value:', process.env.FIREBASE_CLIENT_EMAIL || '❌ NOT SET');
console.log('');

console.log('3. FIREBASE_PRIVATE_KEY');
if (process.env.FIREBASE_PRIVATE_KEY) {
  // Show first 50 chars to verify it exists
  const key = process.env.FIREBASE_PRIVATE_KEY;
  console.log('   Value: (Copy the ENTIRE key from .env.local)');
  console.log('   First 50 chars:', key.substring(0, 50) + '...');
  console.log('   Length:', key.length, 'characters');
  console.log('');
  console.log('   ⚠️  IMPORTANT: In Vercel, paste the key WITH the \\n characters');
  console.log('   Example: "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"');
} else {
  console.log('   Value: ❌ NOT SET');
}
console.log('');

// Cron Secret
console.log('\n🔒 Cron Secret:\n');
console.log('4. CRON_SECRET');
if (process.env.CRON_SECRET) {
  console.log('   Value:', process.env.CRON_SECRET);
} else {
  console.log('   Value: ❌ NOT SET');
  console.log('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
console.log('');

// StockX API Key
console.log('\n📦 StockX API:\n');
console.log('5. STOCKX_API_KEY');
console.log('   Value:', process.env.STOCKX_API_KEY || '❌ NOT SET');
console.log('');

// App URL
console.log('\n🌐 App URL:\n');
console.log('6. NEXT_PUBLIC_APP_URL');
console.log('   Value:', process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.vercel.app');
console.log('');

console.log('=' .repeat(80));
console.log('\n📝 Instructions:\n');
console.log('1. Go to: https://vercel.com/dashboard');
console.log('2. Select your project');
console.log('3. Go to: Settings → Environment Variables');
console.log('4. Add each variable above');
console.log('5. Select: Production, Preview, Development');
console.log('6. Click "Save"');
console.log('7. Redeploy your app\n');

console.log('⚠️  CRITICAL: For FIREBASE_PRIVATE_KEY:');
console.log('   - Copy the ENTIRE value from .env.local');
console.log('   - Include the quotes');
console.log('   - Keep the \\n characters (don\'t replace with actual newlines)');
console.log('   - Example format: "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n"\n');

// Check if all required vars are set
const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL', 
  'FIREBASE_PRIVATE_KEY',
  'CRON_SECRET',
  'STOCKX_API_KEY'
];

const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.log('❌ Missing variables in .env.local:', missing.join(', '));
  console.log('   Add these to .env.local first, then run this script again.\n');
} else {
  console.log('✅ All required variables are set in .env.local');
  console.log('   Copy them to Vercel as shown above.\n');
}

