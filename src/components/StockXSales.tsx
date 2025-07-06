import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Package, Clock, CheckCircle, AlertCircle, Filter, ExternalLink, RefreshCw, List, Search, Calculator, BarChart3 } from 'lucide-react';

interface SaleData {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    brand: string;
    colorway: string;
    imageUrl: string;
    sku: string;
    urlKey: string;
  };
  variant: {
    id: string;
    size: string;
    condition: string;
  };
  pricing: {
    salePrice: number;
    processingFee: number;
    transactionFee: number;
    shippingFee: number;
    totalFees: number;
    payout: number;
    currency: string;
  };
  shipping: {
    trackingNumber: string;
    shippingMethod: string;
    shippedAt: string;
    deliveredAt: string;
  };
  buyer: {
    region: string;
  };
  profitCalculation: {
    salePrice: number;
    totalFees: number;
    netPayout: number;
  };
}

const StockXSales: React.FC = () => {
  const [sales, setSales] = useState<SaleData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAuthError, setIsAuthError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);

  // Stats calculation
  const stats = React.useMemo(() => {
    const completedSales = sales.filter(sale => sale.status === 'completed');
    const totalSales = completedSales.length;
    const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.pricing.salePrice, 0);
    const totalFees = completedSales.reduce((sum, sale) => sum + sale.pricing.totalFees, 0);
    const totalPayout = completedSales.reduce((sum, sale) => sum + sale.pricing.netPayout, 0);
    const avgSalePrice = totalSales > 0 ? totalRevenue / totalSales : 0;
    const totalProfit = totalPayout; // Would need cost tracking for real profit

    return {
      totalSales,
      totalRevenue,
      totalFees,
      totalPayout,
      avgSalePrice,
      totalProfit
    };
  }, [sales]);

  const fetchSales = async (page: number = 1, status: string = '') => {
    setIsLoading(true);
    setErrorMessage('');
    setIsAuthError(false);

    try {
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString()
      });

      if (status) {
        params.set('status', status);
      }

      const response = await fetch(`/api/stockx/sales?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setIsAuthError(true);
          setErrorMessage(data.message || 'Authentication required');
        } else if (response.status === 403) {
          setErrorMessage('Access forbidden - you may need seller permissions');
        } else {
          setErrorMessage(data.details || 'Failed to fetch sales data');
        }
        return;
      }

      if (data.success) {
        setSales(data.data || []);
        setTotalCount(data.totalCount || 0);
        setCurrentPage(page);
        
        if (data.data?.length === 0) {
          setErrorMessage('No sales found. Make sure you have completed sales on StockX.');
        }
      } else {
        setErrorMessage(data.error || 'Failed to fetch sales data');
      }

    } catch (error) {
      console.error('Error fetching sales:', error);
      setErrorMessage('Network error - please try again');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStockXLogin = () => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `/api/stockx/auth?returnTo=${returnUrl}`;
  };

  const handleClearTokens = async () => {
    try {
      await fetch('/api/stockx/clear-tokens');
      setErrorMessage('Tokens cleared. Please login again.');
      setIsAuthError(true);
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  };

  const handleFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    fetchSales(1, newStatus);
  };

  const testStockXEndpoints = async () => {
    try {
      const response = await fetch('/api/stockx/test-sales');
      const data = await response.json();
      
      console.log('🧪 StockX API Test Results:', data);
      
      if (data.results?.successful?.length > 0) {
        alert(`✅ Found ${data.results.successful.length} working endpoints! Check console for details.`);
      } else if (data.results?.forbidden?.length > 0) {
        alert(`⚠️ All endpoints require seller permissions. You need a verified StockX seller account.`);
      } else {
        alert(`❌ No accessible endpoints found. Check console for detailed results.`);
      }
    } catch (error) {
      console.error('Error testing endpoints:', error);
      alert('❌ Failed to test endpoints. Check console for details.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'text-green-400 bg-green-900/20 border-green-500/30';
      case 'pending': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
      case 'cancelled': return 'text-red-400 bg-red-900/20 border-red-500/30';
      case 'shipped': return 'text-blue-400 bg-blue-900/20 border-blue-500/30';
      default: return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'shipped': return <Package className="w-4 h-4" />;
      default: return <AlertCircle className="w-4 h-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount || 0);
  };

  // Disabled auto-loading to prevent 403 errors
  // Users can manually click "Load Sales" if they have seller permissions
  // useEffect(() => {
  //   fetchSales(1, statusFilter);
  // }, []);

  return (
    <div className="p-4 sm:p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-green-400" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              My StockX Sales
            </h1>
          </div>
          <p className="text-gray-400 text-lg">
            Track your StockX sales, earnings, and order status
          </p>
        </div>

        {/* Manual Load Button */}
        {!isLoading && sales.length === 0 && !errorMessage && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 mb-6 text-center">
            <h3 className="text-blue-400 font-semibold mb-3">📊 Sales Data</h3>
            <p className="text-blue-300 mb-4">
              Click below to load your StockX sales history. This requires verified seller permissions.
            </p>
            <button
              onClick={() => fetchSales(1, statusFilter)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Load Sales Data
            </button>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400">{errorMessage}</p>
              </div>
              
              {/* Special handling for 403 Forbidden */}
              {errorMessage.includes('Access forbidden') && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mt-2">
                  <h4 className="text-yellow-400 font-semibold mb-2">🔒 StockX Seller API Access Required</h4>
                  <p className="text-yellow-300 text-sm mb-3">
                    Based on official StockX API documentation, this is a <strong>seller management API</strong> designed for active StockX sellers to manage their listings and orders.
                  </p>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-3">
                    <h5 className="text-blue-400 font-medium mb-2">📋 What This API Is For:</h5>
                    <div className="space-y-1 text-xs text-blue-200">
                      <p>• Managing high-volume listings and asks</p>
                      <p>• Tracking orders and fulfillment</p>
                      <p>• Inventory management across platforms</p>
                      <p>• Integration with seller business systems</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-yellow-200">
                    <p className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      <strong>Step 1:</strong> Apply at <a href="https://stockx.com/sell" target="_blank" className="text-yellow-400 underline">stockx.com/sell</a>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      <strong>Step 2:</strong> Complete seller verification (ID, address, etc.)
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      <strong>Step 3:</strong> Request developer API access at <a href="mailto:developersupport@stockx.com" className="text-yellow-400 underline">developersupport@stockx.com</a>
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                                             <strong>Step 4:</strong> Start selling to generate sales data
                     </p>
                   </div>
                   <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-3 mt-3">
                     <h5 className="text-gray-300 font-medium mb-2">⚡ API Specifications:</h5>
                     <div className="space-y-1 text-xs text-gray-400">
                       <p>• Rate Limit: 25,000 requests/day, 1 request/second</p>
                       <p>• Authentication: OAuth 2.0 + API Key</p>
                       <p>• Endpoints: /v2/selling/listings, /v2/selling/orders</p>
                       <p>• Format: JSON REST API</p>
                     </div>
                   </div>
                 </div>
               )}

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
                    <Package className="w-4 h-4" />
                    Login to StockX
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Orders</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => alert('Listings feature coming soon! This will show your active StockX listings.')}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
            >
              <List className="w-4 h-4" />
              View Listings
            </button>
            <button
              onClick={testStockXEndpoints}
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Test API Access
            </button>
            <button
              onClick={() => fetchSales(currentPage, statusFilter)}
              disabled={isLoading}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Stats */}
        {sales.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Sales</p>
                  <p className="text-2xl font-bold text-green-400">{stats.totalSales}</p>
                </div>
                <Package className="w-8 h-8 text-green-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Revenue</p>
                  <p className="text-2xl font-bold text-blue-400">{formatCurrency(stats.totalRevenue)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Payout</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatCurrency(stats.totalPayout)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Avg Sale Price</p>
                  <p className="text-2xl font-bold text-cyan-400">{formatCurrency(stats.avgSalePrice)}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-cyan-400" />
              </div>
            </div>
          </div>
        )}

        {/* Sales List */}
        <div className="space-y-4">
          {sales.map((sale) => (
            <div key={sale.id} className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img 
                    src={sale.product.imageUrl || '/placeholder-shoe.png'} 
                    alt={sale.product.name}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-white truncate">{sale.product.name}</h3>
                    <p className="text-gray-400 text-sm">{sale.product.brand} • Size {sale.variant.size}</p>
                    <p className="text-gray-500 text-xs">Order #{sale.id}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className={`px-3 py-1 rounded-full border text-sm font-medium flex items-center gap-2 ${getStatusColor(sale.status)}`}>
                    {getStatusIcon(sale.status)}
                    {sale.status}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-400">{formatCurrency(sale.pricing.salePrice)}</p>
                    <p className="text-sm text-gray-400">Payout: {formatCurrency(sale.pricing.netPayout)}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Order Date</p>
                  <p className="text-sm text-white">{formatDate(sale.createdAt)}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Fees</p>
                  <p className="text-sm text-white">{formatCurrency(sale.pricing.totalFees)}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Net Payout</p>
                  <p className="text-sm text-green-400 font-semibold">{formatCurrency(sale.pricing.netPayout)}</p>
                </div>
              </div>

              {sale.shipping.trackingNumber && (
                <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <p className="text-sm text-blue-300">
                    <strong>Tracking:</strong> {sale.shipping.trackingNumber}
                  </p>
                  {sale.shipping.shippedAt && (
                    <p className="text-xs text-blue-400 mt-1">
                      Shipped: {formatDate(sale.shipping.shippedAt)}
                    </p>
                  )}
                </div>
              )}

              {sale.product.urlKey && (
                <div className="mt-4 flex justify-end">
                  <a
                    href={`https://stockx.com/${sale.product.urlKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View on StockX
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {sales.length === 0 && !isLoading && !errorMessage && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No Sales Found</h3>
            <p className="text-gray-500">
              {statusFilter 
                ? `No ${statusFilter} orders found. Try changing the filter.`
                : 'Connect your StockX account to view your sales history.'
              }
            </p>
          </div>
        )}

        {/* Alternative Features for Non-Sellers */}
        {errorMessage && errorMessage.includes('Access forbidden') && (
          <div className="bg-gray-800 rounded-lg p-6 mt-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              What You CAN Do With Your Current Access
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Search className="w-5 h-5 text-green-400" />
                  <h4 className="font-semibold text-white">Market Research</h4>
                </div>
                <p className="text-gray-300 text-sm">Search products, view market data, and find arbitrage opportunities</p>
                <button 
                  onClick={() => window.location.href = '/dashboard'} 
                  className="mt-3 text-green-400 text-sm hover:text-green-300 transition-colors"
                >
                  Go to Arbitrage Finder →
                </button>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Calculator className="w-5 h-5 text-blue-400" />
                  <h4 className="font-semibold text-white">Profit Calculator</h4>
                </div>
                <p className="text-gray-300 text-sm">Calculate potential profits including StockX fees and taxes</p>
                <button 
                  onClick={() => window.location.href = '/dashboard'} 
                  className="mt-3 text-blue-400 text-sm hover:text-blue-300 transition-colors"
                >
                  Use Calculator →
                </button>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <BarChart3 className="w-5 h-5 text-purple-400" />
                  <h4 className="font-semibold text-white">Price Monitoring</h4>
                </div>
                <p className="text-gray-300 text-sm">Track price changes and market trends for products you're interested in</p>
                <button 
                  onClick={() => window.location.href = '/dashboard'} 
                  className="mt-3 text-purple-400 text-sm hover:text-purple-300 transition-colors"
                >
                  View Price Monitor →
                </button>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-2">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  <h4 className="font-semibold text-white">Manual Tracking</h4>
                </div>
                <p className="text-gray-300 text-sm">Track your purchases and sales manually until you get seller API access</p>
                <button 
                  onClick={() => alert('Manual sales tracking feature coming soon!')} 
                  className="mt-3 text-orange-400 text-sm hover:text-orange-300 transition-colors"
                >
                  Coming Soon →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalCount > pageSize && (
          <div className="mt-8 flex justify-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchSales(currentPage - 1, statusFilter)}
                disabled={currentPage <= 1 || isLoading}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-50 hover:bg-gray-700 transition-colors"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-400">
                Page {currentPage} of {Math.ceil(totalCount / pageSize)}
              </span>
              <button
                onClick={() => fetchSales(currentPage + 1, statusFilter)}
                disabled={currentPage >= Math.ceil(totalCount / pageSize) || isLoading}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white disabled:opacity-50 hover:bg-gray-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXSales; 