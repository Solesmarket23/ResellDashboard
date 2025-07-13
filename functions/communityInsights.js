const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Run monthly on the 1st at 2 AM
exports.calculateMonthlyAggregates = functions.pubsub
  .schedule('0 2 1 * *')
  .timeZone('America/Los_Angeles')
  .onRun(async (context) => {
    const db = admin.firestore();
    
    // Get current and previous month
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    
    try {
      // Calculate aggregates for last month (complete data)
      await calculateAggregatesForMonth(db, lastMonthKey);
      
      // Also calculate for current month (partial data)
      await calculateAggregatesForMonth(db, currentMonth);
      
      console.log('Successfully calculated monthly aggregates');
    } catch (error) {
      console.error('Error calculating monthly aggregates:', error);
      throw error;
    }
  });

async function calculateAggregatesForMonth(db, monthKey) {
  const contributionsRef = db.collection('communityMetrics')
    .doc('userContributions')
    .collection(monthKey);
  
  const snapshot = await contributionsRef.get();
  
  if (snapshot.size < 10) {
    console.log(`Not enough users for aggregation in ${monthKey} (minimum 10 required, found ${snapshot.size})`);
    return;
  }
  
  const failureRates = [];
  let totalFailures = 0;
  let totalSales = 0;
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.failureRate !== undefined) {
      failureRates.push(data.failureRate);
    }
    totalFailures += data.failureCount || 0;
    totalSales += data.totalSales || 0;
  });
  
  // Sort for percentile calculation
  failureRates.sort((a, b) => a - b);
  
  // Calculate statistics
  const avgFailureRate = totalSales > 0 ? (totalFailures / totalSales) * 100 : 0;
  const medianRate = failureRates[Math.floor(failureRates.length / 2)] || 0;
  
  const percentiles = {
    '25th': failureRates[Math.floor(failureRates.length * 0.25)] || 0,
    '50th': medianRate,
    '75th': failureRates[Math.floor(failureRates.length * 0.75)] || 0
  };
  
  // Save aggregates
  await db.collection('communityMetrics')
    .doc('aggregates')
    .collection('monthly')
    .doc(monthKey)
    .set({
      totalUsers: snapshot.size,
      avgFailureRate,
      medianFailureRate: medianRate,
      percentiles,
      totalFailures,
      totalSales,
      lastCalculated: admin.firestore.FieldValue.serverTimestamp()
    });
  
  console.log(`Calculated aggregates for ${monthKey}: ${snapshot.size} users`);
}

// Also provide an HTTP function to manually trigger aggregation (for testing)
exports.manualCalculateAggregates = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  
  const { monthKey } = req.body;
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    res.status(400).send('Invalid monthKey format. Use YYYY-MM');
    return;
  }
  
  const db = admin.firestore();
  
  try {
    await calculateAggregatesForMonth(db, monthKey);
    res.status(200).json({ success: true, message: `Aggregates calculated for ${monthKey}` });
  } catch (error) {
    console.error('Error calculating aggregates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});