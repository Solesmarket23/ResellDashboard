'use client';

import React, { useState } from 'react';
import { Search, TrendingUp, DollarSign, Package, ExternalLink, Loader, AlertCircle, CheckCircle, BarChart3 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface MarketAlert {
  shoe: string;
  brand: string;
  silhoutte: string;
  styleID: string;
  retailPrice: number;
  thumbnail: string;
  links: {
    stockX: string;
    goat: string;
    flightClub: string;
    stadiumGoods: string;
  };
  sizeSpecificData?: {
    size: string;
    prices: {
      stockX: number | null;
      goat: number | null;
      flightClub: number | null;
      stadiumGoods: number | null;
    };
  } | null;
  detailedData?: {
    lowestAsk: number | null;
    highestBid: number | null;
    lastSale: number | null;
    changePercentage: number | null;
    totalSold: number | null;
    volatility: number | null;
  };
}

interface SearchResponse {
  success: boolean;
  data: MarketAlert[];
  searchTerm: string;
  requestedSize: string;
  dataSource: 'official-stockx' | 'sneaks-api' | 'mock';
  note: string;
  timestamp: string;
}

const MarketAlerts = () => {
  const { currentTheme } = useTheme();
  const [itemName, setItemName] = useState('');
  const [size, setSize] = useState('');
  const [results, setResults] = useState<MarketAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchInfo, setSearchInfo] = useState<SearchResponse | null>(null);

  const popularSizes = ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13'];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSearchInfo(null);

    try {
      const response = await fetch('/api/market-alerts/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          itemName: itemName.trim(),
          size: size.trim() || null,
        }),
      });

      const data: SearchResponse = await response.json();

      if (data.success) {
        setResults(data.data || []);
        setSearchInfo(data);
        if (data.data.length === 0) {
          setError('No products found for your search term.');
        }
      } else {
        setError(data.error || 'Failed to fetch market data');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number | null) => {
    return price ? `$${price.toLocaleString()}` : 'N/A';
  };

  const formatPercentage = (percentage: number | null) => {
    if (percentage === null) return 'N/A';
    const sign = percentage >= 0 ? '+' : '';
    return `${sign}${percentage.toFixed(1)}%`;
  };

  const getChangeColor = (percentage: number | null) => {
    if (percentage === null) return 'text-gray-500';
    return percentage >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getDataSourceIcon = (dataSource: string) => {
    switch (dataSource) {
      case 'official-stockx':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'sneaks-api':
        return <BarChart3 className="w-4 h-4 text-blue-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
    }
  };

  const getBestPrice = (prices: any) => {
    const validPrices = Object.values(prices).filter(p => p && typeof p === 'number') as number[];
    return validPrices.length > 0 ? Math.min(...validPrices) : null;
  };

  const getPlatformColor = (platform: string) => {
    const colors = {
      stockX: 'text-green-600 bg-green-50 border-green-200',
      goat: 'text-blue-600 bg-blue-50 border-blue-200',
      flightClub: 'text-purple-600 bg-purple-50 border-purple-200',
      stadiumGoods: 'text-orange-600 bg-orange-50 border-orange-200'
    };
    return colors[platform as keyof typeof colors] || 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <div className={`p-6 ${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border}`}>
      <div className="flex items-center mb-6">
        <TrendingUp className={`w-6 h-6 ${currentTheme.colors.primary.replace('bg-', 'text-')} mr-3`} />
        <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Market Alerts</h2>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-2`}>
              Item Name *
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g., Jordan 1 High OG Chicago"
              className={`w-full px-4 py-2 border ${currentTheme.colors.border} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${currentTheme.colors.background}`}
              required
            />
          </div>
          <div>
            <label className={`block text-sm font-medium ${currentTheme.colors.textSecondary} mb-2`}>
              Size (Optional)
            </label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className={`w-full px-4 py-2 border ${currentTheme.colors.border} rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${currentTheme.colors.background}`}
            >
              <option value="">Any Size</option>
              {popularSizes.map(s => (
                <option key={s} value={s}>US {s}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={loading || !itemName.trim()}
          className={`mt-4 px-6 py-2 ${currentTheme.colors.primary} text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center`}
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Search Market
            </>
          )}
        </button>
      </form>

      {/* Data Source Info */}
      {searchInfo && (
        <div className={`mb-4 p-3 rounded-lg border ${searchInfo.dataSource === 'official-stockx' ? 'bg-green-50 border-green-200' : searchInfo.dataSource === 'sneaks-api' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className="flex items-center">
            {getDataSourceIcon(searchInfo.dataSource)}
            <span className={`ml-2 text-sm font-medium ${searchInfo.dataSource === 'official-stockx' ? 'text-green-800' : searchInfo.dataSource === 'sneaks-api' ? 'text-blue-800' : 'text-orange-800'}`}>
              {searchInfo.note}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-6">
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
            Found {results.length} Results {size && `for Size ${size}`}
          </h3>
          
          {results.map((item, index) => (
            <div key={index} className={`p-6 border ${currentTheme.colors.border} rounded-lg ${currentTheme.colors.background} hover:shadow-md transition-shadow`}>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Product Image */}
                <div className="flex-shrink-0">
                  <img
                    src={item.thumbnail}
                    alt={item.shoe}
                    className="w-32 h-32 object-cover rounded-lg border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-shoe.png';
                    }}
                  />
                </div>

                {/* Product Info */}
                <div className="flex-grow">
                  <div className="mb-4">
                    <h4 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-1`}>{item.shoe}</h4>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>Brand: <strong>{item.brand}</strong></span>
                      <span>Style: <strong>{item.styleID}</strong></span>
                      <span>Retail: <strong>{formatPrice(item.retailPrice)}</strong></span>
                    </div>
                  </div>

                  {/* Market Data */}
                  {item.detailedData && (
                    <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Lowest Ask</div>
                        <div className="font-semibold text-green-600">{formatPrice(item.detailedData.lowestAsk)}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Highest Bid</div>
                        <div className="font-semibold text-blue-600">{formatPrice(item.detailedData.highestBid)}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Last Sale</div>
                        <div className="font-semibold">{formatPrice(item.detailedData.lastSale)}</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">Change</div>
                        <div className={`font-semibold ${getChangeColor(item.detailedData.changePercentage)}`}>
                          {formatPercentage(item.detailedData.changePercentage)}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Size-Specific Pricing */}
                  {item.sizeSpecificData && (
                    <div className="mb-4">
                      <h5 className={`font-medium ${currentTheme.colors.textPrimary} mb-3`}>
                        Size {item.sizeSpecificData.size} Prices:
                      </h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {Object.entries(item.sizeSpecificData.prices).map(([platform, price]) => (
                          <div key={platform} className={`p-3 rounded-lg border ${getPlatformColor(platform)}`}>
                            <div className="text-xs font-medium capitalize mb-1">{platform}</div>
                            <div className="font-semibold">{formatPrice(price as number)}</div>
                          </div>
                        ))}
                      </div>
                      {getBestPrice(item.sizeSpecificData.prices) && (
                        <div className="mt-3 p-2 bg-green-100 border border-green-300 rounded text-center">
                          <span className="text-sm font-medium text-green-800">
                            Best Price: {formatPrice(getBestPrice(item.sizeSpecificData.prices))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Platform Links */}
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(item.links).map(([platform, url]) => (
                      url && (
                        <a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg border ${getPlatformColor(platform)} hover:opacity-80 transition-opacity`}
                        >
                          {platform.charAt(0).toUpperCase() + platform.slice(1)}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && !error && (
        <div className="text-center py-12">
          <Package className={`w-16 h-16 ${currentTheme.colors.textSecondary} mx-auto mb-4 opacity-50`} />
          <p className={`${currentTheme.colors.textSecondary} text-lg mb-2`}>
            Search for sneakers to see live market data
          </p>
          <p className={`${currentTheme.colors.textSecondary} text-sm`}>
            Get real-time prices from StockX, GOAT, Flight Club, and Stadium Goods
          </p>
        </div>
      )}
    </div>
  );
};

export default MarketAlerts; 