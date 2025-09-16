'use client';

import React, { useState, useEffect } from 'react';

interface EbayItem {
  itemId: string;
  title: string;
  priceValue: string;
  priceCurrency: string;
  gtin: string;
  brand: string;
  mpn: string;
  condition: string;
  imageUrl: string;
  itemWebUrl: string;
  sellerUsername: string;
  availability: string;
  categoryId: string;
  category: string;
  estimatedAvailableQuantity?: number;
  shippingCost?: string;
  returnsAccepted?: boolean;
  sellerFeedbackScore?: string;
  sellerFeedbackPercentage?: string;
}

interface StockXProduct {
  id: string;
  title: string;
  brand: string;
  price: number;
  lowestAsk: number;
  highestBid: number;
  lastSale: number;
  urlKey: string;
  styleCode?: string;
  gtin?: string;
}

interface ArbitrageOpportunity {
  ebayItem: EbayItem;
  stockxProduct: StockXProduct;
  profit: number;
  profitPercentage: number;
  confidence: number;
  searchMethod: 'gtin' | 'stylecode' | 'text';
  gtin?: string;
  styleCode?: string;
  matchedProduct: string;
  usedQuery: string;
}

interface ScannerResponse {
  success: boolean;
  message: string;
  totalScanned: number;
  filtered: number;
  opportunities: ArbitrageOpportunity[];
  thresholds: {
    minProfit: number;
    minProfitPercentage: number;
    maxEbayPrice: number;
    minEbayPrice: number;
  };
}

export default function ProfitOpportunityScanner() {
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalScanned: number;
    filtered: number;
    opportunities: number;
  } | null>(null);
  const [thresholds, setThresholds] = useState<{
    minProfit: number;
    minProfitPercentage: number;
    maxEbayPrice: number;
    minEbayPrice: number;
  } | null>(null);

  const scanForOpportunities = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/ebay-feed-scanner?limit=1000&minProfit=50');
      const data: ScannerResponse = await response.json();
      
      if (data.success) {
        setOpportunities(data.opportunities);
        setStats({
          totalScanned: data.totalScanned,
          filtered: data.filtered,
          opportunities: data.opportunities.length
        });
        setThresholds(data.thresholds);
      } else {
        setError(data.message || 'Failed to scan for opportunities');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Scanner error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getProfitBadgeColor = (profit: number, profitPercentage: number) => {
    if (profit >= 200 && profitPercentage >= 50) return 'bg-green-100 text-green-800';
    if (profit >= 100 && profitPercentage >= 30) return 'bg-blue-100 text-blue-800';
    if (profit >= 50 && profitPercentage >= 20) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-100 text-green-800';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getSearchMethodBadge = (method: string) => {
    const colors = {
      gtin: 'bg-purple-100 text-purple-800',
      stylecode: 'bg-indigo-100 text-indigo-800',
      text: 'bg-gray-100 text-gray-800'
    };
    return colors[method as keyof typeof colors] || colors.text;
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              💰 Profit Opportunity Scanner
            </h1>
            <p className="text-gray-600">
              Automated discovery of profitable eBay → StockX flipping opportunities
            </p>
          </div>
          <button
            onClick={scanForOpportunities}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            {loading ? '🔄 Scanning...' : '🚀 Scan for Opportunities'}
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.totalScanned}</div>
              <div className="text-sm text-blue-800">Items Scanned</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{stats.filtered}</div>
              <div className="text-sm text-yellow-800">High-Potential Items</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.opportunities}</div>
              <div className="text-sm text-green-800">Profitable Opportunities</div>
            </div>
          </div>
        )}

        {thresholds && (
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold text-gray-900 mb-2">Filtering Criteria</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Min Profit:</span>
                <span className="ml-2 font-semibold">${thresholds.minProfit}</span>
              </div>
              <div>
                <span className="text-gray-600">Min Margin:</span>
                <span className="ml-2 font-semibold">{thresholds.minProfitPercentage}%</span>
              </div>
              <div>
                <span className="text-gray-600">Max eBay Price:</span>
                <span className="ml-2 font-semibold">${thresholds.maxEbayPrice}</span>
              </div>
              <div>
                <span className="text-gray-600">Min eBay Price:</span>
                <span className="ml-2 font-semibold">${thresholds.minEbayPrice}</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
      </div>

      {opportunities.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900">
            🎯 Top Profit Opportunities
          </h2>
          
          {opportunities.map((opportunity, index) => (
            <div key={index} className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* eBay Item */}
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <img
                      src={opportunity.ebayItem.imageUrl || '/placeholder-shoe.png'}
                      alt={opportunity.ebayItem.title}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-2">
                        {opportunity.ebayItem.title}
                      </h3>
                      <div className="space-y-1 text-sm text-gray-600">
                        <div>Brand: {opportunity.ebayItem.brand}</div>
                        <div>Condition: {opportunity.ebayItem.condition}</div>
                        <div>Seller: {opportunity.ebayItem.sellerUsername}</div>
                        <div>Feedback: {opportunity.ebayItem.sellerFeedbackPercentage}% ({opportunity.ebayItem.sellerFeedbackScore})</div>
                        {opportunity.ebayItem.gtin && <div>GTIN: {opportunity.ebayItem.gtin}</div>}
                        {opportunity.styleCode && <div>Style: {opportunity.styleCode}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* StockX Match */}
                <div className="flex-1">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">StockX Match</h4>
                    <div className="space-y-1 text-sm">
                      <div className="font-medium">{opportunity.matchedProduct}</div>
                      <div>Lowest Ask: <span className="font-semibold text-green-600">${opportunity.stockxProduct.lowestAsk}</span></div>
                      <div>Highest Bid: <span className="font-semibold text-blue-600">${opportunity.stockxProduct.highestBid}</span></div>
                      <div>Last Sale: <span className="font-semibold text-gray-600">${opportunity.stockxProduct.lastSale}</span></div>
                    </div>
                  </div>
                </div>

                {/* Profit Analysis */}
                <div className="flex-1">
                  <div className="bg-green-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">Profit Analysis</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">eBay Price:</span>
                        <span className="font-semibold">${opportunity.ebayItem.priceValue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">StockX Ask:</span>
                        <span className="font-semibold">${opportunity.stockxProduct.lowestAsk}</span>
                      </div>
                      <div className="border-t pt-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Net Profit:</span>
                          <span className={`font-bold text-lg ${opportunity.profit > 100 ? 'text-green-600' : 'text-blue-600'}`}>
                            ${opportunity.profit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Profit Margin:</span>
                          <span className={`font-semibold ${opportunity.profitPercentage > 30 ? 'text-green-600' : 'text-blue-600'}`}>
                            {opportunity.profitPercentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Badges and Actions */}
              <div className="flex flex-wrap items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <div className="flex flex-wrap gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getProfitBadgeColor(opportunity.profit, opportunity.profitPercentage)}`}>
                    ${opportunity.profit.toFixed(0)} Profit
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getConfidenceBadgeColor(opportunity.confidence)}`}>
                    {opportunity.confidence}% Match
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSearchMethodBadge(opportunity.searchMethod)}`}>
                    {opportunity.searchMethod.toUpperCase()}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <a
                    href={opportunity.ebayItem.itemWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    View on eBay
                  </a>
                  <a
                    href={`https://stockx.com/${opportunity.stockxProduct.urlKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    View on StockX
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {opportunities.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🔍</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Opportunities Found</h3>
          <p className="text-gray-600 mb-4">
            Click "Scan for Opportunities" to start finding profitable flips
          </p>
        </div>
      )}
    </div>
  );
}
