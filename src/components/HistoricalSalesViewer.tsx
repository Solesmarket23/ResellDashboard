'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, DollarSign, Users, BarChart3, Clock, Search, Filter, RefreshCw } from 'lucide-react';

interface HistoricalSale {
  date: string;
  price: number;
  size: string;
  condition: string;
  seller: string;
}

interface PricePoint {
  date: string;
  price: number;
  sales: number;
}

interface HistoricalData {
  recentSales: HistoricalSale[];
  priceHistory: PricePoint[];
  analytics: {
    totalSales: number;
    averagePrice: number;
    highestSale: number;
    lowestSale: number;
    priceRange: {
      min: number;
      max: number;
    };
  };
}

interface HistoricalSalesViewerProps {
  productId: string;
  variantId?: string;
  productName?: string;
  size?: string;
}

const HistoricalSalesViewer: React.FC<HistoricalSalesViewerProps> = ({
  productId,
  variantId,
  productName = 'Product',
  size
}) => {
  const [data, setData] = useState<HistoricalData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('30');
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [sizeFilter, setSizeFilter] = useState<string>('all');

  const fetchHistoricalData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        productId,
        period
      });

      if (variantId) {
        params.set('variantId', variantId);
      }

      const response = await fetch(`/api/stockx/historical-sales?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.message || 'Failed to fetch historical data');
      }
    } catch (err) {
      setError('Network error while fetching data');
      console.error('Error fetching historical sales:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (productId) {
      fetchHistoricalData();
    }
  }, [productId, variantId, period]);

  const filteredSales = data?.recentSales.filter(sale => 
    sizeFilter === 'all' || sale.size === sizeFilter
  ) || [];

  const getUniqueSizes = () => {
    if (!data?.recentSales) return [];
    return [...new Set(data.recentSales.map(sale => sale.size))].sort();
  };

  const getPriceChange = () => {
    if (!data?.priceHistory || data.priceHistory.length < 2) return { change: 0, percentage: 0 };
    
    const recent = data.priceHistory[data.priceHistory.length - 1]?.price || 0;
    const previous = data.priceHistory[data.priceHistory.length - 2]?.price || 0;
    
    const change = recent - previous;
    const percentage = previous > 0 ? (change / previous) * 100 : 0;
    
    return { change, percentage };
  };

  const priceChange = getPriceChange();

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
          <span className="ml-3 text-gray-300">Loading historical sales...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="text-center py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchHistoricalData}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400 text-center py-8">No historical data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Historical Sales</h2>
            <p className="text-gray-400">
              {productName} {size && `• Size ${size}`}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 3 months</option>
              <option value="180">Last 6 months</option>
            </select>
            
            <div className="flex bg-gray-700 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('chart')}
                className={`px-3 py-2 text-sm ${viewMode === 'chart' ? 'bg-blue-500 text-white' : 'text-gray-300'}`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-blue-500 text-white' : 'text-gray-300'}`}
              >
                <Users className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Avg Price</p>
              <p className="text-xl font-bold text-white">${data.analytics.averagePrice}</p>
            </div>
            <DollarSign className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total Sales</p>
              <p className="text-xl font-bold text-white">{data.analytics.totalSales}</p>
            </div>
            <Users className="w-6 h-6 text-green-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Price Range</p>
              <p className="text-xl font-bold text-white">
                ${data.analytics.priceRange.min} - ${data.analytics.priceRange.max}
              </p>
            </div>
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Recent Change</p>
              <p className={`text-xl font-bold ${priceChange.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange.change >= 0 ? '+' : ''}${priceChange.change.toFixed(0)}
              </p>
              <p className={`text-xs ${priceChange.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {priceChange.percentage >= 0 ? '+' : ''}{priceChange.percentage.toFixed(1)}%
              </p>
            </div>
            {priceChange.change >= 0 ? 
              <TrendingUp className="w-6 h-6 text-green-400" /> : 
              <TrendingDown className="w-6 h-6 text-red-400" />
            }
          </div>
        </div>
      </div>

      {/* Chart View */}
      {viewMode === 'chart' && data.priceHistory.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Price History</h3>
          <div className="h-64 flex items-end justify-between gap-1">
            {data.priceHistory.map((point, index) => {
              const maxPrice = Math.max(...data.priceHistory.map(p => p.price));
              const minPrice = Math.min(...data.priceHistory.map(p => p.price));
              const range = maxPrice - minPrice || 1;
              const height = ((point.price - minPrice) / range) * 200 + 20;
              
              return (
                <div key={index} className="flex flex-col items-center group relative">
                  <div
                    className="w-2 bg-gradient-to-t from-blue-500 to-cyan-400 rounded-t hover:from-blue-400 hover:to-cyan-300 transition-colors"
                    style={{ height: `${height}px` }}
                  />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    <div>${point.price}</div>
                    <div>{point.sales} sales</div>
                    <div>{new Date(point.date).toLocaleDateString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-center text-gray-400 text-sm">
            Hover over bars to see details
          </div>
        </div>
      )}

      {/* Recent Sales Table */}
      {viewMode === 'table' && (
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Sales</h3>
            
            <div className="flex items-center gap-3">
              <select
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              >
                <option value="all">All Sizes</option>
                {getUniqueSizes().map(size => (
                  <option key={size} value={size}>Size {size}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 text-gray-400 text-sm">Date</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Price</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Size</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Condition</th>
                  <th className="text-left py-2 text-gray-400 text-sm">Seller</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.slice(0, 20).map((sale, index) => (
                  <tr key={index} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="py-3 text-white text-sm">
                      {new Date(sale.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-green-400 font-semibold">
                      ${sale.price}
                    </td>
                    <td className="py-3 text-white text-sm">
                      {sale.size}
                    </td>
                    <td className="py-3 text-white text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        sale.condition === 'new' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {sale.condition}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400 text-sm font-mono">
                      {sale.seller}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredSales.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                No sales found for the selected filters
              </div>
            )}
            
            {filteredSales.length > 20 && (
              <div className="text-center pt-4 text-gray-400 text-sm">
                Showing first 20 of {filteredSales.length} sales
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoricalSalesViewer;
