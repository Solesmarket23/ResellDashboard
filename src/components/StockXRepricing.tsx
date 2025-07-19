'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { DollarSign, TrendingDown, Target, Zap, RefreshCw, AlertTriangle, CheckCircle, Loader, Package } from 'lucide-react';

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

interface Listing {
  listingId: string;
  productId: string;
  variantId: string;
  productName: string;
  size: string;
  currentPrice: number;
  originalPrice: number;
  styleId?: string;
  colorway?: string;
  brand?: string;
  condition?: string;
  status?: string;
  createdAt?: string;
  retailPrice?: number;
  lowestAsk?: number;
  highestBid?: number;
  lastSale?: number;
  category?: string;
  inventoryType?: string;
  selected: boolean;
}

interface RepricingResult {
  listingId: string;
  currentPrice: number;
  newPrice: number;
  action: string;
  reason: string;
  profitChange: number;
  competitivePosition: string;
}

export default function StockXRepricing() {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  
  // Debug theme detection
  useEffect(() => {
    console.log('StockX Repricing Theme:', currentTheme.name, 'isNeon:', isNeon);
  }, [currentTheme, isNeon]);
  
  const [listings, setListings] = useState<Listing[]>([]);
  const [strategy, setStrategy] = useState<RepricingStrategy>({
    type: 'competitive',
    settings: {
      minProfitMargin: 0.15,
      maxPriceReduction: 0.20,
      competitiveBuffer: 1,
      maxDaysListed: 30,
      aggressiveness: 'moderate'
    }
  });
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RepricingResult[]>([]);
  const [dryRun, setDryRun] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [authenticated, setAuthenticated] = useState(true); // Assume authenticated initially
  const [authError, setAuthError] = useState(false);
  const [listingStats, setListingStats] = useState<{
    rawCount?: number;
    trueDuplicatesRemoved?: number;
    investigation?: {
      productSizeGroupsWithMultiples: number;
      totalPotentialDuplicates: number;
      trueDuplicateGroups: number;
      message: string;
    };
  }>({});
  const [lastFetchTime, setLastFetchTime] = useState<Date | null>(null);

  useEffect(() => {
    // Check if we're returning from authentication
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('authenticated') === 'true') {
      // Remove the parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchListings();
  }, []);

  const fetchListings = async (forceReload = false) => {
    console.log(`🔄 Fetching listings... (forceReload: ${forceReload})`);
    setLoading(true);
    setAuthError(false);
    // Clear existing listings before fetching
    setListings([]);
    setListingStats({});
    
    try {
      // Add cache-busting timestamp to ensure fresh data
      const url = `/api/stockx/listings?t=${Date.now()}&force=${forceReload}`;
      console.log(`📍 Fetching from: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      // Check if authentication failed
      if (response.status === 401 || response.status === 403) {
        setAuthenticated(false);
        setAuthError(true);
        setListings([]);
        return;
      }
      
      const data = await response.json();
      
      // Always log the raw response to see what we're getting
      console.log('📦 Raw API Response:', data);
      console.log('📊 Listings count:', data.listings?.length);
      console.log('🔍 Has debugInfo?', !!data.debugInfo);
      console.log('⏰ Fetched at:', new Date().toISOString());
      
      // Log debug information to browser console
      if (data.debugInfo) {
        console.log('🔍 === StockX Listing Debug Info ===');
        console.log('API Response:', data.debugInfo.apiResponse);
        console.log('Filtering Steps:', data.debugInfo.filtering);
        
        // Log filtering math check
        if (data.debugInfo.filtering.mathCheck) {
          console.log('\n📐 Filtering Math Check:');
          console.log(`  Total from API: ${data.debugInfo.filtering.mathCheck.totalFromAPI}`);
          console.log(`  - Expired listings: ${data.debugInfo.filtering.mathCheck.expiredListings}`);
          console.log(`  - With orders: ${data.debugInfo.filtering.mathCheck.listingsWithOrders}`);
          console.log(`  = Should have: ${data.debugInfo.filtering.mathCheck.calculated}`);
          console.log(`  Actually have: ${data.debugInfo.filtering.mathCheck.actual}`);
        }
        
        // Log suspicious listings
        if (data.debugInfo.filtering.suspiciousListings && data.debugInfo.filtering.suspiciousListings.length > 0) {
          console.log('\n🚨 Suspicious Listings (expired but showing):');
          data.debugInfo.filtering.suspiciousListings.forEach((listing: any, index: number) => {
            console.log(`  ${index + 1}. ${listing.productName} - Size ${listing.size}`);
            console.log(`     Expired: ${listing.expiredAt}`);
            console.log(`     Current: ${listing.currentTime}`);
          });
        }
        
        console.log('\nDiscrepancy Analysis:', data.debugInfo.discrepancy);
        
        if (data.debugInfo.discrepancy.difference !== 0) {
          console.warn(`⚠️ Showing ${data.debugInfo.discrepancy.showing} listings but expected ${data.debugInfo.discrepancy.expected}`);
          console.warn('Possible reasons:', data.debugInfo.discrepancy.possibleReasons);
          if (data.debugInfo.discrepancy.inventoryTypes) {
            console.log('Inventory Types:', data.debugInfo.discrepancy.inventoryTypes);
          }
        }
      }
      
      if (data.success && data.listings && Array.isArray(data.listings)) {
        setAuthenticated(true); // User is authenticated if we got listings
        const enrichedListings = data.listings.map((listing: any) => ({
          ...listing,
          selected: false
        }));
        setListings(enrichedListings);
        setLastFetchTime(new Date());
        
        // Store listing stats if available
        if (data.rawCount !== undefined || data.trueDuplicatesRemoved !== undefined || data.investigation) {
          setListingStats({
            rawCount: data.rawCount,
            trueDuplicatesRemoved: data.trueDuplicatesRemoved,
            investigation: data.investigation
          });
        }
      } else if (data.error && data.error.includes('token')) {
        // Token related error
        setAuthenticated(false);
        setAuthError(true);
        setListings([]);
      } else {
        console.log('No listings found or invalid response:', data);
        setListings([]);
      }
    } catch (error) {
      console.error('❌ Failed to fetch listings:', error);
      setListings([]);
      setLastFetchTime(new Date());
    } finally {
      setLoading(false);
      console.log(`✅ Fetch complete at ${new Date().toISOString()}`);
    }
  };

  const toggleListingSelection = (listingId: string) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, selected: !listing.selected }
        : listing
    ));
  };

  const selectAll = () => {
    const allSelected = listings.every(listing => listing.selected);
    setListings(prev => prev.map(listing => ({ ...listing, selected: !allSelected })));
  };

  const selectedCount = listings.filter(l => l.selected).length;
  const isAllSelected = listings.length > 0 && selectedCount === listings.length;
  const isPartiallySelected = selectedCount > 0 && selectedCount < listings.length;

  const applyPricingRule = async (rule: string, value: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      // Calculate new prices based on rule
      const updates = selectedListings.map(listing => {
        let newPrice = listing.currentPrice;
        
        if (rule === 'beat_lowest') {
          newPrice = (listing.lowestAsk || listing.currentPrice) - value;
        } else if (rule === 'match_lowest') {
          newPrice = listing.lowestAsk || listing.currentPrice;
        } else if (rule === 'percentage') {
          const marketPrice = listing.lowestAsk || listing.currentPrice;
          newPrice = marketPrice * (1 - value / 100);
        }
        
        // Round to nearest dollar
        newPrice = Math.round(newPrice);
        
        return {
          listingId: listing.listingId,
          currentPrice: listing.currentPrice,
          newPrice,
          marketPrice: listing.lowestAsk || 0
        };
      });

      // Update prices via API
      const response = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: updates.map(u => u.listingId),
          updates // Send all update details
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully updated ${updates.length} listing${updates.length > 1 ? 's' : ''}`);
        // Refresh listings to show new prices
        await fetchListings();
      } else {
        alert(`Failed to update prices: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Pricing rule error:', error);
      alert('Failed to apply pricing rule');
    } finally {
      setLoading(false);
    }
  };

  const applyCustomRule = async (type: string, amount: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      // Calculate new prices based on custom rule
      const updates = selectedListings.map(listing => {
        let newPrice = listing.currentPrice;
        const marketPrice = listing.lowestAsk || listing.currentPrice;
        
        switch (type) {
          case 'below_dollar':
            newPrice = marketPrice - amount;
            break;
          case 'below_percent':
            newPrice = marketPrice * (1 - amount / 100);
            break;
          case 'above_dollar':
            newPrice = marketPrice + amount;
            break;
          case 'above_percent':
            newPrice = marketPrice * (1 + amount / 100);
            break;
        }
        
        // Round to nearest dollar
        newPrice = Math.round(newPrice);
        
        return {
          listingId: listing.listingId,
          currentPrice: listing.currentPrice,
          newPrice,
          marketPrice
        };
      });

      // Update prices via API
      const response = await fetch('/api/stockx/listings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_price',
          listingIds: updates.map(u => u.listingId),
          updates
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully updated ${updates.length} listing${updates.length > 1 ? 's' : ''}`);
        await fetchListings();
      } else {
        alert(`Failed to update prices: ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Custom rule error:', error);
      alert('Failed to apply custom pricing rule');
    } finally {
      setLoading(false);
    }
  };

  const executeRepricing = async () => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to reprice');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/stockx/repricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          listings: selectedListings,
          strategy,
          dryRun,
          notificationEmail: notificationEmail || undefined
        })
      });

      const data = await response.json();
      
      if (data.success && data.results && Array.isArray(data.results)) {
        setResults(data.results);
        // Refresh listings after repricing
        if (!dryRun) {
          await fetchListings();
        }
      } else {
        alert(`Repricing failed: ${data.error || 'Unknown error'}`);
        setResults([]);
      }
    } catch (error) {
      console.error('Repricing error:', error);
      alert('Failed to execute repricing');
    } finally {
      setLoading(false);
    }
  };

  const getStrategyDescription = (type: string) => {
    switch (type) {
      case 'competitive':
        return 'Price just below the current lowest ask to maximize sales velocity';
      case 'margin_based':
        return 'Maintain minimum profit margins while staying competitive';
      case 'velocity_based':
        return 'Reduce prices on slow-moving inventory after specified days';
      case 'hybrid':
        return 'Combine multiple strategies for optimal balance of profit and velocity';
      default:
        return '';
    }
  };

  const getCompetitivePositionColor = (position: string) => {
    switch (position) {
      case 'lowest_ask':
        return 'text-green-600';
      case 'competitive':
        return 'text-blue-600';
      case 'market_price':
        return 'text-yellow-600';
      case 'premium':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!authenticated || authError) {
    return (
      <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <h2 className={`text-2xl font-bold mb-4 ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
          StockX Repricing
        </h2>
        <div className="text-center py-8">
          <p className={`mb-4 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            {authError 
              ? "Your StockX session has expired. Please re-authenticate to continue."
              : "Please authenticate with StockX to use the repricing feature."}
          </p>
          <button 
            onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.origin + '/dashboard?view=stockx-repricing')}
            className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
              isNeon 
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {authError ? "Re-authenticate with StockX" : "Authenticate with StockX"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen p-6 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50'} space-y-6`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className={`text-3xl font-bold ${
            isNeon ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent' : 'text-gray-900'
          }`}>
            StockX Automated Repricing
          </h2>
          <p className={`mt-2 ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
            Optimize your listing prices with intelligent repricing strategies
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchListings(false)}
            disabled={loading}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${
              isNeon
                ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white disabled:opacity-50'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
            }`}
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Refresh Listings
              </>
            )}
          </button>
          <button
            onClick={() => {
              console.log('🔥 HARD RELOAD TRIGGERED');
              window.location.reload();
            }}
            disabled={loading}
            className={`px-4 py-3 rounded-lg font-semibold transition-all duration-200 ${
              isNeon
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
            }`}
            title="Force complete page reload"
          >
            Hard Reload
          </button>
        </div>
      </div>

      {/* Simple Pricing Rules - Only show when items are selected */}
      {selectedCount > 0 && (
        <div className={`rounded-lg p-6 ${
          isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <Target className="w-5 h-5" />
            Set Pricing Rule for {selectedCount} Selected Item{selectedCount > 1 ? 's' : ''}
          </h3>
        
        <div className="space-y-3">
          {/* Quick Pricing Rules */}
          <button
            onClick={() => applyPricingRule('beat_lowest', 1)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Beat Lowest Ask by $1
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to $1 below the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('match_lowest', 0)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Match Lowest Ask
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price equal to the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('percentage', 5)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              5% Below Market
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to 5% below the current market price
            </div>
          </button>

          <button
            onClick={() => applyPricingRule('percentage', 10)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              10% Below Market
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to 10% below the current market price
            </div>
          </button>

          {/* Custom Price Input */}
          <div className={`p-4 rounded-lg border-2 ${
            isNeon ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
          }`}>
            <label className={`block text-sm font-medium mb-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
              Custom Rule
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Amount"
                min="0"
                step="1"
                className={`flex-1 p-2 rounded-md ${
                  isNeon 
                    ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                    : 'bg-gray-50 border border-gray-300 focus:border-blue-500 focus:outline-none'
                }`}
                id="customAmount"
              />
              <select
                className={`p-2 rounded-md ${
                  isNeon 
                    ? 'bg-gray-800 border border-gray-700 text-white focus:border-cyan-500 focus:outline-none'
                    : 'bg-gray-50 border border-gray-300 focus:border-blue-500 focus:outline-none'
                }`}
                id="customType"
              >
                <option value="below_dollar">$ Below Market</option>
                <option value="below_percent">% Below Market</option>
                <option value="above_dollar">$ Above Market</option>
                <option value="above_percent">% Above Market</option>
              </select>
              <button
                onClick={() => {
                  const amount = parseFloat((document.getElementById('customAmount') as HTMLInputElement).value);
                  const type = (document.getElementById('customType') as HTMLSelectElement).value;
                  if (amount) applyCustomRule(type, amount);
                }}
                className={`px-4 py-2 rounded-md font-medium ${
                  isNeon 
                    ? 'bg-cyan-500 text-black hover:bg-cyan-400'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Notification Settings */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <h3 className={`text-lg font-semibold mb-4 ${
          isNeon ? 'text-cyan-400' : 'text-gray-900'
        }`}>
          Notification Settings
        </h3>
        <div>
          <label className="block text-sm font-medium mb-1">Notification Email</label>
          <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-2 border rounded-md"
            />
        </div>
      </div>

      {/* Listings Selection */}
      <div className={`rounded-lg p-6 ${
        isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <Package className="w-5 h-5" />
            Select Listings to Reprice
            {listings.length > 0 && (
              <span className={`text-sm font-normal ml-2 ${
                isNeon ? 'text-gray-400' : 'text-gray-600'
              }`}>
                ({selectedCount} of {listings.length} selected)
              </span>
            )}
          </h3>
          <div className="flex items-center gap-2">
            {listingStats.investigation && (
              <div className={`text-sm px-3 py-1 rounded-full flex items-center gap-2 ${
                listingStats.trueDuplicatesRemoved && listingStats.trueDuplicatesRemoved > 0
                  ? isNeon 
                    ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' 
                    : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                  : isNeon
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-green-100 text-green-800 border border-green-300'
              }`} title={`${listingStats.investigation.productSizeGroupsWithMultiples} product-size combos have multiple listings`}>
                {listingStats.investigation.message}
              </div>
            )}
            {lastFetchTime && (
              <div className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>
                Last updated: {lastFetchTime.toLocaleTimeString()}
              </div>
            )}
            {listings.length !== 51 && (
              <div className={`text-sm px-3 py-1 rounded-full ${
                isNeon 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                  : 'bg-red-100 text-red-800 border border-red-300'
              }`} title="Check browser console for debug info">
                ⚠️ Expected 51, showing {listings.length}
              </div>
            )}
          </div>
        </div>

        {listings.length === 0 ? (
          <div className={`text-center py-8 ${isNeon ? 'text-gray-400' : 'text-gray-500'}`}>
            <p>No listings found. Click "Refresh Listings" to load your StockX listings.</p>
            {authError && (
              <div className="mt-4">
                <p className={`mb-3 ${isNeon ? 'text-red-400' : 'text-red-600'}`}>
                  Authentication error detected. You may need to re-authenticate with StockX.
                </p>
                <button
                  onClick={() => window.location.href = '/api/stockx/auth?returnTo=' + encodeURIComponent(window.location.pathname)}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isNeon 
                      ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  Re-authenticate with StockX
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                    <div className="flex flex-col items-center">
                      <span className="mb-1">Select</span>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isPartiallySelected;
                        }}
                        onChange={selectAll}
                        className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'} rounded cursor-pointer`}
                      />
                    </div>
                  </th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Style ID</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Colorway</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Size</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>My Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Market Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.listingId} className={`border-b transition-colors ${
                    isNeon 
                      ? 'border-gray-700 hover:bg-gray-700/50' 
                      : 'border-gray-100 hover:bg-gray-50'
                  }`}>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={listing.selected}
                        onChange={() => toggleListingSelection(listing.listingId)}
                        className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                        {listing.productName}
                      </div>
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      {listing.styleId || '-'}
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      {listing.colorway || '-'}
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.size}</td>
                    <td className={`p-3 font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                      ${listing.currentPrice}
                    </td>
                    <td className={`p-3 font-medium ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      ${listing.lowestAsk || '-'}
                    </td>
                    <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        listing.status === 'ACTIVE' 
                          ? isNeon ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-800'
                          : isNeon ? 'bg-gray-500/20 text-gray-400' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {listing.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Controls */}
      <div className={`flex items-center justify-between p-6 rounded-lg ${
        isNeon ? 'bg-gray-800' : 'bg-gray-50'
      }`}>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'}`}
            />
            <span className={isNeon ? 'text-gray-300' : 'text-gray-700'}>
              Dry Run (Preview Only)
            </span>
          </label>
        </div>
        
        <button
          onClick={executeRepricing}
          disabled={loading || listings.filter(l => l.selected).length === 0}
          className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 disabled:opacity-50 ${
            dryRun 
              ? isNeon
                ? 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              : isNeon
                ? 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white'
                : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {dryRun ? <AlertTriangle className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {dryRun ? 'Preview Repricing' : 'Execute Repricing'}
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className={`rounded-lg p-6 ${
          isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${
            isNeon ? 'text-cyan-400' : 'text-gray-900'
          }`}>
            <CheckCircle className="w-5 h-5" />
            Repricing Results {dryRun && '(Preview)'}
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isNeon ? 'border-gray-700' : 'border-gray-200'}`}>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Product</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Current Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>New Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Change</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Action</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Position</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const listing = listings.find(l => l.listingId === result.listingId);
                  const priceChange = result.newPrice - result.currentPrice;
                  const priceChangePercent = (priceChange / result.currentPrice) * 100;
                  
                  return (
                    <tr key={result.listingId} className={`border-b ${
                      isNeon ? 'border-gray-700' : 'border-gray-100'
                    }`}>
                      <td className="p-3">
                        <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                          {listing?.productName}
                        </div>
                        <div className={isNeon ? 'text-gray-400 text-sm' : 'text-gray-600 text-sm'}>
                          Size {listing?.size}
                        </div>
                      </td>
                      <td className={`p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                        ${result.currentPrice}
                      </td>
                      <td className={`p-3 font-medium ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                        ${result.newPrice}
                      </td>
                      <td className="p-3">
                        <div className={`font-medium ${
                          priceChange >= 0 
                            ? isNeon ? 'text-emerald-400' : 'text-green-600'
                            : isNeon ? 'text-red-400' : 'text-red-600'
                        }`}>
                          {priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}
                        </div>
                        <div className={`text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                          ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%)
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          result.action === 'updated' || result.action === 'would_update' 
                            ? isNeon 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-green-100 text-green-800'
                            : isNeon
                              ? 'bg-gray-700 text-gray-300 border border-gray-600'
                              : 'bg-gray-100 text-gray-800'
                        }`}>
                          {result.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-medium ${
                          isNeon 
                            ? result.competitivePosition === 'lowest_ask' 
                              ? 'text-emerald-400'
                              : result.competitivePosition === 'competitive'
                              ? 'text-cyan-400'
                              : 'text-gray-400'
                            : getCompetitivePositionColor(result.competitivePosition)
                        }`}>
                          {result.competitivePosition.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
  );
} 