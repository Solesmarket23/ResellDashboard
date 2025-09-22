'use client';

import { useState } from 'react';
import UPSOAuthButton from './UPSOAuthButton';
import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';

interface UPSOAuthExampleProps {
  userId: string;
}

export default function UPSOAuthExample({ userId }: UPSOAuthExampleProps) {
  const { isAuthenticated, tokenInfo, error } = useUPSOAuth(userId);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingResult, setTrackingResult] = useState<any>(null);
  const [isTracking, setIsTracking] = useState(false);

  const handleTrackPackage = async () => {
    if (!trackingNumber.trim()) return;

    setIsTracking(true);
    setTrackingResult(null);

    try {
      // In a real implementation, you would use the OAuth token
      // to make authenticated UPS API calls
      const response = await fetch('/api/tracking/ups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // The OAuth token would be automatically included
          // by your API route using the UPSOAuthIntegrationService
        },
        body: JSON.stringify({
          trackingNumber: trackingNumber.trim(),
          userId: userId
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTrackingResult(result);
      } else {
        const error = await response.json();
        setTrackingResult({ error: error.message || 'Tracking failed' });
      }
    } catch (error) {
      setTrackingResult({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    } finally {
      setIsTracking(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        UPS OAuth Integration Example
      </h2>

      {/* OAuth Status */}
      <div className="mb-6">
        <UPSOAuthButton
          userId={userId}
          onAuthSuccess={(tokenInfo) => {
            console.log('UPS OAuth successful:', tokenInfo);
          }}
          onAuthError={(error) => {
            console.error('UPS OAuth error:', error);
          }}
        />
      </div>

      {/* Tracking Form */}
      {isAuthenticated && (
        <div className="space-y-4">
          <div>
            <label htmlFor="trackingNumber" className="block text-sm font-medium text-gray-700">
              UPS Tracking Number
            </label>
            <div className="mt-1 flex rounded-md shadow-sm">
              <input
                type="text"
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter UPS tracking number"
                className="flex-1 min-w-0 block w-full px-3 py-2 border border-gray-300 rounded-l-md focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <button
                onClick={handleTrackPackage}
                disabled={isTracking || !trackingNumber.trim()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTracking ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Tracking...
                  </>
                ) : (
                  'Track Package'
                )}
              </button>
            </div>
          </div>

          {/* Tracking Result */}
          {trackingResult && (
            <div className="mt-4">
              {trackingResult.error ? (
                <div className="bg-red-50 border border-red-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Tracking Error
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{trackingResult.error}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">
                        Tracking Information
                      </h3>
                      <div className="mt-2 text-sm text-green-700">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify(trackingResult, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* OAuth Token Info */}
          {tokenInfo && (
            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                OAuth Token Information
              </h4>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="font-medium text-gray-500">Token Type</dt>
                  <dd className="text-gray-900">{tokenInfo.token_type}</dd>
                </div>
                <div>
                  <dt className="font-medium text-gray-500">Expires In</dt>
                  <dd className="text-gray-900">{tokenInfo.expires_in} seconds</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-gray-500">Scope</dt>
                  <dd className="text-gray-900">{tokenInfo.scope}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      {!isAuthenticated && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                OAuth Required
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  You need to connect your UPS account using OAuth to track packages.
                  Click the "Connect with UPS OAuth" button above to get started.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
