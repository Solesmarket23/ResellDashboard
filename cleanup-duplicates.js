// Run this in browser console to clean up duplicate purchases
const userId = localStorage.getItem('siteUserId');

fetch(`/api/purchases/list?userId=${userId}`)
  .then(r => r.json())
  .then(data => {
    console.log(`📊 Found ${data.purchases.length} total purchases`);
    
    // Group by order number
    const grouped = {};
    data.purchases.forEach(p => {
      if (!grouped[p.orderNumber]) {
        grouped[p.orderNumber] = [];
      }
      grouped[p.orderNumber].push(p);
    });
    
    // Find duplicates
    let duplicateCount = 0;
    Object.entries(grouped).forEach(([orderNum, purchases]) => {
      if (purchases.length > 1) {
        console.log(`🔄 Order ${orderNum} has ${purchases.length} copies`);
        duplicateCount += purchases.length - 1;
      }
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`   Total purchases: ${data.purchases.length}`);
    console.log(`   Unique orders: ${Object.keys(grouped).length}`);
    console.log(`   Duplicates to remove: ${duplicateCount}`);
    console.log(`\n💡 To clean up, we need to create a cleanup API endpoint`);
  });
