'use client';

import { useState, useEffect } from 'react';
import GmailConnector from '../../components/GmailConnector';

export default function TestTrackingExtractionPage() {
  const [orderNumber, setOrderNumber] = useState('03-S1NF8EJ2BD');
  const [expectedTracking, setExpectedTracking] = useState('886737858181');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);

  // Check Gmail connection status (uses existing cookies from browser session)
  useEffect(() => {
    const checkGmailStatus = async () => {
      try {
        // First check client-side cookie as quick indicator
        const hasClientCookie = document.cookie.includes('gmail_connected=true');
        console.log('🍪 Checking Gmail connection (will use existing cookies if connected)...');
        
        const response = await fetch('/api/gmail/status');
        const data = await response.json();
        
        if (data.connected) {
          console.log('✅ Gmail is already connected! Using existing session.');
          setGmailConnected(true);
          setError(null); // Clear any previous errors
        } else {
          console.log('❌ Gmail not connected:', data.reason || 'Unknown');
          setGmailConnected(false);
        }
      } catch (err) {
        console.error('Error checking Gmail status:', err);
        setGmailConnected(false);
      }
    };
    
    // Check immediately
    checkGmailStatus();
    // Check periodically (every 3 seconds) to catch if user connects Gmail in another tab
    const interval = setInterval(checkGmailStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log(`🧪 Testing tracking extraction for order: ${orderNumber}`);
      
      const response = await fetch('/api/gmail/extract-tracking-via-gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: orderNumber
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Unknown error');
      }

      setResult(data);
      
      // Log to console for debugging
      console.log('✅ Test Result:', data);
      
      if (data.trackingNumber === expectedTracking) {
        console.log('🎉 SUCCESS! Tracking number matches expected value!');
      } else {
        console.warn('⚠️ WARNING: Tracking number does not match expected value');
        console.warn(`   Expected: ${expectedTracking}`);
        console.warn(`   Got: ${data.trackingNumber}`);
      }
    } catch (err: any) {
      console.error('❌ Test failed:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">🧪 Test Tracking Extraction</h1>
        
        {/* Gmail Connection Status */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Gmail Connection</h2>
          {gmailConnected ? (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                ✅ <strong>Gmail is connected!</strong> The test will use your existing Gmail session.
              </p>
            </div>
          ) : (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                ℹ️ <strong>Note:</strong> If Gmail is already connected elsewhere in the app, 
                the test will automatically detect and use that connection. Otherwise, connect Gmail below.
              </p>
            </div>
          )}
          <GmailConnector onConnectionChange={(connected) => {
            setGmailConnected(connected);
            if (connected) {
              setError(null); // Clear any previous errors
            }
          }} />
          {!gmailConnected && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                ⚠️ <strong>Gmail must be connected</strong> to run the tracking extraction test. 
                Connect Gmail above, or if already connected elsewhere, wait a moment for auto-detection.
              </p>
            </div>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Order Number
              </label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="03-S1NF8EJ2BD"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Tracking Number
              </label>
              <input
                type="text"
                value={expectedTracking}
                onChange={(e) => setExpectedTracking(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
                placeholder="886737858181"
              />
            </div>
            
            <button
              onClick={runTest}
              disabled={loading || !orderNumber || !gmailConnected}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? '🔄 Running Test...' : !gmailConnected ? '⚠️ Connect Gmail First' : '▶️ Run Test'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-red-800 mb-2">❌ Test Failed</h3>
            <p className="text-red-700">{error}</p>
            <div className="mt-4 text-sm text-red-600">
              <p><strong>Common issues:</strong></p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Make sure Gmail is connected in the app</li>
                <li>Verify the order number is correct</li>
                <li>Check that the order has been shipped</li>
                <li>Ensure the shipped email exists in Gmail</li>
              </ul>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">
              {result.trackingNumber === expectedTracking ? (
                <span className="text-green-600">✅ Test Passed!</span>
              ) : (
                <span className="text-yellow-600">⚠️ Test Completed (Mismatch)</span>
              )}
            </h3>
            
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Tracking Number</p>
                  <p className="text-lg font-mono font-semibold">{result.trackingNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Carrier</p>
                  <p className="text-lg font-semibold">{result.carrier || 'Unknown'}</p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-gray-600">Extracted Via</p>
                <p className="text-sm">{result.extractedVia || 'Unknown'}</p>
              </div>
              
              {result.fedexUrl && (
                <div>
                  <p className="text-sm text-gray-600">FedEx URL</p>
                  <p className="text-xs font-mono break-all text-blue-600">
                    <a href={result.fedexUrl} target="_blank" rel="noopener noreferrer">
                      {result.fedexUrl}
                    </a>
                  </p>
                </div>
              )}
              
              {result.note && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-sm text-blue-800">{result.note}</p>
                </div>
              )}
              
              {result.trackingNumber === expectedTracking ? (
                <div className="bg-green-50 border border-green-200 rounded p-4 mt-4">
                  <p className="text-green-800 font-semibold">🎉 Perfect Match!</p>
                  <p className="text-sm text-green-700 mt-1">
                    Extracted tracking number matches expected value: {expectedTracking}
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mt-4">
                  <p className="text-yellow-800 font-semibold">⚠️ Mismatch Detected</p>
                  <div className="text-sm text-yellow-700 mt-2 space-y-1">
                    <p>Expected: <span className="font-mono font-semibold">{expectedTracking}</span></p>
                    <p>Got: <span className="font-mono font-semibold">{result.trackingNumber}</span></p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 bg-gray-100 rounded-lg p-4">
          <h3 className="font-semibold mb-2">📋 Test Process</h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
            <li>Searches Gmail for "Order Verified & Shipped:" email</li>
            <li>Extracts "Track your order" link from email</li>
            <li>Navigates to StockX order page</li>
            <li>Clicks "Track Order" button</li>
            <li>Extracts tracking number from FedEx URL</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

