// 🔍 EMERGENCY DEBUG SCRIPT - Check Purchase IDs
// Paste this in console on the purchases page

console.clear();
console.log('🔍 CHECKING PURCHASE IDS\n');

// Check what's in state
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 CHECKING TABLE DATA');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Get all table rows
const rows = document.querySelectorAll('tbody tr');
console.log(`Found ${rows.length} rows in table`);

// Check first 3 purchases
console.log('\n📦 FIRST 3 PURCHASES:');
rows.forEach((row, index) => {
  if (index < 3) {
    const purchaseId = row.getAttribute('data-purchase-id');
    const cells = row.querySelectorAll('td');
    const orderNumber = cells[2]?.textContent?.trim(); // Order number column
    console.log(`${index + 1}. data-purchase-id: "${purchaseId}", Order #: "${orderNumber}"`);
  }
});

// Check localStorage
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💾 CHECKING LOCALSTORAGE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const siteUserId = localStorage.getItem('siteUserId');
console.log('Site User ID:', siteUserId);

if (siteUserId) {
  const storageKey = `purchases_${siteUserId}`;
  const purchasesJson = localStorage.getItem(storageKey);
  if (purchasesJson) {
    const purchases = JSON.parse(purchasesJson);
    console.log(`\nFound ${purchases.length} purchases in localStorage`);
    console.log('\nFirst 3 purchases:');
    purchases.slice(0, 3).forEach((p, i) => {
      console.log(`${i + 1}. id: "${p.id}", orderNumber: "${p.orderNumber}"`);
    });
  } else {
    console.log('❌ No purchases in localStorage');
  }
}

// Check API
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔥 CHECKING API');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (siteUserId) {
  fetch(`/api/purchases/list?userId=${siteUserId}`)
    .then(r => r.json())
    .then(data => {
      console.log(`\n✅ API returned ${data.purchases?.length || 0} purchases`);
      if (data.purchases && data.purchases.length > 0) {
        console.log('\nFirst 3 from API:');
        data.purchases.slice(0, 3).forEach((p, i) => {
          console.log(`${i + 1}. id: "${p.id}", orderNumber: "${p.orderNumber}"`);
        });
        
        // Check if IDs are order numbers or Firebase IDs
        const firstId = data.purchases[0].id;
        const isOrderNumber = firstId?.startsWith('03-');
        console.log(`\n${isOrderNumber ? '❌ PROBLEM' : '✅ GOOD'}: First ID ${isOrderNumber ? 'IS' : 'is NOT'} an order number`);
        console.log(`Example ID: "${firstId}"`);
      }
    })
    .catch(err => console.error('❌ API Error:', err));
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('⏰ Waiting for API response...');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

