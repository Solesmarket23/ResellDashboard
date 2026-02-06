'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Filter, Search, MoreHorizontal, RefreshCw, Wifi, WifiOff, X, ChevronDown, Trash2, Copy } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { useSiteAuth } from '../lib/hooks/useSiteAuth';
import { useRealTimeDeliveries } from '../lib/hooks/useRealTimeDeliveries';
import { TrackingInfo } from '../lib/tracking/trackingService';
import { deliveryArrivalLogger } from '../lib/delivery/arrivalLogger';
import UPSOAuthButton from './UPSOAuthButton';
import { useUPSOAuth } from '../lib/hooks/useUPSOAuth';

interface DeliveryItem {
  id: string;
  trackingNumber: string;
  carrier: string;
  productName: string;
  productBrand: string;
  productSize: string;
  status: 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'unknown';
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
  liveTracking?: TrackingInfo;
  isLiveTrackingEnabled?: boolean;
}

const DeliveriesNew: React.FC = () => {
  const { currentTheme } = useTheme();
  const { user: firebaseUser } = useAuth();
  const { user: siteUser } = useSiteAuth();
  
  // Use either Firebase user or site user
  const user = firebaseUser || siteUser;

  // Helper function to find the best update to display (most recent with location, or most recent)
  const getBestUpdate = (updates: any[]) => {
    if (!updates || updates.length === 0) return null;
    
    // First try to find the most recent update with location
    const updateWithLocation = updates.find(update => 
      update.location && 
      update.location !== 'Unknown' && 
      update.location.trim() !== ''
    );
    
    // Return the update with location, or fall back to the most recent update
    return updateWithLocation || updates[0];
  };
  
  // Real-time deliveries hook
  const {
    deliveries,
    loading,
    hydrating,
    error,
    refreshDeliveries
  } = useRealTimeDeliveries({
    userId: user?.uid || '',
    autoRefresh: true,
    refreshInterval: 60000, // 1 minute
    enableWebSocket: false
  });

  // UPS OAuth status
  const { isAuthenticated: upsOAuthConnected, isLoading: upsOAuthLoading, error: upsOAuthError } = useUPSOAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [carrierFilter, setCarrierFilter] = useState('all');
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);

  // Copy tracking number to clipboard
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const [copiedShipmentId, setCopiedShipmentId] = useState<string | null>(null);
  
  const copyTrackingNumber = async (trackingNumber: string, deliveryId: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      setCopiedTrackingId(deliveryId);
      setTimeout(() => setCopiedTrackingId(null), 2000);
    } catch (error) {
      console.error('Failed to copy tracking number:', error);
    }
  };

  // Copy full shipment data to clipboard
  const copyShipmentData = async (delivery: DeliveryItem, deliveryId: string) => {
    try {
      const shipmentData = {
        trackingNumber: delivery.trackingNumber,
        carrier: delivery.carrier,
        productName: delivery.productName,
        productBrand: delivery.productBrand,
        productSize: delivery.productSize,
        status: delivery.status,
        estimatedDelivery: delivery.estimatedDelivery,
        actualDelivery: delivery.actualDelivery,
        origin: delivery.origin,
        destination: delivery.destination,
        lastUpdate: delivery.lastUpdate,
        updates: delivery.updates.map(update => ({
          timestamp: update.timestamp,
          location: update.location,
          status: update.status,
          description: update.description
        })),
        liveTracking: delivery.liveTracking,
        isLiveTrackingEnabled: delivery.isLiveTrackingEnabled
      };
      
      await navigator.clipboard.writeText(JSON.stringify(shipmentData, null, 2));
      setCopiedShipmentId(deliveryId);
      setTimeout(() => setCopiedShipmentId(null), 2000);
    } catch (error) {
      console.error('Failed to copy shipment data:', error);
    }
  };

  // Status icon helper
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'out_for_delivery':
        return <Truck className="w-4 h-4 text-orange-500" />;
      case 'in_transit':
        return <Package className="w-4 h-4 text-blue-500" />;
      case 'exception':
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  // Status color helper
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'out_for_delivery':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'in_transit':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'exception':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  // Format status helper
  const formatStatus = (status: string) => {
    return status.replace('_', ' ').toUpperCase();
  };

  // Filter deliveries
  const filteredDeliveries = deliveries.filter((delivery) => {
    const matchesSearch = !searchTerm || 
      delivery.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      delivery.productBrand.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || delivery.status === statusFilter;
    const matchesCarrier = carrierFilter === 'all' || delivery.carrier === carrierFilter;
    
    return matchesSearch && matchesStatus && matchesCarrier;
  });

  // Auto-select first delivery if none selected
  useEffect(() => {
    if (filteredDeliveries.length > 0 && !selectedDelivery) {
      setSelectedDelivery(filteredDeliveries[0]);
    }
  }, [filteredDeliveries, selectedDelivery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <X className="w-8 h-8 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400">Error loading deliveries: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto py-8">
        {/* Header */}
        <div className="flex-1 p-4 sm:p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-slate-900">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Deliveries</h1>
              <p className="text-gray-300">
                Track your packages and monitor delivery status
                {upsOAuthConnected && (
                  <span className="ml-2 text-green-400">• UPS OAuth Connected</span>
                )}
                {upsOAuthError && (
                  <span className="ml-2 text-red-400">• UPS OAuth Error</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <UPSOAuthButton />
              <button
                onClick={refreshDeliveries}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <span className="text-white font-semibold">Total</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">{deliveries.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-400" />
                <span className="text-white font-semibold">In Transit</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">
                {deliveries.filter(d => d.status === 'in_transit').length}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-white font-semibold">Delivered</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">
                {deliveries.filter(d => d.status === 'delivered').length}
              </p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-cyan-400" />
                <span className="text-white font-semibold">Live Tracking</span>
              </div>
              <p className="text-2xl font-bold text-white mt-1">
                {deliveries.filter(d => d.isLiveTrackingEnabled).length}
              </p>
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
                <option value="today">Arriving Today</option>
                <option value="tomorrow">Arriving Tomorrow</option>
                <option value="this_week">Arriving This Week</option>
                <option value="delivered">Delivered</option>
                <option value="shipped">Shipped</option>
                <option value="in_transit">In Transit</option>
                <option value="out_for_delivery">Out for Delivery</option>
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
              
              {(statusFilter !== 'all' || carrierFilter !== 'all' || searchTerm) && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setCarrierFilter('all');
                    setSearchTerm('');
                  }}
                  className={`px-4 py-2 border rounded-lg ${currentTheme.colors.border} ${currentTheme.colors.cardBackground} ${currentTheme.colors.textPrimary} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content - Left/Right Split */}
        {filteredDeliveries.length === 0 ? (
          <div className={`${currentTheme.colors.cardBackground} rounded-lg p-12 text-center border ${currentTheme.colors.border}`}>
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>No deliveries found</h3>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              {searchTerm || statusFilter !== 'all' || carrierFilter !== 'all'
                ? 'Try adjusting your filters or search terms'
                : 'No purchases with tracking numbers found. Make sure your purchases have tracking information.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
            {/* Left Panel - Delivery List */}
            <div className="flex flex-col">
              <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                    Deliveries ({filteredDeliveries.length})
                  </h3>
                  <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                    Click a delivery to view details
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <div className="space-y-2 p-4">
                    {filteredDeliveries.map((delivery) => (
                      <div 
                        key={delivery.id} 
                        onClick={() => setSelectedDelivery(delivery)}
                        className={`p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all duration-200 ${
                          selectedDelivery?.id === delivery.id 
                            ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700' 
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Status Icon */}
                          <div className="flex-shrink-0">
                            {getStatusIcon(delivery.status)}
                          </div>
                          
                          {/* Main Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className={`text-sm font-medium ${currentTheme.colors.textPrimary} truncate`}>
                                {delivery.productName}
                              </h4>
                              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(delivery.status)}`}>
                                {formatStatus(delivery.status)}
                              </span>
                              {delivery.liveTracking && !delivery.liveTracking.error && (
                                <Wifi className="w-3 h-3 text-green-500" title="Live tracking" />
                              )}
                              {delivery.liveTracking?.error && (
                                <WifiOff className="w-3 h-3 text-red-500" title="Tracking error" />
                              )}
                              {!delivery.liveTracking && (
                                <Clock className="w-3 h-3 text-blue-500" title="Loading tracking" />
                              )}
                            </div>
                            
                            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <span>{delivery.productBrand} • Size {delivery.productSize}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span>{delivery.carrier} • </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyTrackingNumber(delivery.trackingNumber, delivery.id);
                                  }}
                                  className="hover:text-blue-500 transition-colors duration-200 font-mono"
                                  title="Click to copy tracking number"
                                >
                                  {delivery.trackingNumber}
                                  {copiedTrackingId === delivery.id && (
                                    <span className="text-green-500 ml-1">✓</span>
                                  )}
                                </button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                <span>
                                  {delivery.status === 'delivered' && delivery.actualDelivery
                                    ? `Delivered ${new Date(delivery.actualDelivery).toLocaleDateString()}`
                                    : delivery.estimatedDelivery === 'TBD'
                                    ? 'Est. TBD'
                                    : `Est. ${new Date(delivery.estimatedDelivery).toLocaleDateString()}`
                                  }
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Selection Indicator */}
                          <div className="flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full ${
                              selectedDelivery?.id === delivery.id 
                                ? 'bg-cyan-500' 
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Panel - Delivery Details */}
            <div className="flex flex-col">
              <div className={`${currentTheme.colors.cardBackground} rounded-lg border ${currentTheme.colors.border} flex-1 flex flex-col`}>
                {selectedDelivery ? (
                  <>
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                      <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                        Delivery Details
                      </h3>
                      <p className={`text-sm ${currentTheme.colors.textSecondary} mt-1`}>
                        {selectedDelivery.productName}
                      </p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <div className="p-4 space-y-4">
                        {/* Product Info */}
                        <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          {getStatusIcon(selectedDelivery.status)}
                          <div className="flex-1">
                            <h4 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                              {selectedDelivery.productName}
                            </h4>
                            <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                              {selectedDelivery.productBrand} • Size {selectedDelivery.productSize}
                            </p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedDelivery.status)}`}>
                            {formatStatus(selectedDelivery.status)}
                          </span>
                        </div>

                        {/* Tracking Info */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className={`text-sm ${currentTheme.colors.textSecondary} mb-1`}>Tracking Number</p>
                            <div className="flex items-center gap-2">
                              <p className={`font-mono text-sm ${currentTheme.colors.textPrimary}`}>
                                {selectedDelivery.trackingNumber}
                              </p>
                              <button
                                onClick={() => copyTrackingNumber(selectedDelivery.trackingNumber, selectedDelivery.id)}
                                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors duration-200"
                                title="Click to copy tracking number"
                              >
                                <Copy className="w-4 h-4 text-gray-500 hover:text-blue-500" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className={`text-sm ${currentTheme.colors.textSecondary} mb-1`}>Carrier</p>
                            <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                              {selectedDelivery.carrier}
                            </p>
                          </div>
                        </div>

                        {/* Delivery Info */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className={`text-sm ${currentTheme.colors.textSecondary} mb-1`}>Estimated Delivery</p>
                            <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                              {selectedDelivery.status === 'delivered' && selectedDelivery.actualDelivery
                                ? `Delivered ${new Date(selectedDelivery.actualDelivery).toLocaleDateString()}`
                                : selectedDelivery.estimatedDelivery === 'TBD'
                                ? 'TBD'
                                : new Date(selectedDelivery.estimatedDelivery).toLocaleDateString()
                              }
                            </p>
                          </div>
                          <div>
                            <p className={`text-sm ${currentTheme.colors.textSecondary} mb-1`}>Route</p>
                            <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                              {selectedDelivery.origin} → {selectedDelivery.destination}
                            </p>
                          </div>
                        </div>

                        {/* Tracking Updates */}
                        {selectedDelivery.updates && selectedDelivery.updates.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h5 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
                                Tracking History ({selectedDelivery.updates.length})
                              </h5>
                              <button
                                onClick={() => copyShipmentData(selectedDelivery, selectedDelivery.id)}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors duration-200"
                                title="Copy full shipment data as JSON"
                              >
                                <Copy className="w-4 h-4" />
                                Copy Data
                                {copiedShipmentId === selectedDelivery.id && (
                                  <span className="text-green-500 text-xs">✓</span>
                                )}
                              </button>
                            </div>
                            <div className="space-y-3 max-h-64 overflow-y-auto">
                              {selectedDelivery.updates.map((update, index) => (
                                <div key={index} className={`${currentTheme.colors.cardBackground} rounded-lg p-3 border ${currentTheme.colors.border}`}>
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <p className={`${currentTheme.colors.textPrimary} font-medium text-sm`}>
                                        {update.description || 'No description'}
                                      </p>
                                      <p className={`${currentTheme.colors.textSecondary} text-xs mt-1`}>
                                        {update.location || 'Unknown location'}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`${currentTheme.colors.textSecondary} text-xs`}>
                                        {update.timestamp ? new Date(update.timestamp).toLocaleString() : 'Unknown time'}
                                      </p>
                                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium mt-1 ${
                                        update.status === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                        update.status === 'exception' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                                        update.status === 'in_transit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                        update.status === 'out_for_delivery' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                        'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                      }`}>
                                        {update.status.replace('_', ' ').toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
                      <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
                        Select a Delivery
                      </h3>
                      <p className={`${currentTheme.colors.textSecondary}`}>
                        Choose a delivery from the list to view details
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeliveriesNew;
