'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, XCircle, Clock, Download, RefreshCw, Send, DollarSign } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { getDocuments, addDocument, updateDocument } from '../lib/firebase/firebaseUtils';
import NeonNotification, { NotificationType } from './NeonNotification';
import { format } from 'date-fns';

interface AliasOrder {
  id: string;
  status: string;
  catalog_id: string;
  catalog_name: string;
  catalog_brand: string;
  catalog_sku: string;
  size: number;
  price_cents: number;
  price_cents_after_take: number;
  sales_channel: string;
  purchase_order_number: string;
  listing_id: string;
  label_type?: string;
  label_url?: string;
  label_tracking_number?: string;
  label_courier?: string;
  sold_at: string;
  label_generated_at?: string;
  in_transit_at?: string;
  updated_at: string;
  cancels_at: string;
  customs_declaration?: {
    commercial_invoice_url: string;
    declared_customs_value_cents: number;
  };
}

const AliasOrderManagement = () => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [orders, setOrders] = useState<AliasOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<AliasOrder | null>(null);
  const [notification, setNotification] = useState<{
    isVisible: boolean;
    message: string;
    type: NotificationType;
  }>({ isVisible: false, message: '', type: 'success' });

  const showNotification = (message: string, type: NotificationType) => {
    setNotification({ isVisible: true, message, type });
  };

  // Load orders
  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const params = new URLSearchParams({
        pageSize: '100'
      });

      if (filterStatus !== 'all') {
        params.append('facetFilter', `status: ${filterStatus}`);
      }

      const response = await fetch(`/api/alias/orders?${params}`);
      const data = await response.json();

      if (data.success && data.orders) {
        setOrders(data.orders);
        
        // Save to Firebase for offline access
        await saveOrdersToFirebase(data.orders);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
      showNotification('Failed to load orders', 'error');
      
      // Fall back to Firebase data
      await loadOrdersFromFirebase();
    } finally {
      setLoading(false);
    }
  };

  // Save orders to Firebase
  const saveOrdersToFirebase = async (orders: AliasOrder[]) => {
    if (!user) return;

    try {
      for (const order of orders) {
        const existingDocs = await getDocuments('aliasOrders');
        const existing = existingDocs.find((doc: any) => 
          doc.orderId === order.id && doc.userId === user.uid
        );

        if (existing) {
          await updateDocument('aliasOrders', existing.id, {
            ...order,
            orderId: order.id,
            updatedAt: new Date().toISOString()
          });
        } else {
          await addDocument('aliasOrders', {
            ...order,
            orderId: order.id,
            userId: user.uid,
            platform: 'alias',
            savedAt: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Error saving orders to Firebase:', error);
    }
  };

  // Load orders from Firebase
  const loadOrdersFromFirebase = async () => {
    if (!user) return;

    try {
      const allOrders = await getDocuments('aliasOrders');
      const userOrders = allOrders.filter((doc: any) => doc.userId === user.uid);
      setOrders(userOrders);
    } catch (error) {
      console.error('Error loading orders from Firebase:', error);
    }
  };

  // Handle order action
  const handleOrderAction = async (orderId: string, operation: string) => {
    try {
      const response = await fetch('/api/alias/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, operation })
      });
      const data = await response.json();

      if (data.success) {
        showNotification(`Order ${operation} successful`, 'success');
        loadOrders();
      } else {
        showNotification(data.error || `Failed to ${operation} order`, 'error');
      }
    } catch (error) {
      console.error(`Error ${operation} order:`, error);
      showNotification(`Failed to ${operation} order`, 'error');
    }
  };

  useEffect(() => {
    loadOrders();
  }, [user]);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ORDER_STATUS_CONFIRMED':
        return 'bg-blue-100 text-blue-800';
      case 'ORDER_STATUS_LABEL_GENERATED':
        return 'bg-yellow-100 text-yellow-800';
      case 'ORDER_STATUS_IN_TRANSIT':
      case 'ORDER_STATUS_SHIPPED':
        return 'bg-purple-100 text-purple-800';
      case 'ORDER_STATUS_DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'ORDER_STATUS_CANCELED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(order => {
    if (filterStatus === 'all') return true;
    return order.status.toLowerCase().includes(filterStatus.toLowerCase());
  });

  // Calculate stats
  const stats = {
    total: filteredOrders.length,
    revenue: filteredOrders.reduce((sum, order) => sum + (order.price_cents_after_take / 100), 0),
    pending: filteredOrders.filter(o => 
      ['ORDER_STATUS_CONFIRMED', 'ORDER_STATUS_LABEL_GENERATED'].includes(o.status)
    ).length,
    shipped: filteredOrders.filter(o => 
      ['ORDER_STATUS_IN_TRANSIT', 'ORDER_STATUS_SHIPPED', 'ORDER_STATUS_DELIVERED'].includes(o.status)
    ).length
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className={`text-2xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
          Alias Order Management
        </h2>
        <p className={`${currentTheme.colors.textSecondary}`}>
          Track and manage your orders from Alias marketplace
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Total Orders</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {stats.total}
              </p>
            </div>
            <Package className={`w-8 h-8 ${currentTheme.colors.accent}`} />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Revenue</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                ${stats.revenue.toLocaleString()}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Pending</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {stats.pending}
              </p>
            </div>
            <Clock className="w-8 h-8 text-yellow-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm ${currentTheme.colors.textSecondary}`}>Shipped</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
                {stats.shipped}
              </p>
            </div>
            <Truck className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center mb-6">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={`px-4 py-2 rounded-lg ${currentTheme.colors.inputBackground} ${currentTheme.colors.inputBorder} border ${currentTheme.colors.textPrimary}`}
        >
          <option value="all">All Orders</option>
          <option value="confirmed">Confirmed</option>
          <option value="label_generated">Label Generated</option>
          <option value="in_transit">In Transit</option>
          <option value="delivered">Delivered</option>
          <option value="canceled">Canceled</option>
        </select>

        <button
          onClick={loadOrders}
          className={`px-4 py-2 rounded-lg ${currentTheme.colors.buttonPrimary} text-white font-medium flex items-center gap-2`}
        >
          <RefreshCw className="w-5 h-5" />
          Refresh
        </button>
      </div>

      {/* Orders Table */}
      <div className={`${currentTheme.colors.cardBackground} ${currentTheme.colors.cardBorder} border rounded-lg overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={`${currentTheme.colors.tableHeader} border-b ${currentTheme.colors.cardBorder}`}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sold Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className={`${currentTheme.colors.cardBackground} divide-y ${currentTheme.colors.cardBorder}`}>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <div className="flex justify-center items-center">
                      <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                      Loading orders...
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                    No orders found
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id} className={`hover:${currentTheme.colors.tableRowHover}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                          {order.purchase_order_number}
                        </p>
                        <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                          {order.sales_channel}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                          {order.catalog_name}
                        </p>
                        <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                          {order.catalog_brand} • Size {order.size} • {order.catalog_sku}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                          ${(order.price_cents / 100).toFixed(2)}
                        </p>
                        <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                          Payout: ${(order.price_cents_after_take / 100).toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(order.status)}`}>
                        {order.status.replace('ORDER_STATUS_', '').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`text-sm ${currentTheme.colors.textPrimary}`}>
                        {format(new Date(order.sold_at), 'MMM dd, yyyy')}
                      </div>
                      <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
                        {format(new Date(order.sold_at), 'h:mm a')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {order.status === 'ORDER_STATUS_PENDING' && (
                          <button
                            onClick={() => handleOrderAction(order.id, 'confirm')}
                            className="p-1 rounded hover:bg-green-100 text-green-600"
                            title="Confirm Order"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        
                        {order.status === 'ORDER_STATUS_CONFIRMED' && (
                          <button
                            onClick={() => handleOrderAction(order.id, 'generateLabel')}
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"
                            title="Generate Label"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        
                        {order.status === 'ORDER_STATUS_LABEL_GENERATED' && order.label_url && (
                          <>
                            <a
                              href={order.label_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-blue-100 text-blue-600"
                              title="Download Label"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => handleOrderAction(order.id, 'ship')}
                              className="p-1 rounded hover:bg-purple-100 text-purple-600"
                              title="Mark as Shipped"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        
                        {['ORDER_STATUS_PENDING', 'ORDER_STATUS_CONFIRMED'].includes(order.status) && (
                          <button
                            onClick={() => handleOrderAction(order.id, 'cancel')}
                            className="p-1 rounded hover:bg-red-100 text-red-600"
                            title="Cancel Order"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        
                        {order.label_tracking_number && (
                          <span className={`text-xs ${currentTheme.colors.textSecondary}`}>
                            {order.label_tracking_number}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notification */}
      {notification.isVisible && (
        <NeonNotification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification({ ...notification, isVisible: false })}
        />
      )}
    </div>
  );
};

export default AliasOrderManagement;