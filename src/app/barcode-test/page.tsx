'use client';

import React, { useState } from 'react';
import ScanPackageModal from '../../components/ScanPackageModal';
import NativeBarcodeScanner from '../../components/NativeBarcodeScanner';
import { Capacitor } from '@capacitor/core';

const BarcodeTestPage = () => {
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [showNativeScanner, setShowNativeScanner] = useState(false);
  const [scannedResults, setScannedResults] = useState<string[]>([]);

  const handleNativeScanComplete = (barcode: string) => {
    console.log('Native scan complete:', barcode);
    setScannedResults(prev => [...prev, `Native: ${barcode}`]);
    setShowNativeScanner(false);
  };

  const handlePackageScanComplete = (barcode: string) => {
    console.log('Package scan complete:', barcode);
    setScannedResults(prev => [...prev, `Package: ${barcode}`]);
    setShowPackageModal(false);
  };

  const clearResults = () => {
    setScannedResults([]);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          📱 Barcode Scanner Test
        </h1>

                 {/* Platform Info */}
         <div className="mb-6 p-4 bg-blue-50 rounded-lg">
           <h3 className="font-semibold text-blue-900 mb-2">Platform Info:</h3>
           <div className="text-sm text-blue-800 space-y-1">
             <div>• Platform: {Capacitor.getPlatform()}</div>
             <div>• Native: {Capacitor.isNativePlatform() ? 'Yes' : 'No'}</div>
             <div>• User Agent: {typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 50) + '...' : 'Server-side rendering'}</div>
           </div>
         </div>

        {/* Test Buttons */}
        <div className="space-y-4 mb-6">
          <button
            onClick={() => setShowPackageModal(true)}
            className="w-full py-3 px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
          >
            📦 Test Package Scanner Modal
          </button>

          {Capacitor.isNativePlatform() && (
            <button
              onClick={() => setShowNativeScanner(true)}
              className="w-full py-3 px-4 bg-purple-500 text-white rounded-lg hover:bg-purple-600 font-medium"
            >
              📱 Test Native Scanner (Direct)
            </button>
          )}

          {!Capacitor.isNativePlatform() && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                📱 Native scanner only works on mobile devices. Use the Package Scanner to test web-based scanning.
              </p>
            </div>
          )}
        </div>

        {/* Results */}
        {scannedResults.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Scanned Results:</h3>
              <button
                onClick={clearResults}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
              {scannedResults.map((result, index) => (
                <div
                  key={index}
                  className="py-2 px-3 mb-2 bg-white rounded border text-sm font-mono"
                >
                  {result}
                </div>
              ))}
            </div>
          </div>
        )}

                 {/* Instructions */}
         <div className="p-4 bg-gray-50 rounded-lg">
           <h3 className="font-semibold text-gray-900 mb-2">How to Test:</h3>
           <div className="text-sm text-gray-700 space-y-1">
             <div>1. 📱 On your phone, connect to same WiFi as your computer</div>
             <div>2. 📱 Open: <strong>your-computer-ip:3002/barcode-test</strong></div>
             <div>3. 📦 Click "Test Package Scanner Modal"</div>
             <div>4. 📷 Choose "Camera (Beta)" or "Native" scanner</div>
             <div>5. 🎯 Point camera at any barcode or QR code</div>
             <div>6. ✅ Check results appear below</div>
           </div>
         </div>
      </div>

      {/* Modals */}
      <ScanPackageModal
        isOpen={showPackageModal}
        onClose={() => setShowPackageModal(false)}
        onScanComplete={handlePackageScanComplete}
      />

      {showNativeScanner && (
        <NativeBarcodeScanner
          onClose={() => setShowNativeScanner(false)}
          onBarcodeScanned={handleNativeScanComplete}
        />
      )}
    </div>
  );
};

export default BarcodeTestPage; 