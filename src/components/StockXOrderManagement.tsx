'use client';

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Clock, 
  CheckCircle, 
  DollarSign, 
  TrendingUp, 
  Filter, 
  Search, 
  Calendar,
  MoreHorizontal,
  ExternalLink,
  Download,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface StockXOrder {
  id: string;
  orderNumber: string;
  productName: string;
  productBrand: string;
  size: string;
  sku: string;
  status: 'active' | 'completed' | 'shipped' | 'cancelled';
  salePrice: number;
  fees: number;
  payout: number;
  orderDate: string;
  shippedDate?: string;
  completedDate?: string;
  buyerLocation: string;
  shippingMethod: string;
  trackingNumber?: string;
  imageUrl?: string;
}

const StockXOrderManagement: React.FC = () => {
  const { currentTheme } = useTheme();
  const [orders, setOrders] = useState<StockXOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'history'>('active');

  // Load orders data
  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      let endpoint = '';
      switch (activeTab) {
        case 'active':
          endpoint = '/api/stockx/orders/active';
          break;
        case 'completed':
          endpoint = '/api/stockx/orders/completed';
          break;
        case 'history':
          endpoint = '/api/stockx/orders/history';
          break;
      }

      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders || []);
      } else {
        console.error('Failed to fetch orders:', response.statusText);
        // Load mock data for development
        setOrders(getMockOrders(activeTab));
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      // Load mock data for development
      setOrders(getMockOrders(activeTab));
    } finally {
      setLoading(false);
    }
  };

  const refreshOrders = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const getMockOrders = (tab: string): StockXOrder[] => {
    const baseOrders: StockXOrder[] = [
      {
        id: '1',
        orderNumber: 'SX-2024-001234',
        productName: 'Air Jordan 1 Retro High OG "Chicago"',
        productBrand: 'Nike',
        size: '10.5',
        sku: 'DZ5485-612',
        status: 'active',
        salePrice: 450,
        fees: 45,
        payout: 405,
        orderDate: '2024-01-10T10:30:00Z',
        buyerLocation: 'New York, NY',
        shippingMethod: 'Standard',
        imageUrl: 'https://picsum.photos/400/400?random=1'
      },
      {
        id: '2',
        orderNumber: 'SX-2024-001235',
        productName: 'Yeezy Boost 350 V2 "Zebra"',
        productBrand: 'Adidas',
        size: '9',
        sku: 'CP9654',
        status: 'shipped',
        salePrice: 280,
        fees: 28,
        payout: 252,
        orderDate: '2024-01-08T14:15:00Z',
        shippedDate: '2024-01-09T09:00:00Z',
        buyerLocation: 'Los Angeles, CA',
        shippingMethod: 'Express',
        trackingNumber: '1Z999AA1234567890',
        imageUrl: 'https://picsum.photos/400/400?random=2'
      },
      {
        id: '3',
        orderNumber: 'SX-2024-001236',
        productName: 'Nike Dunk Low "Panda"',
        productBrand: 'Nike',
        size: '11',
        sku: 'DD1391-100',
        status: 'completed',
        salePrice: 120,
        fees: 12,
        payout: 108,
        orderDate: '2024-01-05T16:45:00Z',
        shippedDate: '2024-01-06T11:30:00Z',
        completedDate: '2024-01-08T14:20:00Z',
        buyerLocation: 'Chicago, IL',
        shippingMethod: 'Standard',
        trackingNumber: '773039582965',
        imageUrl: 'https://picsum.photos/400/400?random=3'
      }
    ];

    switch (tab) {
      case 'active':
        return baseOrders.filter(order => order.status === 'active');
      case 'completed':
        return baseOrders.filter(order => order.status === 'completed');
      case 'history':
        return baseOrders;
      default:
        return baseOrders;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Clock className="w-5 h-5 text-orange-500" />;
      case 'shipped':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'cancelled':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-orange-100 text-orange-800';
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const totalValue = filteredOrders.reduce((sum, order) => sum + order.salePrice, 0);
  const totalPayout = filteredOrders.reduce((sum, order) => sum + order.payout, 0);
  const totalFees = filteredOrders.reduce((sum, order) => sum + order.fees, 0);

  if (loading) {
    return (
      <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
        <div className="flex items-center justify-center h-64">
          <div className={`w-8 h-8 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 p-4 sm:p-8 ${currentTheme.colors.background}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
        <div>
          <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
            StockX Order Management
          </h1>
          <p className={`${currentTheme.colors.textSecondary}`}>
            Manage your StockX sales and track order performance
          </p>
        </div>
        
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <button
            onClick={refreshOrders}
            disabled={refreshing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${currentTheme.colors.primary} text-white hover:opacity-90 transition-opacity disabled:opacity-50`}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6">
        {[
          { id: 'active', label: 'Active Orders', icon: Clock },
          { id: 'completed', label: 'Completed', icon: CheckCircle },
          { id: 'history', label: 'Order History', icon: Calendar }
        ].map((tab) => {
          const IconComponent = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isActive
                  ? currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : `${currentTheme.colors.primary} text-white`
                  : `${currentTheme.colors.textSecondary} hover:bg-white/5 hover:text-white`
              }`}
            >
              <IconComponent className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Total Orders</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{filteredOrders.length}</p>
            </div>
            <Package className={`w-8 h-8 ${currentTheme.colors.accent}`} />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Total Value</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>${totalValue.toLocaleString()}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Total Payout</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>${totalPayout.toLocaleString()}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Total Fees</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>${totalFees.toLocaleString()}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border} mb-6`}>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${currentTheme.colors.textSecondary}`} />
              <input
                type="text"
                placeholder="Search by product name, order number, or brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="shipped">Shipped</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>No orders found</h3>
            <p className={`${currentTheme.colors.textSecondary}`}>
              {searchTerm || statusFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'Your StockX orders will appear here once you connect your account'}
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Product Image */}
                <div className="flex-shrink-0">
                  <img
                    src={order.imageUrl || 'https://picsum.photos/100/100'}
                    alt={order.productName}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                </div>
                
                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(order.status)}
                        <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                          {order.productName}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                          {formatStatus(order.status)}
                        </span>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span className={`${currentTheme.colors.textSecondary}`}>
                          {order.productBrand} • Size {order.size}
                        </span>
                        <span className={`${currentTheme.colors.textSecondary}`}>
                          Order: {order.orderNumber}
                        </span>
                        <span className={`${currentTheme.colors.textSecondary}`}>
                          SKU: {order.sku}
                        </span>
                      </div>
                    </div>
                    
                    <button className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {/* Order Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className={`text-xs ${currentTheme.colors.textSecondary} mb-1`}>Sale Price</p>
                      <p className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>${order.salePrice}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${currentTheme.colors.textSecondary} mb-1`}>Fees</p>
                      <p className={`text-lg font-semibold text-red-500`}>-${order.fees}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${currentTheme.colors.textSecondary} mb-1`}>Payout</p>
                      <p className={`text-lg font-semibold text-green-500`}>${order.payout}</p>
                    </div>
                    <div>
                      <p className={`text-xs ${currentTheme.colors.textSecondary} mb-1`}>Order Date</p>
                      <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                        {new Date(order.orderDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  {/* Additional Info */}
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      📍 {order.buyerLocation}
                    </span>
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      📦 {order.shippingMethod}
                    </span>
                    {order.trackingNumber && (
                      <span className={`${currentTheme.colors.textSecondary}`}>
                        📋 {order.trackingNumber}
                      </span>
                    )}
                  </div>
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button className={`flex items-center gap-2 px-3 py-1 text-sm rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                      <ExternalLink className="w-4 h-4" />
                      View on StockX
                    </button>
                    {order.status === 'completed' && (
                      <button className={`flex items-center gap-2 px-3 py-1 text-sm rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                        <Download className="w-4 h-4" />
                        Download Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StockXOrderManagement;