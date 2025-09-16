'use client';

import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, MapPin, Calendar, Bell, RefreshCw, TrendingUp, AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { DeliveryArrival, ArrivalNotification } from '../lib/delivery/arrivalLogger';

const DeliveryArrivalDashboard: React.FC = () => {
  const { currentTheme } = useTheme();
  const [arrivals, setArrivals] = useState<DeliveryArrival[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [notifications, setNotifications] = useState<ArrivalNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'today' | 'this_week' | 'delivered'>('all');

  // Load arrival data
  const loadArrivalData = async () => {
    try {
      const response = await fetch('/api/delivery/sync-arrivals');
      const data = await response.json();
      
      if (data.success) {
        setArrivals(data.data.arrivals || []);
        setStats(data.data.stats);
        setNotifications(data.data.pendingNotifications || []);
      }
    } catch (error) {
      console.error('Error loading arrival data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sync arrivals with purchases
  const syncArrivals = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/delivery/sync-arrivals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (data.success) {
        setArrivals(data.results.arrivals || []);
        setStats(data.stats);
        alert(`✅ Synced ${data.results.successful} deliveries! ${data.stats.arrivingToday} arriving today.`);
      } else {
        alert(`❌ Sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error syncing arrivals:', error);
      alert(`❌ Error syncing arrivals: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadArrivalData();
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
      case 'exception':
        return <AlertTriangle className="w-5 h-5 text-red-500" />;
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
      case 'exception':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const filteredArrivals = arrivals.filter(arrival => {
    switch (filter) {
      case 'today':
        const today = new Date().toISOString().split('T')[0];
        return arrival.estimatedArrival === today || arrival.status === 'out_for_delivery';
      case 'this_week':
        const todayDate = new Date();
        const weekFromNow = new Date(todayDate);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const arrivalDate = new Date(arrival.estimatedArrival);
        return arrivalDate >= todayDate && arrivalDate <= weekFromNow;
      case 'delivered':
        return arrival.status === 'delivered';
      default:
        return true;
    }
  });

  if (loading) {
    return (
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
        <div className="flex items-center justify-center">
          <div className={`w-8 h-8 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
            Delivery Arrival Dashboard
          </h3>
          <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
            Track when your purchases are arriving
          </p>
        </div>
        <button
          onClick={syncArrivals}
          disabled={syncing}
          className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
            syncing
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Arrivals'}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                Total Deliveries
              </span>
            </div>
            <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
              {stats.total}
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-green-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                Arriving Today
              </span>
            </div>
            <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
              {stats.arrivingToday}
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                This Week
              </span>
            </div>
            <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
              {stats.arrivingThisWeek}
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className="w-4 h-4 text-purple-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                Notifications
              </span>
            </div>
            <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
              {stats.pendingNotifications}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'all', label: 'All Deliveries' },
          { key: 'today', label: 'Arriving Today' },
          { key: 'this_week', label: 'This Week' },
          { key: 'delivered', label: 'Delivered' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as any)}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              filter === key
                ? 'bg-blue-600 text-white'
                : `${currentTheme.colors.textSecondary} hover:${currentTheme.colors.textPrimary} hover:bg-gray-100`
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Arrivals List */}
      <div className="space-y-4">
        {filteredArrivals.length === 0 ? (
          <div className="text-center py-8">
            <Package className={`w-12 h-12 mx-auto mb-4 ${currentTheme.colors.textSecondary}`} />
            <h3 className={`text-lg font-medium ${currentTheme.colors.textPrimary} mb-2`}>
              No deliveries found
            </h3>
            <p className={`${currentTheme.colors.textSecondary} mb-4`}>
              {filter === 'all' 
                ? 'No deliveries tracked yet. Click "Sync Arrivals" to get started.'
                : `No deliveries ${filter.replace('_', ' ')} found.`
              }
            </p>
            {filter === 'all' && (
              <button
                onClick={syncArrivals}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
              >
                Sync Arrivals
              </button>
            )}
          </div>
        ) : (
          filteredArrivals.map((arrival) => (
            <div key={arrival.id} className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(arrival.status)}
                  <div>
                    <h4 className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      {arrival.productName}
                    </h4>
                    <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {arrival.productBrand} • Size {arrival.productSize}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(arrival.status)}`}>
                    {formatStatus(arrival.status)}
                  </span>
                  {arrival.updates[0]?.arrivalProbability && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      arrival.updates[0].arrivalProbability >= 80 ? 'bg-green-100 text-green-800' :
                      arrival.updates[0].arrivalProbability >= 50 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {arrival.updates[0].arrivalProbability}% arrival
                    </span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className={`${currentTheme.colors.textSecondary}`}>
                    <strong>Tracking:</strong> {arrival.trackingNumber}
                  </p>
                  <p className={`${currentTheme.colors.textSecondary}`}>
                    <strong>Carrier:</strong> {arrival.carrier}
                  </p>
                </div>
                
                <div>
                  <p className={`${currentTheme.colors.textSecondary}`}>
                    <strong>Est. Arrival:</strong> {new Date(arrival.estimatedArrival).toLocaleDateString()}
                  </p>
                  <p className={`${currentTheme.colors.textSecondary}`}>
                    <strong>Location:</strong> {arrival.location.current}
                  </p>
                </div>
                
                <div>
                  <p className={`${currentTheme.colors.textSecondary}`}>
                    <strong>Last Update:</strong> {new Date(arrival.lastUpdate).toLocaleString()}
                  </p>
                  {arrival.updates[0]?.estimatedTimeToArrival && (
                    <p className={`${currentTheme.colors.textSecondary}`}>
                      <strong>Time to Arrival:</strong> {arrival.updates[0].estimatedTimeToArrival}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Latest Update */}
              {arrival.updates[0] && (
                <div className={`mt-3 pt-3 border-t ${currentTheme.colors.border}`}>
                  <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                    {arrival.updates[0].description}
                  </p>
                  <p className={`text-xs ${currentTheme.colors.textSecondary} mt-1`}>
                    {arrival.updates[0].location} • {new Date(arrival.updates[0].timestamp).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DeliveryArrivalDashboard;
