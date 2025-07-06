'use client';

import React, { useState } from 'react';

interface HistoricalOrder {
  id: string;
  status: string;
  orderStatus: string;
  createdAt: string;
  product: {
    name: string;
    brand: string;
    colorway: string;
  };
  variant: {
    size: string;
    condition: string;
    inventoryType: string;
  };
  pricing: {
    salePrice: number;
    totalFees: number;
    payout: number;
    currency: string;
  };
  metrics: {
    profitMargin: string;
  };
}

interface HistoricalOrdersResponse {
  success: boolean;
  data: HistoricalOrder[];
  count: number;
  pageNumber: number;
  pageSize: number;
  hasNextPage: boolean;
  appliedFilters: Record<string, any>;
}

export default function StockXHistoricalOrders() {
  const [orders, setOrders] = useState<HistoricalOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    count: 0,
    pageNumber: 1,
    pageSize: 10,
    hasNextPage: false
  });

  // Filter states
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: '',
    pageNumber: 1,
    pageSize: 10,
    orderStatus: '',
    productId: '',
    variantId: '',
    inventoryTypes: '',
    initiatedShipmentDisplayIds: ''
  });

  const orderStatuses = [
    'AUTHFAILED',
    'DIDNOTSHIP', 
    'CANCELED',
    'COMPLETED',
    'RETURNED'
  ];

  const inventoryTypeOptions = [
    'STANDARD',
    'FLEX',
    'DIRECT'
  ];

  const fetchHistoricalOrders = async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          queryParams.set(key, value.toString());
        }
      });

      const response = await fetch(`/api/stockx/orders/history?${queryParams.toString()}`);
      const data: HistoricalOrdersResponse = await response.json();

      if (data.success) {
        setOrders(data.data);
        setPagination({
          count: data.count,
          pageNumber: data.pageNumber,
          pageSize: data.pageSize,
          hasNextPage: data.hasNextPage
        });
      } else {
        setError(data.error || 'Failed to fetch historical orders');
      }
    } catch (err) {
      setError('Network error while fetching historical orders');
      console.error('Historical orders fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      // Reset to page 1 when filters change
      pageNumber: key !== 'pageNumber' ? 1 : parseInt(value) || 1
    }));
  };

  const nextPage = () => {
    if (pagination.hasNextPage) {
      handleFilterChange('pageNumber', (pagination.pageNumber + 1).toString());
    }
  };

  const prevPage = () => {
    if (pagination.pageNumber > 1) {
      handleFilterChange('pageNumber', (pagination.pageNumber - 1).toString());
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          📋 StockX Historical Orders
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          View and filter your complete order history from StockX
        </p>
      </div>

      {/* Filters Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Filters</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) => handleFilterChange('fromDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) => handleFilterChange('toDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Order Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Order Status
            </label>
            <select
              value={filters.orderStatus}
              onChange={(e) => handleFilterChange('orderStatus', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">All Statuses</option>
              {orderStatuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>

          {/* Page Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Page Size
            </label>
            <select
              value={filters.pageSize}
              onChange={(e) => handleFilterChange('pageSize', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>

          {/* Product ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Product ID
            </label>
            <input
              type="text"
              placeholder="Enter product ID"
              value={filters.productId}
              onChange={(e) => handleFilterChange('productId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Inventory Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Inventory Types
            </label>
            <input
              type="text"
              placeholder="e.g., STANDARD,FLEX"
              value={filters.inventoryTypes}
              onChange={(e) => handleFilterChange('inventoryTypes', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated: {inventoryTypeOptions.join(', ')}
            </p>
          </div>
        </div>

        <button
          onClick={fetchHistoricalOrders}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-md font-medium transition-colors"
        >
          {loading ? 'Loading...' : 'Fetch Historical Orders'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <div className="flex">
            <div className="text-red-600 dark:text-red-400">
              <span className="font-medium">Error:</span> {error}
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {orders.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Historical Orders ({pagination.count} total)
              </h3>
              
              {/* Pagination Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={prevPage}
                  disabled={pagination.pageNumber <= 1}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Page {pagination.pageNumber}
                </span>
                <button
                  onClick={nextPage}
                  disabled={!pagination.hasNextPage}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Sale Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Payout
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {order.product.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {order.product.brand} • {order.product.colorway}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {order.variant.size}
                      {order.variant.inventoryType && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {order.variant.inventoryType}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        order.orderStatus === 'COMPLETED' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                          : order.orderStatus === 'CANCELED' 
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                      }`}>
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(order.pricing.salePrice, order.pricing.currency)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(order.pricing.payout, order.pricing.currency)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {order.metrics.profitMargin}% margin
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && orders.length === 0 && !error && (
        <div className="text-center py-12">
          <div className="text-gray-500 dark:text-gray-400 text-lg">
            No historical orders found. Try adjusting your filters or fetch orders first.
          </div>
        </div>
      )}
    </div>
  );
} 