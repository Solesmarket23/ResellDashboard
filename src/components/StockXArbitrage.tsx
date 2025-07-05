'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, ExternalLink, Search, AlertCircle, BarChart3, LogIn, CheckCircle } from 'lucide-react';

// Enhanced placeholder component for StockX products since images aren't publicly accessible
interface FallbackImageProps {
  imageUrls: string[];
  alt: string;
  className: string;
  productTitle?: string;
  brand?: string;
}

const FallbackImage: React.FC<FallbackImageProps> = ({ imageUrls, alt, className, productTitle, brand }) => {
  // Since StockX images aren't publicly accessible, create an informative placeholder
  const getBrandInitial = (brandName?: string) => {
    if (!brandName) return '?';
    return brandName.charAt(0).toUpperCase();
  };

  const getBrandColor = (brandName?: string) => {
    if (!brandName) return 'bg-gray-600';
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-red-600', 
      'bg-yellow-600', 'bg-indigo-600', 'bg-pink-600', 'bg-teal-600'
    ];
    let hash = 0;
    for (let i = 0; i < brandName.length; i++) {
      hash = brandName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={`${className} ${getBrandColor(brand)} flex items-center justify-center rounded-lg`}>
      <div className="text-center">
        <div className="text-white font-bold text-lg">
          {getBrandInitial(brand)}
        </div>
        <div className="text-white text-xs opacity-75">
          StockX
        </div>
      </div>
    </div>
  );
};

// Removed HistoricalSales interface - this data is not available from StockX API

interface ArbitrageOpportunity {
  productId: string;
  variantId: string;
  title: string;
  size: string;
  highestBid: number;
  lowestAsk: number;
  spread: number;
  spreadPercent: number;
  imageUrl: string;
  imageUrls?: string[]; // Array of fallback image URLs
  stockxUrl: string;
  brand: string;
  colorway: string;
  releaseDate: string | null;
  retailPrice: number | null;
}

const StockXArbitrage: React.FC = () => {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [minSpreadPercentage, setMinSpreadPercentage] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false); // Track if user has performed a search attempt

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
    
    // Check for disconnect success message
    if (urlParams.get('disconnected') === 'true') {
      setSuccessMessage('StockX tokens cleared successfully! You can now re-authenticate.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('disconnected');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 5 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    }
    
    // Check for manual token clear success message
    if (urlParams.get('tokens_cleared') === 'true') {
      setSuccessMessage('All StockX tokens have been cleared! Please click "Login to StockX" to authenticate with fresh tokens.');
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('tokens_cleared');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-dismiss the success message after 7 seconds (longer for more detailed message)
      setTimeout(() => {
        setSuccessMessage(null);
      }, 7000);
    }
    
    // Check for authentication error from callback
    const error = urlParams.get('error');
    const needReauth = urlParams.get('need_reauth') === 'true';
    
    if (error === 'invalid_tokens' && needReauth) {
      setErrorMessage('Your StockX authentication has expired. Please login again to continue.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('need_reauth');
      window.history.replaceState({}, '', url.toString());
    } else if (error === 'no_tokens' && needReauth) {
      setErrorMessage('You need to authenticate with StockX first to use this feature.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('need_reauth');
      window.history.replaceState({}, '', url.toString());
    } else if (error === 'state_mismatch') {
      setErrorMessage('Authentication security check failed. Please try logging in again.');
      setIsAuthError(true);
      // Clear the URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
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

  const handleClearTokens = () => {
    // Clear all StockX tokens and force re-authentication
    const currentUrl = window.location.href;
    const disconnectUrl = `/api/stockx/disconnect?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = disconnectUrl;
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
    setSuccessMessage(null);
    setOpportunities([]); // Clear previous results
    setHasSearched(true);

    try {
      // Build query parameters for streaming
      const params = new URLSearchParams({
        query: searchQuery,
        limit: '50',
        arbitrageMode: 'true',
        minSpreadPercent: minSpreadPercentage.toString(),
        streaming: 'true' // Enable streaming
      });

      // Use EventSource for streaming results
      const eventSource = new EventSource(`/api/stockx/search?${params.toString()}`);
      
      let currentOpportunities: ArbitrageOpportunity[] = [];
      let statusMessage = 'Searching...';
      let progressMessage = '';

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'status':
              statusMessage = data.message;
              setSuccessMessage(`📡 ${statusMessage}`);
              break;
              
            case 'progress':
              progressMessage = `Processing ${data.current}/${data.total} products`;
              setSuccessMessage(`🔍 ${progressMessage}... Found ${currentOpportunities.length} opportunities`);
              break;
              
            case 'result':
              // Add new result to the list
              const newOpportunity: ArbitrageOpportunity = {
                productId: data.data.productId,
                variantId: data.data.variantId,
                title: data.data.title,
                size: data.data.size,
                highestBid: data.data.highestBid,
                lowestAsk: data.data.lowestAsk,
                spread: data.data.spread,
                spreadPercent: data.data.spreadPercent,
                imageUrl: data.data.imageUrl,
                imageUrls: data.data.imageUrls || [data.data.imageUrl], // Use fallback array or single URL
                stockxUrl: data.data.stockxUrl,
                brand: data.data.brand,
                colorway: data.data.colorway,
                releaseDate: data.data.releaseDate,
                retailPrice: data.data.retailPrice
              };
              
              currentOpportunities.push(newOpportunity);
              setOpportunities([...currentOpportunities]);
              setSuccessMessage(`🔍 Searching... Found ${currentOpportunities.length} opportunities so far`);
              break;
              
            case 'complete':
              setSuccessMessage(`✅ Search complete! Found ${data.total} arbitrage opportunities.`);
              setIsLoading(false);
              eventSource.close();
              break;
              
            case 'error':
              setErrorMessage(data.message);
              setIsAuthError(data.statusCode === 401);
              setIsLoading(false);
              setHasSearched(true);
              eventSource.close();
              break;
          }
        } catch (error) {
          console.error('Error parsing streaming data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        setErrorMessage('Connection error while searching');
        setIsLoading(false);
        setHasSearched(true);
        eventSource.close();
      };

      // Cleanup function
      const cleanup = () => {
        eventSource.close();
        setIsLoading(false);
      };

      // Set a timeout to prevent indefinite loading
      setTimeout(() => {
        if (eventSource.readyState !== EventSource.CLOSED) {
          cleanup();
          setErrorMessage('Search timeout. Please try again.');
          setHasSearched(true);
        }
      }, 60000); // 60 second timeout

    } catch (error) {
      console.error('Search error:', error);
      setErrorMessage('An error occurred while searching for opportunities');
      setIsLoading(false);
      setHasSearched(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchArbitrageOpportunities();
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
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
        <div className="space-y-4 mb-6 sm:mb-8">
          {/* Primary Search Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400">{errorMessage}</p>
              </div>
              {isAuthError && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={handleClearTokens}
                    className="bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Clear Tokens
                  </button>
                  <button
                    onClick={handleStockXLogin}
                    className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-4 h-4" />
                    Login to StockX
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className="text-gray-300">
              {opportunities.length > 0 
                ? `Streaming results... Found ${opportunities.length} opportunities so far`
                : 'Searching StockX catalog...'
              }
            </p>
          </div>
        )}

        {/* Stats */}
        {opportunities.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
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
                    {Math.round(opportunities.reduce((sum, opp) => sum + opp.spreadPercent, 0) / opportunities.length)}%
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

        {/* Initial State Message - No Search Performed Yet */}
        {!isLoading && opportunities.length === 0 && !errorMessage && !hasSearched && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to Find Arbitrage Opportunities</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                Enter a product name like "Nike", "Jordan 1", or "Denim Tears" and set your minimum spread percentage to discover profitable opportunities.
              </p>
            </div>
          </div>
        )}

        {/* No Results Message - After Search */}
        {!isLoading && opportunities.length === 0 && !errorMessage && hasSearched && (
          <div className="text-center py-12">
            <div className="bg-gray-800 rounded-lg p-8">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-gray-300 mb-2">No Opportunities Found</h3>
              <p className="text-gray-400 max-w-md mx-auto">
                No arbitrage opportunities were found with at least {minSpreadPercentage}% spread. 
                Try lowering the minimum spread percentage or searching for different products.
              </p>
            </div>
          </div>
        )}

        {/* Opportunities List */}
        <div className="space-y-4">
          {opportunities.map((opportunity) => (
            <div key={opportunity.productId} className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <FallbackImage
                    imageUrls={opportunity.imageUrls || [opportunity.imageUrl]}
                    alt={opportunity.title}
                    className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg flex-shrink-0"
                    productTitle={opportunity.title}
                    brand={opportunity.brand}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg sm:text-xl font-semibold text-white truncate">{opportunity.title}</h3>
                    <p className="text-gray-400 text-sm sm:text-base">{opportunity.brand} • {opportunity.size}</p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xl sm:text-2xl font-bold text-green-400">${opportunity.spread}</p>
                  <p className="text-gray-400 text-sm">({opportunity.spreadPercent}% margin)</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4">
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Highest Bid</p>
                  <p className="text-base sm:text-lg font-semibold text-green-400">${opportunity.highestBid}</p>
                  <p className="text-xs text-gray-500">Potential buy price</p>
                </div>
                <div className="text-center p-3 bg-gray-700 rounded-lg">
                  <p className="text-xs sm:text-sm text-gray-400 mb-1">Lowest Ask</p>
                  <p className="text-base sm:text-lg font-semibold text-cyan-400">${opportunity.lowestAsk}</p>
                  <p className="text-xs text-gray-500">Potential sell price</p>
                </div>
              </div>

              {/* Real StockX Market Data - No Historical Sales Available */}
              <div className="mb-4 p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  <h4 className="text-lg font-semibold text-white">Live Market Data</h4>
                  <span className="text-xs bg-green-900/20 text-green-400 px-2 py-1 rounded border border-green-500/30">
                    Real StockX API
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-gray-400">Current Spread</span>
                    </div>
                    <p className="text-2xl font-bold text-green-400">${opportunity.spread}</p>
                    <p className="text-sm text-gray-500">Potential profit per sale</p>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-gray-400">Profit Margin</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">{opportunity.spreadPercent}%</p>
                    <p className="text-sm text-gray-500">Based on current market</p>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-900/20 rounded-lg border border-yellow-500/30">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm text-yellow-400">
                      <strong>Note:</strong> StockX API doesn't provide historical sales data. Only current market data is available.
                    </p>
                  </div>
                </div>
              </div>

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
      </div>
    </div>
  );
};

export default StockXArbitrage; 