'use client';

import React, { useState } from 'react';
import { ArrowLeftRight, TrendingUp, DollarSign, ExternalLink, Search, AlertCircle } from 'lucide-react';

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
}

const StockXArbitrage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSpreadPercentage, setMinSpreadPercentage] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const searchArbitrageOpportunities = async () => {
    if (!searchQuery.trim()) {
      setErrorMessage('Please enter a search query');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setOpportunities([]);

    try {
      const response = await fetch(
        `/api/stockx/search?query=${encodeURIComponent(searchQuery)}&limit=50&arbitrageMode=true&minSpreadPercent=${minSpreadPercentage}`
      );
      const data = await response.json();

      if (!response.ok) {
        let errorMessage = 'Failed to search products';
        
        if (response.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (response.status === 401) {
          errorMessage = 'Please re-authenticate with StockX';
        } else if (response.status === 403) {
          errorMessage = 'Access to this StockX endpoint is restricted.';
        } else if (response.status >= 500) {
          errorMessage = 'StockX servers are experiencing issues. Please try again later.';
        }
        
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
        brand: opportunity.brand
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

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{errorMessage}</p>
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

              <div className="flex justify-between items-center p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <ArrowLeftRight className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm text-gray-400">Potential Profit:</span>
                  <span className="text-emerald-400 font-semibold">${opportunity.spread} ({opportunity.profitMargin}%)</span>
                </div>
                <a
                  href={opportunity.stockxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
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