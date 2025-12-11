// Test script for real-time purchase updates
// Run this in the browser console on https://www.solesmarket.com/dashboard?section=purchases

console.log('🧪 Starting Real-Time Purchase Update Test...');

// Step 1: Trigger a webhook to create a new purchase
async function testRealtimeUpdates() {
  console.log('\n📬 Step 1: Triggering webhook to create new purchase...');
  
  try {
    const response = await fetch('https://www.solesmarket.com/api/gmail/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          data: btoa(JSON.stringify({
            emailAddress: "solesmarket23@gmail.com",
            historyId: Date.now().toString()
          })),
          messageId: `test-realtime-${Date.now()}`,
          publishTime: new Date().toISOString()
        }
      })
    });

    const result = await response.json();
    console.log('✅ Webhook response:', result);
    
    console.log('\n👀 Expected behavior:');
    console.log('  1. ✨ Toast notification should appear in top-right corner');
    console.log('  2. 📊 Purchase table should update automatically (no refresh needed)');
    console.log('  3. 🟢 New purchases should be highlighted with green glow');
    console.log('  4. ⏱️ Toast should auto-dismiss after 5 seconds with progress bar');
    console.log('  5. 🎨 New rows should have pulsing animation');
    
    console.log('\n📊 Check the purchases table and watch for:');
    console.log('  - Green glowing border on new purchases');
    console.log('  - Animated toast notification');
    console.log('  - Automatic table update');
    
    console.log('\n⏰ Waiting 10 seconds to observe real-time updates...');
    
    setTimeout(() => {
      console.log('\n✅ Test complete! Did you see:');
      console.log('  ☑️ Toast notification appear?');
      console.log('  ☑️ Table update automatically?');
      console.log('  ☑️ Green glow on new purchases?');
      console.log('  ☑️ Smooth animations?');
    }, 10000);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Alternative: Manual test without webhook (for Firebase users)
function manualRealtimeTest() {
  console.log('\n🔧 Manual Test Instructions:');
  console.log('1. Open Firebase Console');
  console.log('2. Go to Firestore Database > purchases collection');
  console.log('3. Click "Add Document"');
  console.log('4. Add these fields:');
  console.log('   - userId: [your user ID from localStorage]');
  console.log('   - orderNumber: TEST-' + Date.now());
  console.log('   - product: { name: "Test Sneaker", brand: "Nike" }');
  console.log('   - price: "$150"');
  console.log('   - status: "Ordered"');
  console.log('   - market: "StockX"');
  console.log('   - type: "gmail"');
  console.log('   - createdAt: ' + new Date().toISOString());
  console.log('5. Save the document');
  console.log('6. Watch the purchases page - should update in real-time!');
}

// Check current setup
console.log('\n🔍 Current Setup Check:');
console.log('  - Site User ID:', localStorage.getItem('siteUserId'));
console.log('  - Current purchases count:', document.querySelectorAll('tbody tr').length);
console.log('  - Page URL:', window.location.href);

console.log('\n▶️ Choose a test method:');
console.log('  1. testRealtimeUpdates()  - Trigger webhook (site password users)');
console.log('  2. manualRealtimeTest()   - Manual Firebase test (Firebase users)');

