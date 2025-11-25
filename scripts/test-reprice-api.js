#!/usr/bin/env node

/**
 * Test the repricing API directly with a specific listing
 */

const testListingData = {
  listings: [
    {
      listingId: '279771c7-5fe9-4049-b959-7c7c9806be97',
      productId: 'bfb38d19-0e0f-4a96-8c1d-01e8ab9a7caf',
      variantId: 'cde50b88-4f20-45d8-bb83-a1f7f1b6a8a3',
      currentPrice: 100,
      lowestAsk: 80,
      highestBid: 70,
      pricingStrategy: {
        type: 'match_lowest',
        value: 1
      },
      minPrice: 75,
      maxPrice: 100
    }
  ],
  strategy: {
    type: 'competitive',
    settings: {
      minProfitMargin: 5,
      maxPriceReduction: 20,
      competitiveBuffer: 1,
      aggressiveness: 'moderate'
    }
  },
  dryRun: true,
  useIndividualStrategies: true
};

async function testRepriceAPI() {
  const url = 'https://www.solesmarket.com/api/stockx/repricing';
  
  console.log('🧪 Testing repricing API...');
  console.log('📤 Sending:', JSON.stringify(testListingData, null, 2));
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In production, this would need actual StockX tokens
        // For now we're just testing the logic
      },
      body: JSON.stringify(testListingData)
    });
    
    const data = await response.json();
    console.log('\n📥 Response:', JSON.stringify(data, null, 2));
    
    if (data.success) {
      console.log('\n✅ Test completed successfully');
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        console.log(`\n💰 Price calculation:`);
        console.log(`   Current: $${result.currentPrice}`);
        console.log(`   New: $${result.newPrice}`);
        console.log(`   Action: ${result.action}`);
        console.log(`   Reason: ${result.reason || 'N/A'}`);
      }
    } else {
      console.log('\n❌ Test failed:', data.error);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testRepriceAPI();

