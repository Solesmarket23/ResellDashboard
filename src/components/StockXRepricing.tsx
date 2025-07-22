'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { DollarSign, TrendingDown, Target, Zap, RefreshCw, AlertTriangle, CheckCircle, Loader, Package } from 'lucide-react';
import NeonDropdown from './NeonDropdown';

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

interface IndividualPricingStrategy {
  type: 'beat_lowest' | 'match_lowest' | 'percentage_below' | 'manual' | 'keep_current';
  value?: number; // Amount for beat_lowest or percentage
  manualPrice?: number;
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
  // Individual pricing settings
  pricingStrategy?: IndividualPricingStrategy;
  minPrice?: number;
  maxPrice?: number;
  autoDeactivate?: boolean;
  costBasis?: number; // Add cost basis for validation
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
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50);
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
  const [customRuleType, setCustomRuleType] = useState('below_dollar');
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
  const [lastMarketRefreshTime, setLastMarketRefreshTime] = useState<Date | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null);
  
  // Pagination calculations - moved here so they're available for all functions
  const totalPages = Math.ceil(listings.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedListings = listings.slice(startIndex, endIndex);
  
  const selectedCount = listings.filter(l => l.selected).length;
  const pageSelectedCount = paginatedListings.filter(l => l.selected).length;
  const isAllSelected = paginatedListings.length > 0 && paginatedListings.every(l => l.selected);
  const isPartiallySelected = pageSelectedCount > 0 && pageSelectedCount < paginatedListings.length;

  // Reset to page 1 when listings change
  useEffect(() => {
    setCurrentPage(1);
  }, [listings.length]);

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

  const toggleListingSelection = async (listingId: string) => {
    // First update the selection state
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, selected: !listing.selected }
        : listing
    ));
    
    // Find the listing that was toggled
    const listing = listings.find(l => l.listingId === listingId);
    if (!listing || listing.selected) return; // If already selected or not found, skip
    
    // If we don't have market data for this listing, fetch it
    if (!listing.lowestAsk || listing.lowestAsk === 0) {
      try {
        const response = await fetch('/api/stockx/listings/market-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            listings: [{ 
              listingId: listing.listingId, 
              productId: listing.productId, 
              variantId: listing.variantId 
            }]
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.marketData && data.marketData.length > 0) {
            const marketInfo = data.marketData[0];
            if (marketInfo.marketData) {
              // Update the listing with market data
              setListings(prev => prev.map(l => 
                l.listingId === listingId 
                  ? { 
                      ...l, 
                      lowestAsk: marketInfo.marketData.lowestAsk,
                      highestBid: marketInfo.marketData.highestBid,
                      lastSale: marketInfo.marketData.lastSale
                    }
                  : l
              ));
            }
          }
        }
      } catch (error) {
        console.error('Error fetching market data:', error);
      }
    }
  };

  const selectAll = async () => {
    const allPageSelected = paginatedListings.every(listing => listing.selected);
    
    // Update selection state for current page items only
    setListings(prev => prev.map(listing => {
      const isOnCurrentPage = paginatedListings.some(pl => pl.listingId === listing.listingId);
      if (isOnCurrentPage) {
        return { ...listing, selected: !allPageSelected };
      }
      return listing;
    }));
    
    // If selecting all on current page, fetch market data for listings that don't have it
    if (!allPageSelected) {
      const listingsNeedingData = paginatedListings.filter(l => !l.lowestAsk || l.lowestAsk === 0);
      if (listingsNeedingData.length > 0) {
        try {
          // No need to limit since we're already paginated
          const batchListings = listingsNeedingData.map(l => ({
            listingId: l.listingId,
            productId: l.productId,
            variantId: l.variantId
          }));
          
          const response = await fetch('/api/stockx/listings/market-data', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ listings: batchListings })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.marketData) {
              // Update listings with market data
              setListings(prev => prev.map(listing => {
                const marketInfo = data.marketData.find((m: any) => m.listingId === listing.listingId);
                if (marketInfo && marketInfo.marketData) {
                  return {
                    ...listing,
                    lowestAsk: marketInfo.marketData.lowestAsk,
                    highestBid: marketInfo.marketData.highestBid,
                    lastSale: marketInfo.marketData.lastSale
                  };
                }
                return listing;
              }));
            }
          }
        } catch (error) {
          console.error('Error fetching market data for batch:', error);
        }
      }
    }
  };

  const fetchMarketDataForListings = useCallback(async (listingsToFetch: Listing[]) => {
    if (listingsToFetch.length === 0) return;
    
    try {
      const batchListings = listingsToFetch.map(l => ({
        listingId: l.listingId,
        productId: l.productId,
        variantId: l.variantId
      }));
      
      const response = await fetch('/api/stockx/listings/market-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ listings: batchListings })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.marketData) {
          // Update listings with market data
          setListings(prev => prev.map(listing => {
            const marketInfo = data.marketData.find((m: any) => m.listingId === listing.listingId);
            if (marketInfo && marketInfo.marketData) {
              return {
                ...listing,
                lowestAsk: marketInfo.marketData.lowestAsk,
                highestBid: marketInfo.marketData.highestBid,
                lastSale: marketInfo.marketData.lastSale
              };
            }
            return listing;
          }));
        }
      }
    } catch (error) {
      console.error('Error refreshing market prices:', error);
      // Don't show alert in background refresh, only log
      if (!isBackgroundRefreshing) {
        alert('Failed to refresh market prices. Please try again.');
      }
    }
  }, [isBackgroundRefreshing]);

  const refreshMarketPrices = useCallback(async () => {
    // This is for manual refresh of current page only
    try {
      setLoading(true);
      const listingsNeedingData = paginatedListings.filter(l => !l.lowestAsk || l.lowestAsk === 0);
      
      if (listingsNeedingData.length === 0) {
        // If all have prices, refresh all on current page
        await fetchMarketDataForListings(paginatedListings);
      } else {
        // Otherwise just fetch for those missing prices
        await fetchMarketDataForListings(listingsNeedingData);
      }
      
      // Don't update the main refresh time, this is just for current page
      console.log(`✅ Refreshed market prices for ${paginatedListings.length} items on current page`);
    } finally {
      setLoading(false);
    }
  }, [paginatedListings, fetchMarketDataForListings]);

  const refreshAllMarketPrices = useCallback(async () => {
    // Background refresh for ALL listings in batches
    if (isBackgroundRefreshing || listings.length === 0) return;
    
    console.log(`🔄 Starting background refresh for ${listings.length} total listings`);
    setIsBackgroundRefreshing(true);
    setRefreshProgress({ current: 0, total: listings.length });
    
    const BATCH_SIZE = 25; // Process 25 items at a time
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
    
    try {
      // Process all listings in batches
      for (let i = 0; i < listings.length; i += BATCH_SIZE) {
        const batch = listings.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(listings.length / BATCH_SIZE);
        
        console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);
        
        // Fetch market data for this batch
        await fetchMarketDataForListings(batch);
        
        // Update progress
        const processed = Math.min(i + BATCH_SIZE, listings.length);
        setRefreshProgress({ current: processed, total: listings.length });
        
        // Wait between batches to avoid rate limiting (except for last batch)
        if (i + BATCH_SIZE < listings.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
        }
      }
      
      console.log('✅ Background refresh completed for all listings');
      setLastMarketRefreshTime(new Date());
      
    } catch (error) {
      console.error('❌ Error during background refresh:', error);
    } finally {
      setIsBackgroundRefreshing(false);
      setRefreshProgress(null);
    }
  }, [listings, isBackgroundRefreshing, fetchMarketDataForListings]);

  // useEffect hooks after function definitions to avoid hoisting issues
  useEffect(() => {
    // Check if we're returning from authentication
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('authenticated') === 'true') {
      // Remove the parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    fetchListings();
  }, []);

  // Auto-refresh ALL market prices every 15 minutes
  useEffect(() => {
    // Only run if we have listings
    if (listings.length === 0) return;

    console.log('🔄 Starting auto-refresh timer for ALL market prices (15 min intervals)');
    
    // Refresh all listings immediately on mount if listings exist
    const timer = setTimeout(() => {
      refreshAllMarketPrices();
    }, 3000); // Small delay to ensure listings are loaded

    // Set up interval for periodic refresh of ALL listings
    const interval = setInterval(() => {
      console.log('⏰ Auto-refreshing ALL market prices...');
      refreshAllMarketPrices();
    }, 15 * 60 * 1000); // 15 minutes

    // Cleanup
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      console.log('🛑 Stopped auto-refresh timer');
    };
  }, [listings.length]); // Only depend on listings.length to avoid circular dependency

  // Individual listing update functions
  const updateListingStrategy = (listingId: string, type: IndividualPricingStrategy['type']) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { 
            ...listing, 
            pricingStrategy: { 
              ...listing.pricingStrategy, 
              type,
              value: type === 'beat_lowest' ? 1 : type === 'percentage_below' ? 5 : undefined,
              manualPrice: type === 'manual' ? listing.currentPrice : undefined
            } 
          }
        : listing
    ));
  };

  const updateStrategyValue = (listingId: string, value: number) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, pricingStrategy: { ...listing.pricingStrategy!, value } }
        : listing
    ));
  };

  const updateManualPrice = (listingId: string, manualPrice: number) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, pricingStrategy: { ...listing.pricingStrategy!, manualPrice } }
        : listing
    ));
  };

  const updateMinPrice = (listingId: string, minPrice: number) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, minPrice: isNaN(minPrice) ? undefined : minPrice }
        : listing
    ));
  };

  const updateMaxPrice = (listingId: string, maxPrice: number) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, maxPrice: isNaN(maxPrice) ? undefined : maxPrice }
        : listing
    ));
  };

  const updateAutoDeactivate = (listingId: string, autoDeactivate: boolean) => {
    setListings(prev => prev.map(listing => 
      listing.listingId === listingId 
        ? { ...listing, autoDeactivate }
        : listing
    ));
  };

  const applyPricingRule = async (rule: string, value: number) => {
    const selectedListings = listings.filter(listing => listing.selected);
    
    if (selectedListings.length === 0) {
      alert('Please select at least one listing to apply pricing rule');
      return;
    }

    // Map rule to pricing strategy type
    let strategyType: IndividualPricingStrategy['type'] = 'keep_current';
    if (rule === 'beat_lowest') {
      strategyType = 'beat_lowest';
    } else if (rule === 'match_lowest') {
      strategyType = 'match_lowest';
    } else if (rule === 'percentage') {
      strategyType = 'percentage_below';
    }

    // Update the pricing strategy for all selected listings
    setListings(prev => prev.map(listing => {
      if (listing.selected) {
        return {
          ...listing,
          pricingStrategy: {
            type: strategyType,
            value: value
          }
        };
      }
      return listing;
    }));

    // Show success message
    console.log(`✅ Applied ${rule} pricing rule to ${selectedListings.length} listings`);
    
    // Display success message
    let message = '';
    if (rule === 'beat_lowest') {
      message = `Applied "Beat Lowest by $${value}" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    } else if (rule === 'match_lowest') {
      message = `Applied "Match Lowest Ask" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    } else if (rule === 'percentage') {
      message = `Applied "${value}% Below Market" to ${selectedListings.length} item${selectedListings.length > 1 ? 's' : ''}`;
    }
    
    setBulkActionMessage(message);
    setTimeout(() => setBulkActionMessage(null), 5000); // Clear after 5 seconds
    
    // Optional: Auto-refresh market prices for selected items
    if (selectedListings.some(l => !l.lowestAsk)) {
      await fetchMarketDataForListings(selectedListings);
    }
  };

  const applyPricingRuleDirectly = async (rule: string, value: number) => {
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

    // Validate that all selected listings have min/max prices
    const invalidListings = selectedListings.filter(listing => !listing.minPrice || !listing.maxPrice);
    if (invalidListings.length > 0) {
      alert(`Please set min and max prices for all selected listings. ${invalidListings.length} listing(s) are missing price limits.`);
      return;
    }

    // Validate min < max for all listings
    const invalidPriceRanges = selectedListings.filter(listing => 
      listing.minPrice && listing.maxPrice && listing.minPrice >= listing.maxPrice
    );
    if (invalidPriceRanges.length > 0) {
      alert(`Please ensure min price is less than max price for all listings. ${invalidPriceRanges.length} listing(s) have invalid price ranges.`);
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
          listings: selectedListings.map(listing => ({
            ...listing,
            costBasis: listing.costBasis || listing.retailPrice || listing.originalPrice * 0.7, // Estimate cost basis if not provided
          })),
          strategy,
          dryRun,
          notificationEmail: notificationEmail || undefined,
          useIndividualStrategies: true // Flag to indicate we're using individual strategies
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
    <div className={`min-h-screen p-6 space-y-6 ${isNeon ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
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

      {/* Success Message */}
      {bulkActionMessage && (
        <div className={`rounded-lg p-4 mb-4 flex items-center gap-3 animate-fadeIn ${
          isNeon 
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
            : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium">{bulkActionMessage}</span>
        </div>
      )}

      {/* Simple Pricing Rules - Only show when items are selected */}
      {selectedCount > 0 && (
        <div className={`rounded-lg p-6 ${
          isNeon ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-lg font-semibold flex items-center gap-2 ${
              isNeon ? 'text-cyan-400' : 'text-gray-900'
            }`}>
              <Target className="w-5 h-5" />
              Bulk Pricing Rules
            </h3>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
            </div>
          </div>
        
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
            onClick={() => applyPricingRule('beat_lowest', 5)}
            className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
              isNeon 
                ? 'bg-gray-900 border-gray-700 hover:border-cyan-500 hover:bg-cyan-500/10'
                : 'bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <div className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
              Beat Lowest Ask by $5
            </div>
            <div className={`text-sm ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
              Set price to $5 below the current market price
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
              <NeonDropdown
                value={customRuleType}
                onChange={setCustomRuleType}
                options={[
                  { value: 'below_dollar', label: '$ Below Market' },
                  { value: 'below_percent', label: '% Below Market' },
                  { value: 'above_dollar', label: '$ Above Market' },
                  { value: 'above_percent', label: '% Above Market' }
                ]}
                isNeon={isNeon}
              />
              <button
                onClick={() => {
                  const amount = parseFloat((document.getElementById('customAmount') as HTMLInputElement).value);
                  const type = customRuleType;
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
          <label className={`block text-sm font-medium mb-1 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Notification Email</label>
          <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="your@email.com"
              className={`w-full p-2 rounded-md border focus:outline-none focus:ring-2 ${
                isNeon 
                  ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400'
              }`}
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
                ({selectedCount} of {listings.length} selected{pageSelectedCount > 0 ? `, ${pageSelectedCount} on this page` : ''})
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
                Listings: {lastFetchTime.toLocaleTimeString()}
              </div>
            )}
            {(lastMarketRefreshTime || isBackgroundRefreshing) && (
              <div className={`text-xs px-2 py-1 rounded-full ${
                isNeon 
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}>
                {isBackgroundRefreshing ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Refreshing all prices...</span>
                    {refreshProgress && (
                      <div className="flex items-center gap-1">
                        <div className={`w-24 h-2 rounded-full overflow-hidden ${
                          isNeon ? 'bg-gray-700' : 'bg-gray-300'
                        }`}>
                          <div 
                            className={`h-full transition-all duration-500 ${
                              isNeon ? 'bg-gradient-to-r from-cyan-500 to-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${(refreshProgress.current / refreshProgress.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{refreshProgress.current}/{refreshProgress.total}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Market prices: {lastMarketRefreshTime.toLocaleTimeString()}
                    <span className={`text-xs ${isNeon ? 'text-cyan-300' : 'text-blue-500'}`}>
                      (auto-refresh all every 15min)
                    </span>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={refreshMarketPrices}
              disabled={loading || isBackgroundRefreshing}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1 ${
                isNeon
                  ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 disabled:opacity-50'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300 disabled:opacity-50'
              }`}
              title="Refresh market prices for current page"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh Page
            </button>
            <button
              onClick={refreshAllMarketPrices}
              disabled={loading || isBackgroundRefreshing}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all flex items-center gap-1 ${
                isNeon
                  ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-50'
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-300 disabled:opacity-50'
              }`}
              title="Refresh market prices for ALL listings"
            >
              <RefreshCw className={`w-3 h-3 ${isBackgroundRefreshing ? 'animate-spin' : ''}`} />
              Refresh All ({listings.length})
            </button>
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
          <>
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
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Size</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>My Price</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Market</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Pricing Rule</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Min</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Max</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Auto Off</th>
                  <th className={`text-left p-3 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedListings.map((listing) => (
                  <tr key={listing.listingId} className={`border-b transition-colors ${
                    isNeon 
                      ? 'border-gray-700 hover:bg-gray-700/50' 
                      : 'border-gray-100 hover:bg-gray-50'
                  } ${listing.selected ? isNeon ? 'bg-gray-800/30' : 'bg-blue-50/30' : ''}`}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={listing.selected}
                        onChange={() => toggleListingSelection(listing.listingId)}
                        className={`w-4 h-4 ${isNeon ? 'text-cyan-500' : 'text-blue-600'} cursor-pointer`}
                      />
                    </td>
                    <td className="p-2">
                      <div className={`font-medium text-sm ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                        {listing.productName}
                      </div>
                      <div className={`text-xs ${isNeon ? 'text-gray-400' : 'text-gray-600'}`}>
                        {listing.styleId || 'N/A'}
                      </div>
                    </td>
                    <td className={`p-2 text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>{listing.size}</td>
                    <td className={`p-2 font-medium text-sm ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                      ${listing.currentPrice}
                    </td>
                    <td className={`p-2 font-medium text-sm ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
                      ${listing.lowestAsk || '-'}
                    </td>
                    <td className="p-2">
                      {listing.selected ? (
                        <div className="flex items-center gap-1">
                          <NeonDropdown
                            value={listing.pricingStrategy?.type || 'keep_current'}
                            onChange={(value) => updateListingStrategy(listing.listingId, value as any)}
                            options={[
                              { value: 'keep_current', label: 'Keep Current' },
                              { value: 'beat_lowest', label: `Beat lowest ask by $${listing.pricingStrategy?.type === 'beat_lowest' ? listing.pricingStrategy?.value || 1 : 1}` },
                              { value: 'match_lowest', label: 'Match Lowest' },
                              { value: 'percentage_below', label: `-${listing.pricingStrategy?.type === 'percentage_below' ? listing.pricingStrategy?.value || 5 : 5}%` },
                              { value: 'manual', label: 'Manual' }
                            ]}
                            isNeon={isNeon}
                            className="flex-1"
                          />
                          {(listing.pricingStrategy?.type === 'beat_lowest' || 
                            listing.pricingStrategy?.type === 'percentage_below' ||
                            listing.pricingStrategy?.type === 'manual') && (
                            <input
                              type="number"
                              min="1"
                              value={
                                listing.pricingStrategy?.type === 'manual' 
                                  ? listing.pricingStrategy?.manualPrice || listing.currentPrice
                                  : listing.pricingStrategy?.value || 1
                              }
                              onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                if (listing.pricingStrategy?.type === 'manual') {
                                  updateManualPrice(listing.listingId, value);
                                } else {
                                  updateStrategyValue(listing.listingId, value);
                                }
                              }}
                              className={`w-16 text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                                isNeon 
                                  ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50' 
                                  : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                              }`}
                              placeholder={listing.pricingStrategy?.type === 'manual' ? '$' : '#'}
                            />
                          )}
                        </div>
                      ) : (
                        <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>-</span>
                      )}
                    </td>
                    <td className="p-2">
                      {listing.selected ? (
                        <input
                          type="number"
                          min="1"
                          value={listing.minPrice || ''}
                          onChange={(e) => updateMinPrice(listing.listingId, parseFloat(e.target.value))}
                          className={`w-16 text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                            isNeon 
                              ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400'
                          } ${!listing.minPrice && listing.selected ? 'border-red-500' : ''}`}
                          placeholder="$"
                          required
                        />
                      ) : (
                        <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>-</span>
                      )}
                    </td>
                    <td className="p-2">
                      {listing.selected ? (
                        <input
                          type="number"
                          min="1"
                          value={listing.maxPrice || ''}
                          onChange={(e) => updateMaxPrice(listing.listingId, parseFloat(e.target.value))}
                          className={`w-16 text-xs px-2 py-1 rounded border focus:outline-none focus:ring-2 ${
                            isNeon 
                              ? 'bg-gray-700 border-cyan-500/50 text-cyan-400 focus:ring-cyan-500/50 placeholder-gray-500' 
                              : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500 placeholder-gray-400'
                          } ${!listing.maxPrice && listing.selected ? 'border-red-500' : ''}`}
                          placeholder="$"
                          required
                        />
                      ) : (
                        <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>-</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {listing.selected ? (
                        <input
                          type="checkbox"
                          checked={listing.autoDeactivate || false}
                          onChange={(e) => updateAutoDeactivate(listing.listingId, e.target.checked)}
                          className={`w-4 h-4 ${isNeon ? 'text-cyan-500 accent-cyan-500' : 'text-blue-600'} cursor-pointer`}
                        />
                      ) : (
                        <span className={`text-xs ${isNeon ? 'text-gray-500' : 'text-gray-400'}`}>-</span>
                      )}
                    </td>
                    <td className={`p-2 ${isNeon ? 'text-gray-300' : 'text-gray-700'}`}>
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
          
          {totalPages > 1 && (
            <div className={`flex items-center justify-between mt-4 px-2 ${
              isNeon ? 'text-gray-300' : 'text-gray-700'
            }`}>
              <div className="text-sm">
                Showing {startIndex + 1} to {Math.min(endIndex, listings.length)} of {listings.length} listings
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1 rounded-md transition-all ${
                    currentPage === 1
                      ? isNeon ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isNeon 
                        ? 'bg-gray-700 hover:bg-gray-600 text-cyan-400' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                  }`}
                >
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, index) => {
                    const page = index + 1;
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 || 
                      page === totalPages || 
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded-md transition-all ${
                            page === currentPage
                              ? isNeon 
                                ? 'bg-cyan-500 text-black font-semibold' 
                                : 'bg-blue-600 text-white font-semibold'
                              : isNeon 
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                                : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (
                      page === currentPage - 2 || 
                      page === currentPage + 2
                    ) {
                      return <span key={page} className="px-1">...</span>;
                    }
                    return null;
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1 rounded-md transition-all ${
                    currentPage === totalPages
                      ? isNeon ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : isNeon 
                        ? 'bg-gray-700 hover:bg-gray-600 text-cyan-400' 
                        : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
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
  );
} 