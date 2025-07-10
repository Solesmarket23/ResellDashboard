'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface DeliveryItem {
  id: string;
  trackingNumber: string;
  carrier: string;
  productName: string;
  productBrand: string;
  productSize: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered';
  estimatedDelivery: string;
  actualDelivery?: string;
  origin: string;
  destination: string;
  lastUpdate: string;
  updates: {
    timestamp: string;
    location: string;
    status: string;
    description: string;
  }[];
}

const Deliveries: React.FC = () => {
  const { currentTheme } = useTheme();
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [carrierFilter, setCarrierFilter] = useState<string>('all');

  // Mock data - in real app, this would come from API
  useEffect(() => {
    setTimeout(() => {
      setDeliveries([
        {
          id: '1',
          trackingNumber: '1Z999AA1234567890',
          carrier: 'UPS',
          productName: 'Air Jordan 1 Retro High OG',
          productBrand: 'Nike',
          productSize: '10.5',
          status: 'delivered',
          estimatedDelivery: '2024-01-15',
          actualDelivery: '2024-01-14',
          origin: 'Memphis, TN',
          destination: 'New York, NY',
          lastUpdate: '2024-01-14T14:30:00Z',
          updates: [
            { timestamp: '2024-01-14T14:30:00Z', location: 'New York, NY', status: 'Delivered', description: 'Package delivered to front door' },
            { timestamp: '2024-01-14T09:15:00Z', location: 'New York, NY', status: 'Out for Delivery', description: 'Package is out for delivery' },
            { timestamp: '2024-01-13T19:45:00Z', location: 'Queens, NY', status: 'In Transit', description: 'Package arrived at local facility' }
          ]
        },
        {
          id: '2',
          trackingNumber: '773039582965',
          carrier: 'FedEx',
          productName: 'Yeezy Boost 350 V2',
          productBrand: 'Adidas',
          productSize: '9',
          status: 'out_for_delivery',
          estimatedDelivery: '2024-01-16',
          origin: 'Indianapolis, IN',
          destination: 'New York, NY',
          lastUpdate: '2024-01-16T08:00:00Z',
          updates: [
            { timestamp: '2024-01-16T08:00:00Z', location: 'New York, NY', status: 'Out for Delivery', description: 'Package is out for delivery' },
            { timestamp: '2024-01-15T22:30:00Z', location: 'Bronx, NY', status: 'In Transit', description: 'Package arrived at destination facility' },
            { timestamp: '2024-01-15T14:20:00Z', location: 'Newark, NJ', status: 'In Transit', description: 'Package in transit' }
          ]
        },
        {
          id: '3',
          trackingNumber: '9400109205568916437897',
          carrier: 'USPS',
          productName: 'Dunk Low',
          productBrand: 'Nike',
          productSize: '11',
          status: 'in_transit',
          estimatedDelivery: '2024-01-18',
          origin: 'Los Angeles, CA',
          destination: 'New York, NY',
          lastUpdate: '2024-01-15T16:45:00Z',
          updates: [
            { timestamp: '2024-01-15T16:45:00Z', location: 'Chicago, IL', status: 'In Transit', description: 'Package in transit to next facility' },
            { timestamp: '2024-01-14T11:20:00Z', location: 'Phoenix, AZ', status: 'In Transit', description: 'Package departed facility' },
            { timestamp: '2024-01-13T09:30:00Z', location: 'Los Angeles, CA', status: 'Shipped', description: 'Package picked up by carrier' }
          ]
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'shipped':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'in_transit':
        return <Truck className="w-5 h-5 text-orange-500" />;
      case 'out_for_delivery':
        return <MapPin className="w-5 h-5 text-purple-500" />;
      case 'delivered':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'in_transit':
        return 'bg-orange-100 text-orange-800';
      case 'out_for_delivery':
        return 'bg-purple-100 text-purple-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    const matchesSearch = delivery.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         delivery.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    const matchesCarrier = carrierFilter === 'all' || delivery.carrier === carrierFilter;
    
    return matchesSearch && matchesStatus && matchesCarrier;
  });

  const statusCounts = deliveries.reduce((acc, delivery) => {
    acc[delivery.status] = (acc[delivery.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

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
      <div className="mb-8">
        <h1 className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary} mb-2`}>
          Deliveries
        </h1>
        <p className={`${currentTheme.colors.textSecondary}`}>
          Track your package deliveries and shipping status
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Total Deliveries</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{deliveries.length}</p>
            </div>
            <Package className={`w-8 h-8 ${currentTheme.colors.accent}`} />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>In Transit</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{statusCounts.in_transit || 0}</p>
            </div>
            <Truck className="w-8 h-8 text-orange-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Out for Delivery</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{statusCounts.out_for_delivery || 0}</p>
            </div>
            <MapPin className="w-8 h-8 text-purple-500" />
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>Delivered</p>
              <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>{statusCounts.delivered || 0}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
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
                placeholder="Search by product name, tracking number, or brand..."
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
              <option value="shipped">Shipped</option>
              <option value="in_transit">In Transit</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered</option>
            </select>
            
            <select
              value={carrierFilter}
              onChange={(e) => setCarrierFilter(e.target.value)}
              className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">All Carriers</option>
              <option value="UPS">UPS</option>
              <option value="FedEx">FedEx</option>
              <option value="USPS">USPS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Deliveries List */}
      <div className="space-y-4">
        {filteredDeliveries.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>No deliveries found</h3>
            <p className={`${currentTheme.colors.textSecondary}`}>
              {searchTerm || statusFilter !== 'all' || carrierFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'Your delivery tracking information will appear here'}
            </p>
          </div>
        ) : (
          filteredDeliveries.map((delivery) => (
            <div key={delivery.id} className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Product Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(delivery.status)}
                    <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                      {delivery.productName}
                    </h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                      {formatStatus(delivery.status)}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      {delivery.productBrand} • Size {delivery.productSize}
                    </span>
                    <span className={`${currentTheme.colors.textSecondary}`}>
                      {delivery.carrier} • {delivery.trackingNumber}
                    </span>
                  </div>
                </div>
                
                {/* Delivery Info */}
                <div className="flex flex-col lg:items-end gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {delivery.status === 'delivered' && delivery.actualDelivery
                        ? `Delivered ${new Date(delivery.actualDelivery).toLocaleDateString()}`
                        : `Est. ${new Date(delivery.estimatedDelivery).toLocaleDateString()}`
                      }
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {delivery.origin} → {delivery.destination}
                    </span>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button className={`p-2 rounded-lg ${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100 transition-colors`}>
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {/* Latest Update */}
              {delivery.updates && delivery.updates.length > 0 && (
                <div className={`mt-4 pt-4 border-t ${currentTheme.colors.border}`}>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm font-medium ${currentTheme.colors.textPrimary}`}>
                      Latest Update
                    </span>
                  </div>
                  <div className="mt-2 ml-6">
                    <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                      {delivery.updates[0].description}
                    </p>
                    <p className={`text-xs ${currentTheme.colors.textSecondary} mt-1`}>
                      {delivery.updates[0].location} • {new Date(delivery.updates[0].timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Deliveries;