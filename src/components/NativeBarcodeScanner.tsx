'use client';

import React, { useState, useEffect } from 'react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';

interface NativeBarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
  onClose: () => void;
}

const NativeBarcodeScanner: React.FC<NativeBarcodeScannerProps> = ({
  onBarcodeScanned,
  onClose,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if we're on a native platform
    const checkSupport = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const supported = await BarcodeScanner.isSupported();
          setIsSupported(supported.supported);
        } catch (err) {
          console.error('Error checking barcode scanner support:', err);
          setError('Barcode scanner not supported on this device');
        }
      } else {
        setError('Barcode scanner only works on mobile devices');
      }
    };

    checkSupport();
  }, []);

  const startScanning = async () => {
    try {
      setError(null);
      setIsScanning(true);

      // Request camera permission
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera === 'granted') {
        // Start scanning
        const listener = await BarcodeScanner.addListener('barcodeScanned', (result) => {
          console.log('Barcode scanned:', result.barcode);
          onBarcodeScanned(result.barcode.rawValue);
          stopScanning();
        });

        await BarcodeScanner.startScan();
      } else {
        setError('Camera permission denied');
        setIsScanning(false);
      }
    } catch (err) {
      console.error('Error starting barcode scanner:', err);
      setError('Failed to start barcode scanner');
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      await BarcodeScanner.stopScan();
      await BarcodeScanner.removeAllListeners();
      setIsScanning(false);
    } catch (err) {
      console.error('Error stopping barcode scanner:', err);
    }
  };

  const handleClose = () => {
    if (isScanning) {
      stopScanning();
    }
    onClose();
  };

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      if (isScanning) {
        stopScanning();
      }
    };
  }, [isScanning]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Native Barcode Scanner
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {!isSupported ? (
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Native barcode scanning is only available on mobile devices.
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="text-center">
              {!isScanning ? (
                <>
                  <div className="mb-4">
                    <svg className="w-16 h-16 mx-auto text-blue-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <p className="text-gray-600 dark:text-gray-400">
                      Tap the button below to start scanning barcodes with your camera
                    </p>
                  </div>
                  <button
                    onClick={startScanning}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
                  >
                    Start Scanning
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                    <p className="text-gray-600 dark:text-gray-400">
                      Scanning... Point your camera at a barcode
                    </p>
                  </div>
                  <button
                    onClick={stopScanning}
                    className="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                  >
                    Stop Scanning
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NativeBarcodeScanner; 