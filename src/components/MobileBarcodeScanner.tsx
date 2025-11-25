'use client';

import React, { useState, useEffect } from 'react';
import { X, Package, Footprints, AlertCircle } from 'lucide-react';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useTheme } from '../lib/contexts/ThemeContext';
import { db } from '../lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface MobileBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

interface ScanResult {
  type: 'package' | 'shoe' | 'unknown';
  value: string;
  matchedPurchase?: any;
  shoeInfo?: {
    brand?: string;
    model?: string;
    size?: string;
  };
}

const MobileBarcodeScanner: React.FC<MobileBarcodeScannerProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const { currentTheme } = useTheme();
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
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

    if (isOpen) {
      checkSupport();
    }
  }, [isOpen]);

  const detectBarcodeType = (barcode: string): 'package' | 'shoe' | 'unknown' => {
    // Package tracking number patterns
    const trackingPatterns = [
      /^1Z[0-9A-Z]{16}$/i, // UPS
      /^[0-9]{12,22}$/,     // FedEx, USPS
      /^[0-9]{20}$/,        // USPS
      /^94[0-9]{20}$/,      // USPS
      /^92[0-9]{20}$/,      // USPS
      /^[0-9]{15}$/,        // FedEx
    ];

    // Check if it's a tracking number
    for (const pattern of trackingPatterns) {
      if (pattern.test(barcode)) {
        return 'package';
      }
    }

    // UPC/EAN patterns (shoes typically use these)
    if (/^[0-9]{12,13}$/.test(barcode)) {
      return 'shoe';
    }

    return 'unknown';
  };

  const searchPurchaseByTracking = async (trackingNumber: string) => {
    if (!userId) return null;

    try {
      const purchasesRef = collection(db, 'purchases');
      const q = query(
        purchasesRef,
        where('userId', '==', userId),
        where('trackingNumber', '==', trackingNumber)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].data();
      }
      
      return null;
    } catch (error) {
      console.error('Error searching purchases:', error);
      return null;
    }
  };

  const lookupShoeInfo = async (upc: string) => {
    // This would integrate with your shoe database or API
    // For now, return basic info
    return {
      brand: 'Nike', // Would come from API
      model: 'Air Jordan 1', // Would come from API
      size: 'Unknown', // Would need to be determined from variant
    };
  };

  const startScanning = async () => {
    try {
      setError(null);
      setScanResult(null);
      setIsScanning(true);

      // Haptic feedback
      await Haptics.impact({ style: ImpactStyle.Medium });

      // Request camera permission
      const { camera } = await BarcodeScanner.requestPermissions();
      
      if (camera === 'granted') {
        // Hide the web content to show camera
        document.querySelector('body')?.classList.add('barcode-scanner-active');
        
        // Start scanning
        const listener = await BarcodeScanner.addListener('barcodeScanned', async (result) => {
          console.log('Barcode scanned:', result.barcode.rawValue);
          
          // Success haptic
          await Haptics.impact({ style: ImpactStyle.Heavy });
          
          const barcodeValue = result.barcode.rawValue;
          const barcodeType = detectBarcodeType(barcodeValue);
          
          let scanResult: ScanResult = {
            type: barcodeType,
            value: barcodeValue,
          };

          // If it's a package, search for matching purchase
          if (barcodeType === 'package') {
            const matchedPurchase = await searchPurchaseByTracking(barcodeValue);
            scanResult.matchedPurchase = matchedPurchase;
          }
          
          // If it's a shoe, look up info
          if (barcodeType === 'shoe') {
            const shoeInfo = await lookupShoeInfo(barcodeValue);
            scanResult.shoeInfo = shoeInfo;
          }

          setScanResult(scanResult);
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
      // Show the web content again
      document.querySelector('body')?.classList.remove('barcode-scanner-active');
      setIsScanning(false);
    } catch (err) {
      console.error('Error stopping barcode scanner:', err);
    }
  };

  const handleClose = () => {
    if (isScanning) {
      stopScanning();
    }
    setScanResult(null);
    setError(null);
    onClose();
  };

  const handleScanAgain = () => {
    setScanResult(null);
    setError(null);
    startScanning();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        backgroundColor: currentTheme === 'dark' ? '#111827' : '#ffffff',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{
          borderBottomColor: currentTheme === 'dark' ? '#374151' : '#e5e7eb',
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
        }}
      >
        <h2
          className="text-xl font-bold"
          style={{
            color: currentTheme === 'dark' ? '#ffffff' : '#111827',
          }}
        >
          Scan Barcode
        </h2>
        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <X
            size={24}
            style={{
              color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
            }}
          />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {!isSupported ? (
          <div className="text-center">
            <AlertCircle size={64} color="#ef4444" className="mx-auto mb-4" />
            <p
              className="text-lg mb-2"
              style={{
                color: currentTheme === 'dark' ? '#ffffff' : '#111827',
              }}
            >
              Scanner Not Available
            </p>
            <p
              className="text-sm"
              style={{
                color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
              }}
            >
              {error || 'Barcode scanning is only available on mobile devices'}
            </p>
          </div>
        ) : scanResult ? (
          // Show scan result
          <div className="w-full max-w-md">
            <div
              className="p-6 rounded-2xl mb-6"
              style={{
                backgroundColor: currentTheme === 'dark' ? '#1f2937' : '#f3f4f6',
              }}
            >
              {scanResult.type === 'package' ? (
                <>
                  <Package size={48} color="#3b82f6" className="mx-auto mb-4" />
                  <h3
                    className="text-xl font-bold text-center mb-2"
                    style={{
                      color: currentTheme === 'dark' ? '#ffffff' : '#111827',
                    }}
                  >
                    Package Scanned
                  </h3>
                  <p
                    className="text-center text-sm mb-4"
                    style={{
                      color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
                    }}
                  >
                    Tracking: {scanResult.value}
                  </p>
                  
                  {scanResult.matchedPurchase ? (
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: currentTheme === 'dark' ? '#065f46' : '#d1fae5',
                      }}
                    >
                      <p
                        className="font-semibold mb-2"
                        style={{
                          color: currentTheme === 'dark' ? '#ffffff' : '#065f46',
                        }}
                      >
                        ✓ Purchase Found!
                      </p>
                      <p
                        className="text-sm"
                        style={{
                          color: currentTheme === 'dark' ? '#d1fae5' : '#065f46',
                        }}
                      >
                        {scanResult.matchedPurchase.itemName || 'Item'}
                      </p>
                      <p
                        className="text-sm"
                        style={{
                          color: currentTheme === 'dark' ? '#d1fae5' : '#065f46',
                        }}
                      >
                        ${scanResult.matchedPurchase.price || 'N/A'}
                      </p>
                    </div>
                  ) : (
                    <div
                      className="p-4 rounded-lg"
                      style={{
                        backgroundColor: currentTheme === 'dark' ? '#7f1d1d' : '#fee2e2',
                      }}
                    >
                      <p
                        className="font-semibold"
                        style={{
                          color: currentTheme === 'dark' ? '#ffffff' : '#7f1d1d',
                        }}
                      >
                        No Purchase Found
                      </p>
                      <p
                        className="text-sm"
                        style={{
                          color: currentTheme === 'dark' ? '#fecaca' : '#7f1d1d',
                        }}
                      >
                        This tracking number isn't in your purchases.
                      </p>
                    </div>
                  )}
                </>
              ) : scanResult.type === 'shoe' ? (
                <>
                  <Footprints size={48} color="#3b82f6" className="mx-auto mb-4" />
                  <h3
                    className="text-xl font-bold text-center mb-2"
                    style={{
                      color: currentTheme === 'dark' ? '#ffffff' : '#111827',
                    }}
                  >
                    Shoe Scanned
                  </h3>
                  <p
                    className="text-center text-sm mb-4"
                    style={{
                      color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
                    }}
                  >
                    UPC: {scanResult.value}
                  </p>
                  
                  {scanResult.shoeInfo && (
                    <div
                      className="p-4 rounded-lg space-y-2"
                      style={{
                        backgroundColor: currentTheme === 'dark' ? '#1e3a8a' : '#dbeafe',
                      }}
                    >
                      <p
                        className="font-semibold"
                        style={{
                          color: currentTheme === 'dark' ? '#ffffff' : '#1e3a8a',
                        }}
                      >
                        {scanResult.shoeInfo.brand} {scanResult.shoeInfo.model}
                      </p>
                      <p
                        className="text-sm"
                        style={{
                          color: currentTheme === 'dark' ? '#bfdbfe' : '#1e3a8a',
                        }}
                      >
                        Size: {scanResult.shoeInfo.size}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <AlertCircle size={48} color="#f59e0b" className="mx-auto mb-4" />
                  <h3
                    className="text-xl font-bold text-center mb-2"
                    style={{
                      color: currentTheme === 'dark' ? '#ffffff' : '#111827',
                    }}
                  >
                    Unknown Barcode
                  </h3>
                  <p
                    className="text-center text-sm"
                    style={{
                      color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
                    }}
                  >
                    {scanResult.value}
                  </p>
                </>
              )}
            </div>

            <button
              onClick={handleScanAgain}
              className="w-full py-3 rounded-lg font-semibold transition-colors"
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
              }}
            >
              Scan Again
            </button>
          </div>
        ) : error ? (
          <div className="text-center">
            <AlertCircle size={64} color="#ef4444" className="mx-auto mb-4" />
            <p
              className="text-lg mb-4"
              style={{
                color: currentTheme === 'dark' ? '#ffffff' : '#111827',
              }}
            >
              {error}
            </p>
            <button
              onClick={startScanning}
              className="px-6 py-3 rounded-lg font-semibold"
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
              }}
            >
              Try Again
            </button>
          </div>
        ) : !isScanning ? (
          <div className="text-center">
            <div
              className="w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4)',
              }}
            >
              <Package size={64} color="#ffffff" />
            </div>
            <h3
              className="text-xl font-bold mb-2"
              style={{
                color: currentTheme === 'dark' ? '#ffffff' : '#111827',
              }}
            >
              Ready to Scan
            </h3>
            <p
              className="text-sm mb-6"
              style={{
                color: currentTheme === 'dark' ? '#9ca3af' : '#6b7280',
              }}
            >
              Scan a package tracking number or shoe barcode
            </p>
            <button
              onClick={startScanning}
              className="px-8 py-4 rounded-lg font-semibold text-lg"
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
              }}
            >
              Start Scanning
            </button>
          </div>
        ) : (
          // Camera is active - show overlay with guidance
          <div className="barcode-scanner-overlay fixed inset-0 flex flex-col items-center justify-center">
            {/* Scan frame */}
            <div className="relative">
              <div
                className="w-64 h-64 border-4 border-blue-500 rounded-2xl"
                style={{
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                }}
              >
                {/* Corner indicators */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg"></div>
                
                {/* Scanning line animation */}
                <div
                  className="absolute left-0 right-0 h-1 bg-blue-500 animate-pulse"
                  style={{
                    top: '50%',
                    boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
                  }}
                ></div>
              </div>
            </div>
            
            {/* Instructions */}
            <div className="mt-8 text-center px-6">
              <p className="text-white text-lg font-semibold mb-2">
                Point camera at barcode
              </p>
              <p className="text-white/80 text-sm">
                Position the barcode within the frame
              </p>
            </div>
            
            {/* Cancel button */}
            <button
              onClick={stopScanning}
              className="mt-8 px-8 py-3 rounded-full font-semibold"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.9)',
                color: '#ffffff',
                backdropFilter: 'blur(10px)',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileBarcodeScanner;

