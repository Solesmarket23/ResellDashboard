// 🔍 DEBUGGING SCRIPT - Real-Time Purchase Updates
// Copy/paste this entire script into your browser console

console.clear();
console.log('🔍 DEBUGGING REAL-TIME PURCHASE UPDATES\n');

// Step 1: Check user authentication
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 STEP 1: USER AUTHENTICATION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const siteUserId = localStorage.getItem('siteUserId');
const hasFirebaseUser = typeof user !== 'undefined' && user;

console.log('Site User ID:', siteUserId || '❌ NOT FOUND');
console.log('Firebase User:', hasFirebaseUser ? '✅ YES' : '❌ NO');
console.log('User Type:', !hasFirebaseUser && siteUserId ? 'Site Password User (Polling)' : hasFirebaseUser ? 'Firebase User (Real-time)' : '❌ NO AUTH');

// Step 2: Check current purchases
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 STEP 2: CURRENT PURCHASES');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const purchasesInTable = document.querySelectorAll('tbody tr').length;
console.log('Purchases in table:', purchasesInTable);
console.log('URL:', window.location.href);

// Step 3: Check if real-time listener is active
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔴 STEP 3: REAL-TIME LISTENER STATUS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Look for listener logs in console history
console.log('Check console above for:');
console.log('  - "🔴 Setting up real-time listener..." (Firebase users)');
console.log('  - "⏰ Setting up polling..." (Site password users)');
console.log('  - "✅ Real-time listener active" or "✅ Polling active"');

// Step 4: Test Firebase connection
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔥 STEP 4: FIREBASE API TEST');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const userId = siteUserId;
if (userId) {
  console.log('Testing /api/purchases/list...');
  fetch(`/api/purchases/list?userId=${userId}`)
    .then(r => {
      console.log('API Response Status:', r.status);
      return r.json();
    })
    .then(data => {
      console.log('✅ API working! Purchases found:', data.purchases?.length || 0);
      if (data.purchases && data.purchases.length > 0) {
        console.log('Sample purchase:', data.purchases[0]);
      }
    })
    .catch(err => {
      console.error('❌ API Error:', err);
    });
} else {
  console.log('❌ No user ID - skipping API test');
}

// Step 5: Manual trigger test
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 STEP 5: MANUAL TEST OPTIONS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log('\n📝 OPTION A: Add test purchase to Firebase manually');
console.log('1. Open: https://console.firebase.google.com/project/flip-flow-4d55c/firestore');
console.log('2. Go to "purchases" collection');
console.log('3. Click "Add Document"');
console.log('4. Copy these fields:');
console.log(`
{
  userId: "${userId || 'YOUR-USER-ID'}",
  orderNumber: "03-TEST-${Date.now()}",
  product: {
    name: "Test Nike Air Jordan 1",
    brand: "Nike"
  },
  price: "$180",
  status: "Ordered",
  market: "StockX",
  type: "gmail",
  createdAt: "${new Date().toISOString()}",
  syncedAt: "${new Date().toISOString()}"
}
`);
console.log('5. Click "Save"');
console.log('6. Watch this page for toast notification!\n');

console.log('📝 OPTION B: Trigger webhook (production only)');
if (window.location.hostname === 'www.solesmarket.com' || window.location.hostname === 'solesmarket.com') {
  console.log('✅ You are on production - webhook will work!');
  console.log('\nRun this command:');
  console.log(`
fetch('https://www.solesmarket.com/api/gmail/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: {
      data: btoa(JSON.stringify({
        emailAddress: "solesmarket23@gmail.com",
        historyId: "${Date.now()}"
      })),
      messageId: "test-${Date.now()}",
      publishTime: "${new Date().toISOString()}"
    }
  })
}).then(r => r.json()).then(result => {
  console.log('✅ Webhook result:', result);
  console.log('⏰ Wait 5-10 seconds and watch for toast notification...');
});
  `);
} else {
  console.log('❌ You are on localhost - webhook will NOT work here');
  console.log('Use OPTION A (Manual Firebase) instead');
}

// Step 6: Check for errors
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⚠️  STEP 6: CHECK FOR ERRORS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

console.log('Look for red error messages in console above');
console.log('Common issues:');
console.log('  - "Firebase not initialized"');
console.log('  - "Missing or insufficient permissions"');
console.log('  - "Failed to fetch"');
console.log('  - "Quota exceeded"');

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ DEBUGGING COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\nℹ️  Next: Try OPTION A or OPTION B above to test');
