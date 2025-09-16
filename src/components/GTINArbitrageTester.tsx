'use client';

import React, { useState } from 'react';

interface ArbitrageOpportunity {
  ebayListing: {
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
  };
  stockxData: {
    lowestAsk: number;
    highestBid: number;
    lastSale: number;
    productId: string;
    variantId: string;
    size: string;
  } | null;
  profit: number;
  profitMargin: number;
  totalCost: number;
  netRevenue: number;
  roi: number;
  matchedProduct?: string;
  confidence: number;
  searchMethod?: 'gtin' | 'stylecode' | 'text';
  gtin?: string;
  styleCode?: string;
}

interface ArbitrageResponse {
  success: boolean;
  opportunities: ArbitrageOpportunity[];
  searchQuery: string;
  totalEbayListings: number;
  totalOpportunities: number;
  averageProfit: number;
  averageProfitMargin: number;
  message?: string;
  error?: string;
  authRequired?: boolean;
}

const GTINArbitrageTester: React.FC = () => {
  const [query, setQuery] = useState('');
  const [minProfitMargin, setMinProfitMargin] = useState(15);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ArbitrageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchArbitrage = async () => {
    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const params = new URLSearchParams({
        query: query.trim(),
        minProfitMargin: minProfitMargin.toString(),
        maxPrice: maxPrice.toString(),
        limit: '20'
      });

      const response = await fetch(`/api/ebay-stockx-arbitrage?${params}`);
      const data = await response.json();

      if (data.authRequired) {
        setError('Please connect your StockX account first to enable price comparisons');
        return;
      }

      if (!data.success) {
        setError(data.error || 'Search failed');
        return;
      }

      setResults(data);
    } catch (err) {
      setError('Failed to search for arbitrage opportunities');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getSearchMethodBadge = (method?: 'gtin' | 'stylecode' | 'text') => {
    if (method === 'gtin') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          🏷️ GTIN Match
        </span>
      );
    } else if (method === 'stylecode') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          🎨 Style Code Match
        </span>
      );
    } else if (method === 'text') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          🔍 Text Match
        </span>
      );
    }
    return null;
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          🏷️ GTIN-Enhanced eBay StockX Arbitrage Finder
        </h2>
        
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">✨ Enhanced Search Features:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Style Code Priority:</strong> Searches by style codes first (required in StockX API) for exact matches</li>
            <li>• <strong>eBay GTIN Search:</strong> Uses eBay's native GTIN search API for precise eBay listings</li>
            <li>• <strong>GTIN Search:</strong> Uses UPC/EAN/GTIN as secondary search method for StockX</li>
            <li>• <strong>Enhanced Validation:</strong> Validates GTIN check digits and style code patterns</li>
            <li>• <strong>Higher Confidence:</strong> Style Code (+25), GTIN (+20), Text (base) confidence scoring</li>
            <li>• <strong>Multiple Formats:</strong> Supports style codes, UPC (12), EAN (13), GTIN-14 (14 digits)</li>
            <li>• <strong>Smart Fallback:</strong> Style Code → GTIN → Text search priority</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Query (try with GTINs/Style Codes)
            </label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., Nike Air Jordan 1, 123456789012, DJ0950-101, M990BK5"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Profit Margin (%)
            </label>
            <input
              type="number"
              value={minProfitMargin}
              onChange={(e) => setMinProfitMargin(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max eBay Price ($)
            </label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={searchArbitrage}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
        >
          {loading ? '🔍 Searching...' : '🚀 Find Arbitrage Opportunities'}
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {results && (
          <div className="mt-6">
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Search Results</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">eBay Listings:</span>
                  <span className="ml-2 font-medium">{results.totalEbayListings}</span>
                </div>
                <div>
                  <span className="text-gray-600">Matches Found:</span>
                  <span className="ml-2 font-medium">{results.totalOpportunities}</span>
                </div>
                <div>
                  <span className="text-gray-600">Avg Profit:</span>
                  <span className="ml-2 font-medium">{formatCurrency(results.averageProfit)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Avg Margin:</span>
                  <span className="ml-2 font-medium">{results.averageProfitMargin.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {results.opportunities.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No arbitrage opportunities found for "{results.searchQuery}"</p>
                <p className="text-sm mt-2">Try different search terms or adjust your filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                {results.opportunities.map((opportunity, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 line-clamp-2">
                          {opportunity.ebayListing.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          {getSearchMethodBadge(opportunity.searchMethod)}
                          {opportunity.gtin && (
                            <span className="text-xs text-gray-500">
                              GTIN: {opportunity.gtin}
                            </span>
                          )}
                          {opportunity.styleCode && (
                            <span className="text-xs text-gray-500">
                              Style: {opportunity.styleCode}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            Confidence: {opportunity.confidence}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">
                          {formatCurrency(opportunity.profit)}
                        </div>
                        <div className="text-sm text-gray-600">
                          {opportunity.profitMargin.toFixed(1)}% margin
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">eBay Price:</span>
                        <div className="font-medium">{formatCurrency(opportunity.ebayListing.price)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Cost:</span>
                        <div className="font-medium">{formatCurrency(opportunity.totalCost)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">StockX Ask:</span>
                        <div className="font-medium">
                          {opportunity.stockxData ? formatCurrency(opportunity.stockxData.lowestAsk) : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Net Revenue:</span>
                        <div className="font-medium">{formatCurrency(opportunity.netRevenue)}</div>
                      </div>
                    </div>

                    {opportunity.matchedProduct && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">StockX Match:</span> {opportunity.matchedProduct}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <a
                        href={opportunity.ebayListing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View on eBay →
                      </a>
                      {opportunity.stockxData && (
                        <a
                          href={`https://stockx.com/search?s=${encodeURIComponent(opportunity.matchedProduct || '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-green-600 hover:text-green-800 text-sm font-medium"
                        >
                          View on StockX →
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GTINArbitrageTester;
