'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw, 
  Filter,
  ArrowRight,
  ShoppingCart,
  Target,
  Percent,
  Clock,
  Star
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface EbayListing {
  title: string;
  price: number;
  currency: string;
  image: string;
  url: string;
  seller: string;
  condition: string;
  source: string;
  itemId: string;
  shipping?: number;
  bidsCount?: number;
  endTime?: string;
  buyItNowPrice?: number;
}

interface StockXPriceData {
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  productId: string;
  variantId: string;
  size: string;
}

interface ArbitrageOpportunity {
  ebayListing: EbayListing;
  stockxData: StockXPriceData | null;
  profit: number;
  profitMargin: number;
  totalCost: number;
  netRevenue: number;
  roi: number;
  matchedProduct?: string;
  confidence: number;
}

interface SearchStats {
  totalEbayListings: number;
  totalOpportunities: number;
  averageProfit: number;
  averageProfitMargin: number;
}

const EbayStockXArbitrage: React.FC = () => {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme.name.toLowerCase() === 'neon';
  
  const [searchQuery, setSearchQuery] = useState('');
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [stats, setStats] = useState<SearchStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [searchProgress, setSearchProgress] = useState<{
    ebayFound: number;
    stockxMatched: number;
    currentStep: string;
  }>({ ebayFound: 0, stockxMatched: 0, currentStep: '' });
  
  // Filter states
  const [minProfitMargin, setMinProfitMargin] = useState(0); // Set to 0 for debugging
  const [maxPrice, setMaxPrice] = useState(500);
  const [minConfidence, setMinConfidence] = useState(60);
  const [showFilters, setShowFilters] = useState(false);
  const [newItemsOnly, setNewItemsOnly] = useState(true); // Default to new items only since StockX requires new
  const [authenticityGuaranteeOnly, setAuthenticityGuaranteeOnly] = useState(false);
  const [stockxAuthStatus, setStockxAuthStatus] = useState<'checking' | 'authenticated' | 'not_authenticated'>('checking');

  // Check StockX authentication status on component mount
  useEffect(() => {
    const checkStockXAuth = async () => {
      try {
        const response = await fetch('/api/stockx/auth/status');
        if (response.ok) {
          const data = await response.json();
          setStockxAuthStatus(data.isAuthenticated ? 'authenticated' : 'not_authenticated');
        } else {
          setStockxAuthStatus('not_authenticated');
        }
      } catch (error) {
        console.error('Error checking StockX auth status:', error);
        setStockxAuthStatus('not_authenticated');
      }
    };

    checkStockXAuth();
    
    // Check for auth success in URL params (when returning from StockX OAuth)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      // Remove the success param from URL
      window.history.replaceState({}, '', window.location.pathname + '?section=ebay-stockx-arbitrage');
      // Refresh auth status
      setTimeout(checkStockXAuth, 1000);
    }
  }, []);

  const searchArbitrageOpportunities = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      return;
    }

    // If not authenticated, show auth message
    if (stockxAuthStatus === 'not_authenticated') {
      setErrorMessage('Please connect to StockX first to enable price comparisons');
      return;
    }

    console.log(`🔍 Starting eBay-StockX arbitrage search for: "${searchQuery}"`);
    console.log(`📊 Filters: minProfit=${minProfitMargin}%, maxPrice=$${maxPrice}, minConfidence=${minConfidence}%`);

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOpportunities([]);
    setStats(null);
    setSearchStatus('Searching eBay listings...');
    setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: 'Searching eBay' });

    const startTime = Date.now();

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        minProfitMargin: minProfitMargin.toString(),
        maxPrice: maxPrice.toString(),
        limit: '50',
        newItemsOnly: newItemsOnly.toString(),
        authenticityGuaranteeOnly: authenticityGuaranteeOnly.toString()
      });

      console.log(`🌐 Making API call to: /api/ebay-stockx-arbitrage?${params.toString()}`);
      
      const response = await fetch(`/api/ebay-stockx-arbitrage?${params.toString()}`);
      
      const elapsedTime = Date.now() - startTime;
      console.log(`⏱️ API response received in ${elapsedTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ HTTP error ${response.status}:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Raw API response:`, data);

      if (data.success) {
        const allOpportunities = data.opportunities || [];
        console.log(`📋 Total opportunities from API: ${allOpportunities.length}`);
        
        // Debug: Log the first few opportunities to see what we're getting
        if (allOpportunities.length > 0) {
          console.log(`🔍 Sample opportunities:`, allOpportunities.slice(0, 3).map(opp => ({
            ebayTitle: opp.ebayListing?.title,
            stockxMatch: opp.stockxData?.title || 'No match',
            profit: opp.profit,
            confidence: opp.confidence,
            hasRealMatch: opp.profit > -500 // Real matches should have reasonable profit, not -999
          })));
        }
        
        // Update progress with eBay results
        setSearchProgress(prev => ({ 
          ...prev, 
          ebayFound: data.totalEbayListings || 0,
          stockxMatched: data.totalOpportunities || 0,
          currentStep: 'Processing results'
        }));
        setSearchStatus(`Found ${data.totalEbayListings || 0} eBay listings, ${data.totalOpportunities || 0} with StockX matches`);
        
        // TEMPORARILY: Show ALL results for debugging (no confidence filter)
        const filteredOpportunities = allOpportunities; // Show everything for debugging
        console.log(`🔍 After confidence filter (showing ALL for debugging): ${filteredOpportunities.length} opportunities`);
        
        // Debug: Log detailed info about each opportunity
        if (filteredOpportunities.length > 0) {
          console.log(`🔍 Detailed opportunity analysis:`);
          filteredOpportunities.forEach((opp, index) => {
            console.log(`Opportunity ${index + 1}:`, {
              ebayTitle: opp.ebayListing?.title,
              ebayPrice: opp.ebayListing?.price,
              stockxAsk: opp.stockxData?.lowestAsk,
              profit: opp.profit,
              profitMargin: opp.profitMargin,
              confidence: opp.confidence,
              hasRealMatch: opp.profit > -500
            });
          });
        }
        
        setOpportunities(filteredOpportunities);
        setStats({
          totalEbayListings: data.totalEbayListings,
          totalOpportunities: data.totalOpportunities,
          averageProfit: data.averageProfit,
          averageProfitMargin: data.averageProfitMargin
        });
        
        if (filteredOpportunities.length > 0) {
          setSuccessMessage(`Found ${filteredOpportunities.length} profitable arbitrage opportunities!`);
        } else {
          setSuccessMessage('Search completed, but no opportunities found matching your criteria. Try adjusting your filters.');
        }
      } else {
        console.error(`❌ API returned error:`, data);
        setErrorMessage(data.error || data.message || 'Failed to search for opportunities');
      }
    } catch (error) {
      console.error('❌ Search error:', error);
      setErrorMessage('An error occurred while searching. Please try again.');
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`🏁 Search completed in ${totalTime}ms`);
      setIsLoading(false);
      
      if (!errorMessage) {
        // Clear status after a short delay if no errors
        setTimeout(() => {
          setSearchStatus('');
          setSearchProgress({ ebayFound: 0, stockxMatched: 0, currentStep: '' });
        }, 3000);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchArbitrageOpportunities();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-400';
    if (confidence >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 80) return 'High';
    if (confidence >= 60) return 'Medium';
    return 'Low';
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
              eBay → StockX Arbitrage Finder
            </h1>
          </div>
          <p className="text-gray-400 text-lg mb-4">
            Find shoes selling for less on eBay than their market value on StockX
          </p>
          <div className="p-4 bg-gradient-to-r from-blue-900/20 to-emerald-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-300 font-medium">How it works:</p>
                <p className="text-blue-200 text-sm mt-1">
                  This tool searches eBay for shoes and compares their prices to current StockX market prices. 
                  It calculates potential profit including all fees (eBay, PayPal, StockX) and shipping costs. 
                  Look for high-confidence matches with good profit margins.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* StockX Authentication Status */}
        {stockxAuthStatus === 'not_authenticated' && (
          <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-yellow-300 font-medium">StockX Authentication Required</p>
                  <p className="text-yellow-200 text-sm">
                    Connect to StockX to see price comparisons and profit calculations
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  const returnUrl = encodeURIComponent(window.location.href);
                  window.location.href = `/api/stockx/auth?returnTo=${returnUrl}`;
                }}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
              >
                Connect StockX
              </button>
            </div>
          </div>
        )}

        {stockxAuthStatus === 'authenticated' && (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-300 font-medium">StockX Connected</p>
              <span className="text-green-200 text-sm">• Ready to find arbitrage opportunities</span>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="space-y-4 mb-6 sm:mb-8">
          {/* Main Search */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search for Shoes
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Jordan 1, Yeezy 350, Nike Dunk"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                <span>💡 Try:</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('Jordan 1 High')}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Jordan 1 High
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('Yeezy 350 V2')}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Yeezy 350 V2
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('Nike Dunk Low')}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Nike Dunk Low
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Min Profit %
              </label>
              <input
                type="number"
                value={minProfitMargin}
                onChange={(e) => setMinProfitMargin(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="15"
                min="0"
                max="100"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={searchArbitrageOpportunities}
                disabled={isLoading || !searchQuery.trim()}
                className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Find Deals
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Advanced Filters */}
          <div className="border-t border-gray-700 pt-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
            >
              <Filter className="w-4 h-4" />
              Advanced Filters
              {showFilters ? '▼' : '▶'}
            </button>
            
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 bg-gray-800/50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max eBay Price: ${maxPrice}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>$50</span>
                    <span>$2000</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Match Confidence: {minConfidence}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={minConfidence}
                    onChange={(e) => setMinConfidence(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Item Condition
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={newItemsOnly}
                        onChange={(e) => setNewItemsOnly(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      New items only
                    </label>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    StockX only accepts new items
                  </div>
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center space-x-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={authenticityGuaranteeOnly}
                        onChange={(e) => setAuthenticityGuaranteeOnly(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                      />
                      Authenticity Guarantee only
                    </label>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Only show eBay items with authenticity guarantee
                  </div>
                </div>
                <div className="flex items-end">
                  <div className="text-sm text-gray-400 w-full">
                    <p className="mb-1">🎯 Filter Tips:</p>
                    <ul className="text-xs space-y-0.5">
                      <li>• Higher confidence = better matches</li>
                      <li>• Lower max price = more budget-friendly deals</li>
                      <li>• Higher profit % = more selective results</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Loading State with Progress */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            
            {/* Dynamic Status Message */}
            <p className="text-gray-300 text-lg mb-2">
              {searchStatus || 'Searching eBay and cross-referencing with StockX prices...'}
            </p>
            
            {/* Progress Details */}
            {searchProgress.currentStep && (
              <div className="max-w-md mx-auto">
                <div className="bg-gray-800 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Current Step:</span>
                    <span className="text-blue-300">{searchProgress.currentStep}</span>
                  </div>
                  
                  {searchProgress.ebayFound > 0 && (
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-400">eBay Listings Found:</span>
                      <span className="text-green-400">{searchProgress.ebayFound}</span>
                    </div>
                  )}
                  
                  {searchProgress.stockxMatched > 0 && (
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-400">StockX Matches:</span>
                      <span className="text-emerald-400">{searchProgress.stockxMatched}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <p className="text-gray-400 text-sm">This may take 30-60 seconds</p>
          </div>
        )}

        {/* Stats */}
        {stats && opportunities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">eBay Listings</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.totalEbayListings}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-blue-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Opportunities</p>
                  <p className="text-2xl font-bold text-emerald-400">{opportunities.length}</p>
                </div>
                <Target className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Profit</p>
                  <p className="text-2xl font-bold text-green-400">
                    {formatCurrency(stats.averageProfit)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Margin</p>
                  <p className="text-2xl font-bold text-cyan-400">
                    {stats.averageProfitMargin.toFixed(1)}%
                  </p>
                </div>
                <Percent className="w-8 h-8 text-cyan-400" />
              </div>
            </div>
          </div>
        )}

        {/* Opportunities List */}
        {opportunities.length > 0 && (
          <div className="space-y-6">
            {opportunities.map((opportunity, index) => (
              <div key={`${opportunity.ebayListing.itemId}-${index}`} className="bg-gray-800 rounded-lg p-6">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={opportunity.ebayListing.image}
                      alt={opportunity.ebayListing.title}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder-shoe.png';
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-white truncate mb-1">
                        {opportunity.ebayListing.title}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        Seller: {opportunity.ebayListing.seller} • Condition: {opportunity.ebayListing.condition}
                      </p>
                      {opportunity.matchedProduct && (
                        <p className="text-emerald-400 text-sm mt-1">
                          📈 Matched to: {opportunity.matchedProduct}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-400">
                      {formatCurrency(opportunity.profit)}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {opportunity.profitMargin.toFixed(1)}% profit
                    </p>
                  </div>
                </div>

                {/* Price Breakdown */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                  <div className="text-center p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                    <p className="text-xs text-blue-300 mb-1">eBay Price</p>
                    <p className="text-lg font-semibold text-blue-400">
                      {formatCurrency(opportunity.ebayListing.price)}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-700 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Total Cost</p>
                    <p className="text-lg font-semibold text-orange-400">
                      {formatCurrency(opportunity.totalCost)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Inc. fees & shipping</p>
                  </div>
                  <div className="text-center p-3 bg-emerald-900/30 border border-emerald-500/30 rounded-lg">
                    <p className="text-xs text-emerald-300 mb-1">StockX Ask</p>
                    <p className="text-lg font-semibold text-emerald-400">
                      {formatCurrency(opportunity.stockxData?.lowestAsk || 0)}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-gray-700 rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Net Revenue</p>
                    <p className="text-lg font-semibold text-cyan-400">
                      {formatCurrency(opportunity.netRevenue)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">After StockX fees</p>
                  </div>
                  <div className="text-center p-3 bg-green-900/30 border border-green-500/30 rounded-lg">
                    <p className="text-xs text-green-300 mb-1">Profit</p>
                    <p className="text-lg font-semibold text-green-400">
                      {formatCurrency(opportunity.profit)}
                    </p>
                    <p className="text-xs text-green-300 mt-1">ROI: {opportunity.roi.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Match Confidence and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Star className={`w-4 h-4 ${getConfidenceColor(opportunity.confidence)}`} />
                      <span className="text-sm text-gray-300">
                        Match Confidence: 
                      </span>
                      <span className={`text-sm font-semibold ${getConfidenceColor(opportunity.confidence)}`}>
                        {opportunity.confidence}% ({getConfidenceLabel(opportunity.confidence)})
                      </span>
                    </div>
                    {opportunity.stockxData && (
                      <div className="text-sm text-gray-400">
                        Size: {opportunity.stockxData.size}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={() => window.open(opportunity.ebayListing.url, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View on eBay
                    </button>
                    {opportunity.stockxData && (
                      <button
                        onClick={() => {
                          const stockxUrl = `https://stockx.com/search?s=${encodeURIComponent(opportunity.matchedProduct || '')}`;
                          window.open(stockxUrl, '_blank');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <TrendingUp className="w-4 h-4" />
                        View on StockX
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && opportunities.length === 0 && !errorMessage && searchQuery && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No Profitable Opportunities Found</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                We searched eBay but couldn't find any shoes that would be profitable to flip on StockX 
                with your current criteria. Try adjusting your filters or searching for different products.
              </p>
            </div>
          </div>
        )}

        {/* Initial State */}
        {!isLoading && opportunities.length === 0 && !searchQuery && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">💎</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Find Profitable Deals</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Search for popular shoe models to find deals on eBay that you could profit from by selling on StockX. 
                We'll analyze prices, fees, and shipping to calculate your potential profit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EbayStockXArbitrage;
