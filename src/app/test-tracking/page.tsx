'use client';

import React, { useState } from 'react';
import { Package, Search, RefreshCw, CheckCircle, Clock, MapPin, Calendar, X } from 'lucide-react';

interface TrackingResult {
  id: string;
  productName: string;
  trackingNumber: string;
  carrier: string;
  status: string;
  estimatedDelivery: string;
  actualDelivery?: string;
  origin: string;
  destination: string;
  lastUpdate: string;
  updates: Array<{
    timestamp: string;
    location: string;
    status: string;
    description: string;
  }>;
  liveTracking?: any;
  isLiveTrackingEnabled: boolean;
}

const TestTrackingPage: React.FC = () => {
  const [trackingNumber, setTrackingNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualTrackings, setManualTrackings] = useState<TrackingResult[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTracking, setNewTracking] = useState({
    trackingNumber: '',
    productName: '',
    productBrand: '',
    productSize: '',
    carrier: 'UPS'
  });

  const handleTestTracking = async () => {
    if (!trackingNumber.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/deliveries/sync?userId=test-user-123&trackingNumber=${encodeURIComponent(trackingNumber.trim())}`);
      const data = await response.json();

      if (data.success && data.deliveries && data.deliveries.length > 0) {
        setResult(data.deliveries[0]);
      } else {
        setError(data.error || 'No tracking data found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tracking data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualTracking = async () => {
    if (!newTracking.trackingNumber.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/deliveries/sync', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'test-user-123',
          ...newTracking
        })
      });

      const data = await response.json();

      if (data.success) {
        setNewTracking({
          trackingNumber: '',
          productName: '',
          productBrand: '',
          productSize: '',
          carrier: 'UPS'
        });
        setShowAddForm(false);
        await loadManualTrackings();
      } else {
        setError(data.error || 'Failed to add tracking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tracking');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteManualTracking = async (trackingNumber: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/deliveries/sync?userId=test-user-123&trackingNumber=${encodeURIComponent(trackingNumber)}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        await loadManualTrackings();
      } else {
        setError(data.error || 'Failed to delete tracking');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tracking');
    } finally {
      setLoading(false);
    }
  };

  const loadManualTrackings = async () => {
    try {
      const response = await fetch('/api/deliveries/sync?userId=test-user-123');
      const data = await response.json();

      if (data.success && data.deliveries) {
        setManualTrackings(data.deliveries);
      }
    } catch (err) {
      console.error('Failed to load manual trackings:', err);
    }
  };

  // Load manual trackings on component mount
  React.useEffect(() => {
    loadManualTrackings();
  }, []);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'delivered':
        return 'text-green-600 bg-green-100';
      case 'in_transit':
        return 'text-blue-600 bg-blue-100';
      case 'out_for_delivery':
        return 'text-orange-600 bg-orange-100';
      case 'exception':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Package className="w-6 h-6" />
            Test UPS Tracking
          </h1>
          
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter UPS tracking number (e.g., 1ZR1H0140317255932)"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleTestTracking}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Test Tracking
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Tracking Info Card */}
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      {result.productName}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Tracking: {result.trackingNumber}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Carrier: {result.carrier}
                    </p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(result.status)}`}>
                    {result.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Estimated Delivery</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {result.estimatedDelivery === 'TBD' ? 'TBD' : formatDate(result.estimatedDelivery)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Origin</p>
                      <p className="font-medium text-gray-900 dark:text-white">{result.origin}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-500" />
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Last Update</p>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {formatTime(result.lastUpdate)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Live Tracking Status */}
              {result.isLiveTrackingEnabled && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-medium text-green-800 dark:text-green-200">
                      Live Tracking Enabled
                    </span>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Real-time updates from {result.carrier}
                  </p>
                </div>
              )}

              {/* Tracking Updates */}
              {result.updates && result.updates.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Tracking Updates ({result.updates.length})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {result.updates.map((update, index) => (
                      <div key={index} className="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full mt-2 ${
                            update.status === 'delivered' ? 'bg-green-500' :
                            update.status === 'exception' ? 'bg-red-500' :
                            update.status === 'in_transit' ? 'bg-blue-500' :
                            update.status === 'out_for_delivery' ? 'bg-orange-500' :
                            'bg-gray-500'
                          }`}></div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-medium px-2 py-1 rounded-full text-xs ${
                              update.status === 'delivered' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                              update.status === 'exception' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                              update.status === 'in_transit' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              update.status === 'out_for_delivery' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                            }`}>
                              {update.status.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {formatTime(update.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {update.location}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-500">
                            {update.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Manual Tracking Management */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Manual Tracking Management
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Package className="w-4 h-4" />
              {showAddForm ? 'Cancel' : 'Add Manual Tracking'}
            </button>
          </div>

          {/* Add Manual Tracking Form */}
          {showAddForm && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Add New Tracking
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tracking Number *
                  </label>
                  <input
                    type="text"
                    value={newTracking.trackingNumber}
                    onChange={(e) => setNewTracking({...newTracking, trackingNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 1ZR1H0140317255932"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Carrier
                  </label>
                  <select
                    value={newTracking.carrier}
                    onChange={(e) => setNewTracking({...newTracking, carrier: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="UPS">UPS</option>
                    <option value="FedEx">FedEx</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL">DHL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={newTracking.productName}
                    onChange={(e) => setNewTracking({...newTracking, productName: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Air Jordan 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Brand
                  </label>
                  <input
                    type="text"
                    value={newTracking.productBrand}
                    onChange={(e) => setNewTracking({...newTracking, productBrand: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Nike"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Size
                  </label>
                  <input
                    type="text"
                    value={newTracking.productSize}
                    onChange={(e) => setNewTracking({...newTracking, productSize: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10.5"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleAddManualTracking}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Package className="w-4 h-4" />
                        Add to Deliveries
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Manual Tracking List */}
          {manualTrackings.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Current Manual Trackings ({manualTrackings.length})
              </h3>
              <div className="space-y-3">
                {manualTrackings.map((tracking) => (
                  <div key={tracking.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {tracking.productName}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {tracking.trackingNumber} • {tracking.carrier}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Est. Delivery: {tracking.estimatedDelivery === 'TBD' ? 'TBD' : formatDate(tracking.estimatedDelivery)}
                          </p>
                          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(tracking.status)}`}>
                            {tracking.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteManualTracking(tracking.trackingNumber)}
                      disabled={loading}
                      className="ml-4 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manualTrackings.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No manual trackings added yet</p>
              <p className="text-sm">Click "Add Manual Tracking" to get started</p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-3">
            How to Use
          </h3>
          <ul className="space-y-2 text-blue-800 dark:text-blue-200">
            <li>• <strong>Test Tracking:</strong> Enter any UPS tracking number to test live tracking (doesn't save to database)</li>
            <li>• <strong>Add Manual Tracking:</strong> Add tracking numbers to your deliveries list for testing</li>
            <li>• <strong>Delete Tracking:</strong> Remove tracking numbers when done testing</li>
            <li>• Try: <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">1ZR1H0140317255932</code> or <code className="bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">1ZR1H0140329378751</code></li>
            <li>• The system will fetch real-time data from UPS API</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TestTrackingPage;
