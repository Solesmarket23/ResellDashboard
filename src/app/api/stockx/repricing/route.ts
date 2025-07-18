import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

interface RepricingStrategy {
  type: 'competitive' | 'margin_based' | 'velocity_based' | 'hybrid';
  settings: {
    minProfitMargin?: number;
    maxPriceReduction?: number;
    competitiveBuffer?: number;
    velocityThreshold?: number;
    maxDaysListed?: number;
    aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  };
}

interface ListingToReprice {
  listingId: string;
  productId: string;
  variantId: string;
  currentPrice: number;
  originalPrice: number;
  costBasis: number;
  daysListed: number;
  views: number;
  saves: number;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const accessToken = cookieStore.get('stockx_access_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 401 });
    }

    const { 
      listings, 
      strategy, 
      dryRun = true,
      notificationEmail 
    }: {
      listings: ListingToReprice[];
      strategy: RepricingStrategy;
      dryRun?: boolean;
      notificationEmail?: string;
    } = await request.json();

    console.log(`🔄 Starting repricing for ${listings.length} listings (dry run: ${dryRun})`);

    const repricingResults = [];
    const errors = [];

    for (const listing of listings) {
      try {
        // Get current market data
        const marketData = await fetchMarketData(listing.productId, listing.variantId, accessToken);
        
        if (!marketData) {
          errors.push(`No market data for listing ${listing.listingId}`);
          continue;
        }

        // Calculate new price based on strategy
        const newPrice = calculateNewPrice(listing, marketData, strategy);
        
        if (!newPrice || newPrice === listing.currentPrice) {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: listing.currentPrice,
            action: 'no_change',
            reason: 'Price already optimal'
          });
          continue;
        }

        // Apply safety checks
        const safetyCheck = performSafetyChecks(listing, newPrice, strategy);
        if (!safetyCheck.passed) {
          errors.push(`Safety check failed for ${listing.listingId}: ${safetyCheck.reason}`);
          continue;
        }

        // Execute repricing if not dry run
        if (!dryRun) {
          const updateResult = await updateListingPrice(listing.listingId, newPrice, accessToken);
          
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: newPrice,
            action: updateResult.success ? 'updated' : 'failed',
            reason: updateResult.success ? 'Price updated successfully' : updateResult.error,
            profitChange: calculateProfitChange(listing, newPrice),
            competitivePosition: analyzeCompetitivePosition(newPrice, marketData)
          });
        } else {
          repricingResults.push({
            listingId: listing.listingId,
            currentPrice: listing.currentPrice,
            newPrice: newPrice,
            action: 'would_update',
            reason: 'Dry run - would update price',
            profitChange: calculateProfitChange(listing, newPrice),
            competitivePosition: analyzeCompetitivePosition(newPrice, marketData)
          });
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`Error processing listing ${listing.listingId}:`, error);
        errors.push(`Error processing ${listing.listingId}: ${error.message}`);
      }
    }

    // Send notification if email provided
    if (notificationEmail && repricingResults.length > 0) {
      await sendRepricingNotification(notificationEmail, repricingResults, strategy, dryRun);
    }

    return NextResponse.json({
      success: true,
      results: repricingResults,
      errors: errors,
      summary: {
        totalListings: listings.length,
        updated: repricingResults.filter(r => r.action === 'updated').length,
        noChange: repricingResults.filter(r => r.action === 'no_change').length,
        errors: errors.length,
        dryRun: dryRun
      }
    });

  } catch (error) {
    console.error('Repricing error:', error);
    return NextResponse.json({ 
      error: 'Failed to process repricing', 
      details: error.message 
    }, { status: 500 });
  }
}

async function fetchMarketData(productId: string, variantId: string, accessToken: string) {
  const response = await fetch(`https://api.stockx.com/v2/catalog/products/${productId}/market-data`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': process.env.STOCKX_CLIENT_ID || '',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Market data fetch failed: ${response.status}`);
  }

  const data = await response.json();
  // The market data endpoint returns an object with a 'variants' array
  const variants = data.variants || data;
  return Array.isArray(variants) ? variants.find(item => item.variantId === variantId) : null;
}

function calculateNewPrice(listing: ListingToReprice, marketData: any, strategy: RepricingStrategy) {
  const { lowestAskAmount, highestBidAmount } = marketData;
  // Convert from cents to dollars
  const currentLowestAsk = parseInt(lowestAskAmount) / 100;
  const currentHighestBid = parseInt(highestBidAmount) / 100;

  switch (strategy.type) {
    case 'competitive':
      return calculateCompetitivePrice(listing, currentLowestAsk, strategy.settings);
    
    case 'margin_based':
      return calculateMarginBasedPrice(listing, currentLowestAsk, currentHighestBid, strategy.settings);
    
    case 'velocity_based':
      return calculateVelocityBasedPrice(listing, currentLowestAsk, strategy.settings);
    
    case 'hybrid':
      return calculateHybridPrice(listing, currentLowestAsk, currentHighestBid, strategy.settings);
    
    default:
      return listing.currentPrice;
  }
}

