// Run this in browser console to clean up localStorage carrier values
// Copy and paste this entire code into the browser console at http://localhost:3000

const siteUserId = localStorage.getItem('siteUserId');
if (siteUserId) {
  const key = `purchases_${siteUserId}`;
  const purchases = JSON.parse(localStorage.getItem(key) || '[]');
  console.log(`📦 Found ${purchases.length} purchases in localStorage`);
  
  let fixedCount = 0;
  const fixed = purchases.map(p => {
    const hasInvalidCarrier = p.carrier && (
      p.carrier.toLowerCase().includes('stockx') || 
      p.carrier === 'StockX Logistics' ||
      p.carrier.toLowerCase() === 'stockx'
    );
    
    if (hasInvalidCarrier) {
      console.log(`🔧 Fixing purchase ${p.orderNumber}: carrier "${p.carrier}" -> null`);
      fixedCount++;
      return { ...p, carrier: null };
    }
    
    // If no tracking but has carrier, remove carrier
    if (!p.tracking || p.tracking.trim() === '') {
      if (p.carrier) {
        console.log(`🔧 Fixing purchase ${p.orderNumber}: no tracking but has carrier "${p.carrier}" -> null`);
        fixedCount++;
        return { ...p, carrier: null };
      }
    }
    
    return p;
  });
  
  if (fixedCount > 0) {
    localStorage.setItem(key, JSON.stringify(fixed));
    console.log(`✅ Fixed ${fixedCount} purchases with invalid carriers`);
    console.log('🔄 Reload the page to see changes');
    alert(`Fixed ${fixedCount} purchases. Reload the page now.`);
  } else {
    console.log('✅ No purchases needed fixing - all carriers are valid or null');
  }
} else {
  console.log('❌ No siteUserId found in localStorage');
}

