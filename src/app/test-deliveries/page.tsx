'use client';

import React, { useState, useEffect } from 'react';

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
  liveTracking?: any;
  isLiveTrackingEnabled?: boolean;
}

const TestDeliveriesPage: React.FC = () => {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeliveries = async () => {
      try {
        console.log('🔄 Fetching test deliveries...');
        
        const response = await fetch('/api/deliveries/sync?userId=test-user-123');
        const data = await response.json();
        
        if (data.success) {
          setDeliveries(data.deliveries);
          console.log(`✅ Loaded ${data.deliveries.length} deliveries`);
        } else {
          throw new Error(data.error || 'Failed to fetch deliveries');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error('❌ Error fetching deliveries:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveries();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-transparent border-t-current rounded-full animate-spin text-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading deliveries...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-xl mb-4">❌ Error</div>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Test Deliveries</h1>
          <p className="text-gray-600">Testing live UPS tracking integration</p>
        </div>

        <div className="space-y-6">
          {deliveries.map((delivery) => (
            <div key={delivery.id} className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{delivery.productName}</h3>
                  <p className="text-sm text-gray-600">
                    {delivery.productBrand} • Size {delivery.productSize}
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {delivery.carrier}
                  </span>
                  <p className="text-sm text-gray-500 mt-1">
                    {delivery.trackingNumber}
                  </p>
                </div>
              </div>

              {/* Live Tracking Status */}
              {delivery.liveTracking && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-800">Live Tracking Active</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <p className="font-medium text-gray-900">
                        {delivery.liveTracking.status?.replace('_', ' ').toUpperCase() || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Last Update</p>
                      <p className="font-medium text-gray-900">
                        {new Date(delivery.liveTracking.lastUpdate).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Tracking Updates */}
                  {delivery.liveTracking.updates && delivery.liveTracking.updates.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Recent Updates</h4>
                      <div className="space-y-2">
                        {delivery.liveTracking.updates.slice(0, 3).map((update: any, index: number) => (
                          <div key={index} className="bg-white rounded p-3 border border-green-200">
                            <p className="text-sm text-gray-900">{update.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {update.location} • {new Date(update.timestamp).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Estimated Delivery</p>
                  <p className="font-medium text-gray-900">
                    {delivery.estimatedDelivery === 'TBD' 
                      ? 'To Be Determined' 
                      : new Date(delivery.estimatedDelivery).toLocaleDateString()
                    }
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">Origin</p>
                  <p className="font-medium text-gray-900">{delivery.origin}</p>
                </div>
                <div>
                  <p className="text-gray-600">Destination</p>
                  <p className="font-medium text-gray-900">{delivery.destination}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {deliveries.length === 0 && (
          <div className="bg-white rounded-lg p-12 text-center border border-gray-200">
            <div className="text-gray-400 text-4xl mb-4">📦</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No deliveries found</h3>
            <p className="text-gray-600">No test deliveries available.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TestDeliveriesPage;