function calculateCompetitivePrice(listing: ListingToReprice, lowestAsk: number, settings: any) {
  const buffer = settings.competitiveBuffer || 1;
  const proposedPrice = Math.max(lowestAsk - buffer, listing.costBasis * 1.1);
  
  return Math.min(proposedPrice, listing.currentPrice * 0.95); // Max 5% reduction
}

function calculateMarginBasedPrice(listing: ListingToReprice, lowestAsk: number, highestBid: number, settings: any) {
  const minMargin = settings.minProfitMargin || 0.15;
  const minPrice = listing.costBasis * (1 + minMargin);
  
  return Math.max(Math.min(lowestAsk - 1, listing.currentPrice * 0.9), minPrice);
}

function calculateVelocityBasedPrice(listing: ListingToReprice, lowestAsk: number, settings: any) {
  const maxDays = settings.maxDaysListed || 30;
  const aggressiveness = settings.aggressiveness || 'moderate';
  
  let reductionFactor = 1;
  
  if (listing.daysListed > maxDays) {
    switch (aggressiveness) {
      case 'conservative':
        reductionFactor = 0.98;
        break;
      case 'moderate':
        reductionFactor = 0.95;
        break;
      case 'aggressive':
        reductionFactor = 0.90;
        break;
    }
  }
  
  return Math.max(listing.currentPrice * reductionFactor, listing.costBasis * 1.05);
}

function calculateHybridPrice(listing: ListingToReprice, lowestAsk: number, highestBid: number, settings: any) {
  const competitive = calculateCompetitivePrice(listing, lowestAsk, settings);
  const margin = calculateMarginBasedPrice(listing, lowestAsk, highestBid, settings);
  const velocity = calculateVelocityBasedPrice(listing, lowestAsk, settings);
  
  // Weighted average based on listing performance
  const weights = {
    competitive: 0.5,
    margin: 0.3,
    velocity: 0.2
  };
  
  return Math.round(
    competitive * weights.competitive +
    margin * weights.margin +
    velocity * weights.velocity
  );
}

function performSafetyChecks(listing: ListingToReprice, newPrice: number, strategy: RepricingStrategy) {
  const maxReduction = strategy.settings.maxPriceReduction || 0.20;
  const minPrice = listing.costBasis * 1.05; // Minimum 5% profit
  
  // Check maximum price reduction
  const reductionPercent = (listing.currentPrice - newPrice) / listing.currentPrice;
  if (reductionPercent > maxReduction) {
    return {
      passed: false,
      reason: `Price reduction (${(reductionPercent * 100).toFixed(1)}%) exceeds maximum (${(maxReduction * 100).toFixed(1)}%)`
    };
  }
  
  // Check minimum price
  if (newPrice < minPrice) {
    return {
      passed: false,
      reason: `New price $${newPrice} below minimum profitable price $${minPrice.toFixed(2)}`
    };
  }
  
  return { passed: true };
}

async function updateListingPrice(listingId: string, newPrice: number, accessToken: string) {
  try {
    const response = await fetch(`https://api.stockx.com/v2/selling/listings/${listingId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': process.env.STOCKX_CLIENT_ID || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: String(newPrice), // Use 'amount' and ensure it's a string
        currencyCode: 'USD' // Add currency code
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Update failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return { success: true, operation: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function calculateProfitChange(listing: ListingToReprice, newPrice: number) {
  const currentProfit = listing.currentPrice - listing.costBasis;
  const newProfit = newPrice - listing.costBasis;
  return newProfit - currentProfit;
}

function analyzeCompetitivePosition(price: number, marketData: any) {
  // Convert from cents to dollars
  const lowestAsk = parseInt(marketData.lowestAskAmount) / 100;
  const highestBid = parseInt(marketData.highestBidAmount) / 100;
  
  if (price <= lowestAsk) {
    return 'lowest_ask';
  } else if (price <= lowestAsk + 5) {
    return 'competitive';
  } else if (price <= highestBid * 1.1) {
    return 'market_price';
  } else {
    return 'premium';
  }
}

async function sendRepricingNotification(email: string, results: any[], strategy: RepricingStrategy, dryRun: boolean) {
  // Implementation for sending email notifications
  // This would integrate with your email service
  console.log(`📧 Sending repricing notification to ${email}`);
  console.log(`Strategy: ${strategy.type}, Results: ${results.length}, Dry Run: ${dryRun}`);
} 