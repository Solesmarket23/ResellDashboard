'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Package, CheckCircle, AlertTriangle, RotateCcw, Volume2 } from 'lucide-react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import { useTheme } from '../lib/contexts/ThemeContext';

interface PackageScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (trackingNumber: string, packageType: 'UPS' | 'FedEx' | 'Other') => void;
  purchases: any[];
}

const PackageScannerModal = ({ isOpen, onClose, onScanComplete, purchases }: PackageScannerModalProps) => {
  const { currentTheme } = useTheme();
  const [permissionState, setPermissionState] = useState<'unknown' | 'requesting' | 'granted' | 'denied'>('unknown');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'detected' | 'success' | 'no-match'>('scanning');
  const [detectionProgress, setDetectionProgress] = useState<{ code: string; count: number } | null>(null);
  const [matchedPurchase, setMatchedPurchase] = useState<any | null>(null);
  const [packageType, setPackageType] = useState<'UPS' | 'FedEx' | 'Other'>('Other');
  const [audioEnabled, setAudioEnabled] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const zxingReader = useRef<BrowserMultiFormatReader | null>(null);
  const detectionHashRef = useRef<{ [key: string]: number }>({});
  const scanningRef = useRef(false);
  
  const REQUIRED_DETECTIONS = 2; // Reduce for faster scanning

  // Audio feedback
  const playSound = (type: 'scan' | 'success' | 'error') => {
    if (!audioEnabled) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      switch (type) {
        case 'scan':
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          break;
        case 'success':
          oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          break;
        case 'error':
          oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          break;
      }
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
      console.log('Audio not available:', error);
    }
  };

  // Detect package type from tracking number
  const detectPackageType = (trackingNumber: string): 'UPS' | 'FedEx' | 'Other' => {
    const cleanNumber = trackingNumber.replace(/\s+/g, '').toUpperCase();
    
    // UPS patterns
    if (cleanNumber.startsWith('1Z') && cleanNumber.length === 18) {
      return 'UPS';
    }
    
    // FedEx patterns
    if (/^\d{12,14}$/.test(cleanNumber) || /^\d{20,22}$/.test(cleanNumber)) {
      return 'FedEx';
    }
    
    return 'Other';
  };

  // Find matching purchase by tracking number
  const findMatchingPurchase = (trackingNumber: string) => {
    const cleanScanned = trackingNumber.replace(/\s+/g, '').toLowerCase();
    
    return purchases.find(purchase => {
      if (!purchase.tracking) return false;
      const cleanPurchase = purchase.tracking.replace(/\s+/g, '').toLowerCase();
      return cleanPurchase === cleanScanned;
    });
  };

  // Initialize camera and scanner
  const startScanning = async () => {
    try {
      setPermissionState('requesting');
      setError('');
      setScanStatus('scanning');
      setScannedResult(null);
      setMatchedPurchase(null);
      detectionHashRef.current = {};

      // Get camera stream with mobile-optimized constraints
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Use back camera on mobile
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        }
      });

      cameraStream.current = stream;
      setPermissionState('granted');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);
        scanningRef.current = true;
        startZXingScanning();
      }
    } catch (error) {
      console.error('Camera error:', error);
      setPermissionState('denied');
      setError('Camera access denied. Please enable camera permissions and try again.');
      playSound('error');
    }
  };

  // ZXing scanning logic
  const startZXingScanning = () => {
    if (!zxingReader.current || !videoRef.current || !scanningRef.current) return;

    const scanFrame = async () => {
      if (!scanningRef.current || !videoRef.current) return;

      try {
        const result = await zxingReader.current!.decodeOnceFromVideoDevice(
          undefined,
          videoRef.current
        );

        if (result && result.getText()) {
          const scannedCode = result.getText().trim();
          handleBarcodeDetection(scannedCode);
        }
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          console.warn('ZXing scan error:', error);
        }
      }

      if (scanningRef.current) {
        setTimeout(scanFrame, 100); // Scan every 100ms
      }
    };

    scanFrame();
  };

  // Handle barcode detection with confidence tracking
  const handleBarcodeDetection = (code: string) => {
    if (!scanningRef.current || scannedResult) return;

    // Update detection count
    detectionHashRef.current[code] = (detectionHashRef.current[code] || 0) + 1;
    const detectionCount = detectionHashRef.current[code];

    setDetectionProgress({ code, count: detectionCount });

    if (detectionCount >= REQUIRED_DETECTIONS) {
      // Confirmed detection
      scanningRef.current = false;
      setScannedResult(code);
      setScanStatus('detected');
      playSound('scan');

      // Detect package type
      const type = detectPackageType(code);
      setPackageType(type);

      // Find matching purchase
      const match = findMatchingPurchase(code);
      setMatchedPurchase(match);

      if (match) {
        setScanStatus('success');
        playSound('success');
      } else {
        setScanStatus('no-match');
      }

      // Auto-close after success
      setTimeout(() => {
        handleComplete();
      }, 2000);
    }
  };

  // Stop scanning
  const stopScanning = () => {
    scanningRef.current = false;
    setIsScanning(false);

    if (cameraStream.current) {
      cameraStream.current.getTracks().forEach(track => track.stop());
      cameraStream.current = null;
    }

    if (zxingReader.current) {
      try {
        zxingReader.current.reset();
      } catch (error) {
        console.warn('ZXing reset error:', error);
      }
    }
  };

  // Handle complete scan
  const handleComplete = () => {
    if (scannedResult) {
      onScanComplete(scannedResult, packageType);
    }
    handleClose();
  };

  // Handle close
  const handleClose = () => {
    stopScanning();
    setScannedResult(null);
    setMatchedPurchase(null);
    setScanStatus('scanning');
    setDetectionProgress(null);
    setError('');
    onClose();
  };

  // Reset scanner
  const resetScanner = () => {
    stopScanning();
    setScannedResult(null);
    setMatchedPurchase(null);
    setScanStatus('scanning');
    setDetectionProgress(null);
    setError('');
    detectionHashRef.current = {};
    
    // Restart scanning
    setTimeout(() => {
      startScanning();
    }, 500);
  };

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      zxingReader.current = new BrowserMultiFormatReader();
      startScanning();
    }

    return () => {
      stopScanning();
      if (zxingReader.current) {
        try {
          zxingReader.current.reset();
          zxingReader.current = null;
        } catch (error) {
          console.warn('Cleanup error:', error);
        }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50">
      <div className={`relative w-full h-full max-w-md mx-auto ${currentTheme.colors.cardBackground} flex flex-col`}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 ${
          currentTheme.name === 'Neon' 
            ? 'bg-black/20 border-b border-white/10' 
            : 'bg-gray-50 border-b border-gray-200'
        }`}>
          <div className="flex items-center space-x-2">
            <Package className={`w-6 h-6 ${currentTheme.colors.accent}`} />
            <h2 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
              Scan Package
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                audioEnabled 
                  ? currentTheme.name === 'Neon' 
                    ? 'bg-cyan-500/20 text-cyan-400' 
                    : 'bg-blue-100 text-blue-600'
                  : currentTheme.name === 'Neon'
                    ? 'bg-white/10 text-gray-400'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleClose}
              className={`p-2 rounded-lg transition-colors ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Camera View */}
        <div className="flex-1 relative bg-black">
          {permissionState === 'requesting' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Camera className="w-12 h-12 text-white mx-auto mb-4 animate-pulse" />
                <p className="text-white">Requesting camera access...</p>
              </div>
            </div>
          )}

          {permissionState === 'denied' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                <p className="mb-4">{error}</p>
                <button
                  onClick={startScanning}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {isScanning && (
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
            />
          )}

          {/* Scanning Overlay */}
          {isScanning && (
            <div className="absolute inset-0">
              {/* Scanner frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                  <div className={`w-64 h-32 border-2 rounded-lg ${
                    scanStatus === 'detected' 
                      ? 'border-green-400 shadow-lg shadow-green-400/50' 
                      : scanStatus === 'success'
                        ? 'border-green-500'
                        : 'border-cyan-400'
                  } transition-all duration-300`}>
                    {/* Corner indicators */}
                    <div className={`absolute -top-1 -left-1 w-4 h-4 border-l-2 border-t-2 ${
                      scanStatus === 'detected' ? 'border-green-400' : 'border-cyan-400'
                    }`}></div>
                    <div className={`absolute -top-1 -right-1 w-4 h-4 border-r-2 border-t-2 ${
                      scanStatus === 'detected' ? 'border-green-400' : 'border-cyan-400'
                    }`}></div>
                    <div className={`absolute -bottom-1 -left-1 w-4 h-4 border-l-2 border-b-2 ${
                      scanStatus === 'detected' ? 'border-green-400' : 'border-cyan-400'
                    }`}></div>
                    <div className={`absolute -bottom-1 -right-1 w-4 h-4 border-r-2 border-b-2 ${
                      scanStatus === 'detected' ? 'border-green-400' : 'border-cyan-400'
                    }`}></div>
                    
                    {/* Scanning line animation */}
                    {scanStatus === 'scanning' && (
                      <div className="absolute inset-0 overflow-hidden rounded-lg">
                        <div className="absolute w-full h-0.5 bg-cyan-400 animate-pulse"
                             style={{
                               animation: 'scanLine 2s linear infinite',
                               top: '50%'
                             }}>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className={`p-4 ${
          currentTheme.name === 'Neon' 
            ? 'bg-black/20 border-t border-white/10' 
            : 'bg-gray-50 border-t border-gray-200'
        }`}>
          {scanStatus === 'scanning' && (
            <div className="text-center">
              <p className={`${currentTheme.colors.textPrimary} mb-2`}>
                Point camera at package barcode
              </p>
              {detectionProgress && (
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  Detecting: {detectionProgress.code} ({detectionProgress.count}/{REQUIRED_DETECTIONS})
                </p>
              )}
            </div>
          )}

          {scanStatus === 'detected' && scannedResult && (
            <div className="text-center">
              <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className={`${currentTheme.colors.textPrimary} font-medium mb-1`}>
                Package Detected!
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary} mb-2`}>
                {packageType} • {scannedResult}
              </p>
            </div>
          )}

          {scanStatus === 'success' && matchedPurchase && (
            <div className="text-center">
              <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className={`${currentTheme.colors.textPrimary} font-medium mb-1`}>
                Order Found!
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary} mb-2`}>
                {matchedPurchase.product.name}
              </p>
              <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                Order: {matchedPurchase.orderNumber}
              </p>
            </div>
          )}

          {scanStatus === 'no-match' && scannedResult && (
            <div className="text-center">
              <AlertTriangle className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <p className={`${currentTheme.colors.textPrimary} font-medium mb-1`}>
                Package not found
              </p>
              <p className={`text-sm ${currentTheme.colors.textSecondary} mb-2`}>
                {packageType} • {scannedResult}
              </p>
              <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                This tracking number doesn't match any orders
              </p>
            </div>
          )}

          {/* Action Buttons */}
          {(scanStatus === 'detected' || scanStatus === 'success' || scanStatus === 'no-match') && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={resetScanner}
                className={`flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg transition-colors ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Scan Again</span>
              </button>
              <button
                onClick={handleComplete}
                className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                  currentTheme.name === 'Neon' 
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600' 
                    : 'bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600'
                } text-white font-medium`}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes scanLine {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
};

export default PackageScannerModal;