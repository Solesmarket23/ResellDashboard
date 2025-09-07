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
  
  // Filter states
  const [minProfitMargin, setMinProfitMargin] = useState(15);
  const [maxPrice, setMaxPrice] = useState(500);
  const [minConfidence, setMinConfidence] = useState(60);
  const [showFilters, setShowFilters] = useState(false);

  const searchArbitrageOpportunities = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      return;
    }

    console.log(`🔍 Starting eBay-StockX arbitrage search for: "${searchQuery}"`);
    console.log(`📊 Filters: minProfit=${minProfitMargin}%, maxPrice=$${maxPrice}, minConfidence=${minConfidence}%`);

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setOpportunities([]);
    setStats(null);

    const startTime = Date.now();

    try {
      const params = new URLSearchParams({
        query: searchQuery,
        minProfitMargin: minProfitMargin.toString(),
        maxPrice: maxPrice.toString(),
        limit: '30'
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
        
        // TEMPORARILY: Lower confidence filter to see more matches for debugging
        const filteredOpportunities = allOpportunities.filter(
          (opp: ArbitrageOpportunity) => opp.confidence >= Math.min(minConfidence, 25) // Use 25% minimum for debugging
        );
        console.log(`🔍 After confidence filter (≥${Math.min(minConfidence, 25)}% for debugging): ${filteredOpportunities.length} opportunities`);
        
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

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-300">Searching eBay and cross-referencing with StockX prices...</p>
            <p className="text-gray-400 text-sm mt-2">This may take 30-60 seconds</p>
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
