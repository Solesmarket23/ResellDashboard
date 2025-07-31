import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Package, Clock, CheckCircle, AlertCircle, Filter, ExternalLink, RefreshCw, Download, Upload } from 'lucide-react';
import StockXPayoutRefresher from './StockXPayoutRefresher';
import { useStockXSales } from '@/lib/hooks/useStockXSales';
import { StockXSale } from '@/lib/types/stockx';

const StockXSalesFromFirebase: React.FC = () => {
  const { 
    sales, 
    loading, 
    error, 
    syncStatus, 
    syncSales, 
    lastSyncTime,
    syncProgress,
    clearStockXSales,
    fixUserIdMismatch
  } = useStockXSales();
  
  const [statusFilter, setStatusFilter] = useState('');
  const [showPayoutRefresher, setShowPayoutRefresher] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Filter sales based on status
  const filteredSales = React.useMemo(() => {
    if (!statusFilter) return sales;
    return sales.filter(sale => sale.status.toLowerCase().includes(statusFilter.toLowerCase()));
  }, [sales, statusFilter]);

  // Stats calculation
  const stats = React.useMemo(() => {
    const completedSales = filteredSales.filter(sale => 
      sale.status === 'PAYOUT_COMPLETED' || sale.status === 'AUTHENTICATED'
    );
    const totalSales = completedSales.length;
    const totalRevenue = completedSales.reduce((sum, sale) => sum + sale.pricing.salePrice, 0);
    const totalFees = completedSales.reduce((sum, sale) => sum + sale.pricing.sellerFees, 0);
    const totalPayout = completedSales.reduce((sum, sale) => sum + sale.pricing.totalPayout, 0);
    const avgSalePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

    return {
      totalSales,
      totalRevenue,
      totalFees,
      totalPayout,
      avgSalePrice
    };
  }, [filteredSales]);

  const handleStockXLogin = () => {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `/api/stockx/auth?returnTo=${returnUrl}`;
  };

  const handleBulkImport = async () => {
    setIsImporting(true);
    try {
      // Import all sales without detailed payouts (fast)
      await syncSales(false, true); // silent=false, fullSync=true
      setShowPayoutRefresher(true); // Show the refresher after import
    } finally {
      setIsImporting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PAYOUT_COMPLETED': return 'text-green-400 bg-green-900/20 border-green-500/30';
      case 'AUTHENTICATED': return 'text-blue-400 bg-blue-900/20 border-blue-500/30';
      case 'PENDING': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
      case 'SHIPPED': return 'text-purple-400 bg-purple-900/20 border-purple-500/30';
      case 'CANCELLED': return 'text-red-400 bg-red-900/20 border-red-500/30';
      default: return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toUpperCase()) {
      case 'PAYOUT_COMPLETED': return <CheckCircle className="w-4 h-4" />;
      case 'AUTHENTICATED': return <CheckCircle className="w-4 h-4" />;
      case 'PENDING': return <Clock className="w-4 h-4" />;
      case 'SHIPPED': return <Package className="w-4 h-4" />;
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

        {/* Auth Status */}
        {!syncStatus.isAuthenticated && (
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <p className="text-yellow-400 font-semibold">StockX Authentication Required</p>
            </div>
            <p className="text-yellow-300 text-sm mb-3">
              Connect your StockX account to import and track your sales.
            </p>
            <button
              onClick={handleStockXLogin}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200"
            >
              Connect StockX Account
            </button>
          </div>
        )}

        {/* Sync Progress */}
        {syncProgress && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
              <p className="text-blue-400 font-semibold">{syncProgress.status}</p>
            </div>
            {syncProgress.total > 0 && (
              <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Orders</option>
                <option value="PAYOUT_COMPLETED">Completed</option>
                <option value="AUTHENTICATED">Authenticated</option>
                <option value="PENDING">Pending</option>
                <option value="SHIPPED">Shipped</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            {lastSyncTime && (
              <p className="text-xs text-gray-500">
                Last sync: {formatDate(lastSyncTime)}
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {syncStatus.isAuthenticated && sales.length === 0 && (
              <button
                onClick={handleBulkImport}
                disabled={isImporting || loading}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
              >
                <Download className={`w-4 h-4 ${isImporting ? 'animate-bounce' : ''}`} />
                {isImporting ? 'Importing...' : 'Import All Sales'}
              </button>
            )}
            
            {sales.length > 0 && (
              <button
                onClick={() => setShowPayoutRefresher(!showPayoutRefresher)}
                className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                {showPayoutRefresher ? 'Hide' : 'Refresh'} Payouts
              </button>
            )}
            
            <button
              onClick={() => syncSales(false, false)}
              disabled={loading || !syncStatus.isAuthenticated}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Syncing...' : 'Sync Recent'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}

        {/* Payout Refresher */}
        {sales.length > 0 && showPayoutRefresher && (
          <div className="mb-6">
            <StockXPayoutRefresher 
              onRefreshComplete={() => {
                // Refresh from Firebase to show updated payouts
                syncSales(true, false); // silent sync to reload data
              }}
              skipCompleted={true}
            />
          </div>
        )}

        {/* Stats */}
        {filteredSales.length > 0 && (
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
          {filteredSales.map((sale) => (
            <div key={sale.id} className="bg-gray-800 rounded-lg p-4 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img 
                    src={sale.product.imageUrl || '/placeholder-shoe.png'} 
                    alt={sale.product.productName}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold text-white truncate">{sale.product.productName}</h3>
                    <p className="text-gray-400 text-sm">{sale.product.brand} • Size {sale.variant.size}</p>
                    <p className="text-gray-500 text-xs">Order #{sale.orderNumber}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className={`px-3 py-1 rounded-full border text-sm font-medium flex items-center gap-2 ${getStatusColor(sale.status)}`}>
                    {getStatusIcon(sale.status)}
                    {sale.status.replace(/_/g, ' ')}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-400">{formatCurrency(sale.pricing.salePrice)}</p>
                    <p className="text-sm text-gray-400">Payout: {formatCurrency(sale.pricing.totalPayout)}</p>
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
                  <p className="text-sm text-white">{formatCurrency(sale.pricing.sellerFees)}</p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Net Payout</p>
                  <p className="text-sm text-green-400 font-semibold">{formatCurrency(sale.pricing.totalPayout)}</p>
                </div>
              </div>

              {sale.shipping?.trackingNumber && (
                <div className="mt-4 p-3 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <p className="text-sm text-blue-300">
                    <strong>Tracking:</strong> {sale.shipping.trackingNumber}
                  </p>
                  {sale.shipping.shippedDate && (
                    <p className="text-xs text-blue-400 mt-1">
                      Shipped: {formatDate(sale.shipping.shippedDate)}
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
        {filteredSales.length === 0 && !loading && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">No Sales Found</h3>
            <p className="text-gray-500">
              {syncStatus.isAuthenticated 
                ? 'Click "Import All Sales" to get started.'
                : 'Connect your StockX account to view your sales history.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockXSalesFromFirebase;