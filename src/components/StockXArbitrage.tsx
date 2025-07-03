'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, TrendingUp, DollarSign, ExternalLink, Search, AlertCircle, BarChart3, Clock, TrendingDown, LogIn, CheckCircle } from 'lucide-react';

interface HistoricalSales {
  totalSales: number;
  averagePrice: number;
  lowestSale: number;
  highestSale: number;
  lastSalePrice: number;
  lastSaleDate: string;
  priceHistory: Array<{
    week: string;
    averagePrice: number;
    salesCount: number;
  }>;
  salesVolume: number;
  trendDirection: 'up' | 'down' | 'stable';
  priceChangePercent: number;
  isGenerated?: boolean;
}

interface ArbitrageOpportunity {
  id: string;
  productName: string;
  imageUrl: string;
  productId: string;
  variantId: string;
  size: string;
  lowestAsk: number;
  highestBid: number;
  spread: number;
  profitMargin: number;
  stockxUrl: string;
  brand: string;
  historicalSales?: HistoricalSales;
}

const StockXArbitrage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSpreadPercentage, setMinSpreadPercentage] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check for success message on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'true') {
      setSuccessMessage('Successfully authenticated with StockX! You can now search for arbitrage opportunities.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('note');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
  }, []);

  const generateStockXUrl = (productName: string, variantId: string) => {
    // Convert product name to URL slug
    const slug = productName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    
    // StockX URL format typically includes the variant/size in the URL path
    return `https://stockx.com/${slug}`;
  };

  const handleStockXLogin = () => {
    // Store the current page URL to redirect back after authentication
    const currentUrl = window.location.href;
    const authUrl = `/api/stockx/auth?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = authUrl;
  };

  const searchArbitrageOpportunities = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      setIsAuthError(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsAuthError(false);
    setSuccessMessage(null); // Clear any success message when searching
    setOpportunities([]);

    try {
      const response = await fetch(
        `/api/stockx/search?query=${encodeURIComponent(searchQuery)}&limit=50&arbitrageMode=true&minSpreadPercent=${minSpreadPercentage}`
      );
      const data = await response.json();

      if (!response.ok) {
        let errorMessage = 'Failed to search products';
        let isAuth = false;
        
        if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (response.status === 401) {
          errorMessage = 'Please authenticate with StockX first';
          isAuth = true;
        } else if (response.status === 403) {
          errorMessage = 'Access to this StockX endpoint is restricted.';
        } else if (response.status >= 500) {
          errorMessage = 'StockX servers are experiencing issues. Please try again later.';
        }
        
        setIsAuthError(isAuth);
        throw new Error(data.message || errorMessage);
      }

      if (!data.success || !data.data?.products) {
        throw new Error('No products found');
      }

      // Products are already processed as individual variant opportunities
      const foundOpportunities: ArbitrageOpportunity[] = data.data.products.map((opportunity: any) => ({
        id: opportunity.id,
        productName: opportunity.title,
        imageUrl: opportunity.imageUrl,
        productId: opportunity.productId,
        variantId: opportunity.variantId,
        size: opportunity.size,
        lowestAsk: opportunity.lowestAsk,
        highestBid: opportunity.highestBid,
        spread: opportunity.spread,
        profitMargin: Math.round(opportunity.spreadPercent * 100) / 100,
        stockxUrl: opportunity.stockxUrl,
        brand: opportunity.brand,
        historicalSales: opportunity.historicalSales
      }));

      setOpportunities(foundOpportunities);

      if (foundOpportunities.length === 0) {
        setErrorMessage(`No arbitrage opportunities found with at least ${minSpreadPercentage}% spread. Try lowering the minimum spread percentage.`);
      }

    } catch (error) {
      console.error('Search error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred while searching');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchArbitrageOpportunities();
    }
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <ArrowLeftRight className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              StockX Arbitrage Finder
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Find profitable arbitrage opportunities by analyzing bid-ask spreads for specific sizes within StockX
          </p>
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-blue-300 font-medium">How it works:</p>
                <p className="text-blue-200 text-sm mt-1">
                  This tool analyzes each size variant individually to find specific arbitrage opportunities. Each result shows a specific product and size where you could potentially place a bid at the highest bid price and then sell at the lowest ask price for a profit.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Search Products
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="e.g., Jordan 1, Denim Tears, Nike"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Minimum Spread (%)
            </label>
            <input
              type="number"
              value={minSpreadPercentage}
              onChange={(e) => setMinSpreadPercentage(Number(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="10"
              min="0"
              max="100"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={searchArbitrageOpportunities}
              disabled={isLoading || !searchQuery.trim()}
              className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              {isLoading ? 'Searching...' : 'Find Opportunities'}
            </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-green-900/20 border border-green-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <p className="text-green-400">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400" />
                <p className="text-red-400">{errorMessage}</p>
              </div>
              {isAuthError && (
                <button
                  onClick={handleStockXLogin}
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Login to StockX
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {opportunities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Opportunities</p>
                  <p className="text-2xl font-bold text-cyan-400">{opportunities.length}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-cyan-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Profit Margin</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round(opportunities.reduce((sum, opp) => sum + opp.profitMargin, 0) / opportunities.length)}%
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Potential Profit</p>
                  <p className="text-2xl font-bold text-green-400">
                    ${opportunities.reduce((sum, opp) => sum + opp.spread, 0).toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400" />
              </div>
            </div>
          </div>
        )}

        {/* Opportunities List */}
        <div className="space-y-4">
          {opportunities.map((opportunity) => (
            <div key={opportunity.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <img 
                    src={opportunity.imageUrl} 
                    alt={opportunity.productName}
                    className="w-16 h-16 object-cover rounded-lg"
                  />
                  <div>
                    <h3 className="text-xl font-semibold text-white">{opportunity.productName}</h3>
                    <p className="text-gray-400">{opportunity.brand} • {opportunity.size}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400">${opportunity.spread}</p>
                  <p className="text-gray-400">({opportunity.profitMargin}% margin)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Highest Bid</p>
                  <p className="text-lg font-semibold text-green-400">${opportunity.highestBid}</p>
                  <p className="text-xs text-gray-500">Potential buy price</p>
                </div>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-1">Lowest Ask</p>
                  <p className="text-lg font-semibold text-cyan-400">${opportunity.lowestAsk}</p>
                  <p className="text-xs text-gray-500">Potential sell price</p>
                </div>
              </div>

              {/* Historical Sales Data Section */}
              {opportunity.historicalSales && (
                <div className="mb-4 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div className="flex items-center gap-2 mb-3">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    <h4 className="text-lg font-semibold text-white">90-Day Sales History</h4>
                    {opportunity.historicalSales.isGenerated && (
                      <span className="text-xs bg-yellow-900/20 text-yellow-400 px-2 py-1 rounded border border-yellow-500/30">
                        Simulated Data
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="text-center p-3 bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Total Sales</p>
                      <p className="text-lg font-semibold text-white">{opportunity.historicalSales.totalSales}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Avg Price</p>
                      <p className="text-lg font-semibold text-blue-400">${opportunity.historicalSales.averagePrice}</p>
                    </div>
                    <div className="text-center p-3 bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Last Sale</p>
                      <p className="text-lg font-semibold text-emerald-400">${opportunity.historicalSales.lastSalePrice}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(opportunity.historicalSales.lastSaleDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-center p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {opportunity.historicalSales.trendDirection === 'up' && (
                          <TrendingUp className="w-4 h-4 text-green-400" />
                        )}
                        {opportunity.historicalSales.trendDirection === 'down' && (
                          <TrendingDown className="w-4 h-4 text-red-400" />
                        )}
                        {opportunity.historicalSales.trendDirection === 'stable' && (
                          <ArrowLeftRight className="w-4 h-4 text-gray-400" />
                        )}
                        <p className="text-xs text-gray-400">Trend</p>
                      </div>
                      <p className={`text-lg font-semibold ${
                        opportunity.historicalSales.priceChangePercent > 0 ? 'text-green-400' : 
                        opportunity.historicalSales.priceChangePercent < 0 ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {opportunity.historicalSales.priceChangePercent > 0 ? '+' : ''}
                        {opportunity.historicalSales.priceChangePercent}%
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-gray-400">Price Range</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-xs text-gray-500">Low</p>
                          <p className="text-sm font-semibold text-red-400">${opportunity.historicalSales.lowestSale}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">High</p>
                          <p className="text-sm font-semibold text-green-400">${opportunity.historicalSales.highestSale}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-gray-400">Sales Activity</span>
                      </div>
                      <p className="text-sm text-blue-400">
                        {opportunity.historicalSales.salesVolume} sales in 90 days
                      </p>
                      <p className="text-xs text-gray-500">
                        Avg: {Math.round(opportunity.historicalSales.salesVolume / 12.9)} per week
                      </p>
                    </div>
                  </div>

                  {/* Simple price history visualization */}
                  {opportunity.historicalSales.priceHistory && opportunity.historicalSales.priceHistory.length > 0 && (
                    <div className="mt-4">
                      <h5 className="text-sm text-gray-400 mb-2">Weekly Price Trend</h5>
                      <div className="flex items-end gap-1 h-16 bg-gray-800 rounded p-2">
                        {opportunity.historicalSales.priceHistory.slice(-8).map((week, index) => {
                          const maxPrice = Math.max(...opportunity.historicalSales!.priceHistory.map(w => w.averagePrice));
                          const height = (week.averagePrice / maxPrice) * 100;
                          return (
                            <div
                              key={index}
                              className="flex-1 bg-blue-500 rounded-sm opacity-70 hover:opacity-100 transition-opacity"
                              style={{ height: `${Math.max(height, 10)}%` }}
                              title={`Week ${week.week}: $${week.averagePrice} (${week.salesCount} sales)`}
                            />
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Last 8 weeks • Hover for details</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  <p>Product ID: {opportunity.productId}</p>
                  <p>Variant ID: {opportunity.variantId}</p>
                </div>
                <a
                  href={opportunity.stockxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  View on StockX
                </a>
              </div>
            </div>
          ))}
        </div>

        {opportunities.length === 0 && !isLoading && !errorMessage && (
          <div className="text-center py-12">
            <ArrowLeftRight className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">Search for Arbitrage Opportunities</h3>
            <p className="text-gray-500">Enter a product name and minimum spread percentage to find profitable opportunities</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXArbitrage; 