'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Package, CheckCircle, AlertTriangle, RotateCcw, Volume2, Loader } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface PackageScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete: (trackingNumber: string, packageType: 'UPS' | 'FedEx' | 'Other') => void;
  purchases: any[];
}

// Store the library reference
let Quagga: any = null;

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
  const [isLoading, setIsLoading] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerElementRef = useRef<HTMLDivElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const isQuaggaInitialized = useRef(false);
  const detectionHashRef = useRef<{ [key: string]: number }>({});
  const scanningRef = useRef(false);
  
  const REQUIRED_DETECTIONS = 2;

  // Initialize QuaggaJS library
  useEffect(() => {
    const loadQuagga = async () => {
      try {
        if (typeof window !== 'undefined' && !Quagga) {
          const QuaggaModule = await import('quagga');
          Quagga = QuaggaModule.default;
          console.log('📚 QuaggaJS loaded successfully');
        }
      } catch (error) {
        console.error('Failed to load QuaggaJS:', error);
      }
    };

    if (isOpen) {
      loadQuagga();
    }
  }, [isOpen]);

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

  // Initialize camera with better error handling
  const initializeCamera = async () => {
    try {
      setPermissionState('requesting');
      setError('');
      setIsLoading(true);

      console.log('📷 Requesting camera access...');

      // Try different camera constraints for better mobile compatibility
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280, min: 640, max: 1920 },
          height: { ideal: 720, min: 480, max: 1080 },
          frameRate: { ideal: 30, min: 15, max: 60 }
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        console.warn('Failed with ideal constraints, trying fallback...');
        // Fallback to simpler constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { min: 320, ideal: 640, max: 1280 },
            height: { min: 240, ideal: 480, max: 720 }
          }
        });
      }

      cameraStream.current = stream;
      setPermissionState('granted');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to load
        videoRef.current.onloadedmetadata = () => {
          console.log('📷 Video metadata loaded');
          if (videoRef.current) {
            videoRef.current.play().then(() => {
              console.log('📷 Video playing');
              setIsScanning(true);
              setIsLoading(false);
              startQuaggaScanning();
            }).catch(error => {
              console.error('Video play error:', error);
              setError('Failed to start video playback');
              setIsLoading(false);
            });
          }
        };

        videoRef.current.onerror = (error) => {
          console.error('Video error:', error);
          setError('Video stream error');
          setIsLoading(false);
        };
      }
    } catch (error) {
      console.error('Camera initialization error:', error);
      setPermissionState('denied');
      setIsLoading(false);
      
      if (error.name === 'NotAllowedError') {
        setError('Camera access denied. Please enable camera permissions and try again.');
      } else if (error.name === 'NotFoundError') {
        setError('No camera found. Please check your device has a camera.');
      } else {
        setError('Camera access failed. Please try again or use manual input.');
      }
      
      playSound('error');
    }
  };

  // Start QuaggaJS scanning
  const startQuaggaScanning = async () => {
    if (!Quagga || !videoRef.current || !scannerElementRef.current) {
      console.error('QuaggaJS not ready');
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        Quagga.init({
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: scannerElementRef.current,
            constraints: {
              video: {
                facingMode: "environment",
                width: { min: 320, ideal: 640, max: 1280 },
                height: { min: 240, ideal: 480, max: 720 }
              }
            }
          },
          decoder: {
            readers: [
              "code_128_reader",
              "ean_reader",
              "ean_8_reader",
              "code_39_reader",
              "code_39_vin_reader",
              "codabar_reader",
              "upc_reader",
              "upc_e_reader",
              "i2of5_reader"
            ]
          },
          locate: true,
          locator: {
            patchSize: "medium",
            halfSample: true
          },
          numOfWorkers: 2,
          frequency: 10,
          debug: false
        }, (err) => {
          if (err) {
            console.error('QuaggaJS init error:', err);
            reject(err);
          } else {
            console.log('✅ QuaggaJS initialized');
            resolve();
          }
        });
      });

      scanningRef.current = true;
      isQuaggaInitialized.current = true;
      
      Quagga.start();
      
      // Set up detection handler
      Quagga.onDetected((result: any) => {
        if (result && result.codeResult && result.codeResult.code) {
          const code = result.codeResult.code.trim();
          const confidence = result.codeResult.startInfo?.error || 0;
          
          // Only process high-confidence results
          if (confidence < 0.5) {
            handleBarcodeDetection(code);
          }
        }
      });

    } catch (error) {
      console.error('QuaggaJS setup error:', error);
      setError('Scanner initialization failed. Please try again.');
    }
  };

  // Handle barcode detection with confidence tracking
  const handleBarcodeDetection = (code: string) => {
    if (!scanningRef.current || scannedResult) return;

    console.log('🔍 Barcode detected:', code);

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

      // Stop scanning
      if (isQuaggaInitialized.current && Quagga) {
        Quagga.stop();
        isQuaggaInitialized.current = false;
      }

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
    console.log('🛑 Stopping scanner...');
    scanningRef.current = false;
    setIsScanning(false);

    if (cameraStream.current) {
      cameraStream.current.getTracks().forEach(track => {
        track.stop();
        console.log('📷 Camera track stopped');
      });
      cameraStream.current = null;
    }

    if (isQuaggaInitialized.current && Quagga) {
      try {
        Quagga.stop();
        isQuaggaInitialized.current = false;
        console.log('📚 QuaggaJS stopped');
      } catch (error) {
        console.warn('QuaggaJS stop error:', error);
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
    setIsLoading(false);
    setShowManualInput(false);
    setManualInput('');
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
    setIsLoading(false);
    detectionHashRef.current = {};
    
    // Restart scanning
    setTimeout(() => {
      initializeCamera();
    }, 500);
  };

  // Handle manual input
  const handleManualSubmit = () => {
    if (!manualInput.trim()) return;

    const code = manualInput.trim();
    setScannedResult(code);
    setScanStatus('detected');
    
    const type = detectPackageType(code);
    setPackageType(type);
    
    const match = findMatchingPurchase(code);
    setMatchedPurchase(match);
    
    if (match) {
      setScanStatus('success');
      playSound('success');
    } else {
      setScanStatus('no-match');
    }
    
    setShowManualInput(false);
  };

  // Initialize on open
  useEffect(() => {
    if (isOpen) {
      initializeCamera();
    }

    return () => {
      stopScanning();
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

        {/* Camera/Scanner Area */}
        <div className="flex-1 relative bg-black overflow-hidden">
          {/* Loading State */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Loader className="w-12 h-12 mx-auto mb-4 animate-spin" />
                <p>Starting camera...</p>
              </div>
            </div>
          )}

          {/* Permission Requesting */}
          {permissionState === 'requesting' && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white">
                <Camera className="w-12 h-12 mx-auto mb-4 animate-pulse" />
                <p>Requesting camera access...</p>
              </div>
            </div>
          )}

          {/* Permission Denied */}
          {permissionState === 'denied' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
                <p className="mb-4">{error}</p>
                <div className="space-y-2">
                  <button
                    onClick={initializeCamera}
                    className="block w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setShowManualInput(true)}
                    className="block w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Enter Manually
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Scanner Elements */}
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              playsInline
              muted
              style={{ display: isScanning ? 'block' : 'none' }}
            />
            <div 
              ref={scannerElementRef}
              className="absolute inset-0"
              style={{ display: isScanning ? 'block' : 'none' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ display: 'none' }}
            />
          </div>

          {/* Scanning Overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none">
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

          {/* Manual Input Modal */}
          {showManualInput && (
            <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4">
              <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 w-full max-w-sm`}>
                <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
                  Enter Tracking Number
                </h3>
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="1Z123456789012345 or 1234567890"
                  className={`w-full p-3 border rounded-lg mb-4 ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-black/20 border-white/20 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                  autoFocus
                />
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowManualInput(false)}
                    className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                      currentTheme.name === 'Neon' 
                        ? 'bg-white/10 hover:bg-white/20 text-gray-300' 
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleManualSubmit}
                    className={`flex-1 py-2 px-4 rounded-lg transition-colors ${
                      currentTheme.name === 'Neon' 
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600' 
                        : 'bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600'
                    } text-white font-medium`}
                  >
                    Submit
                  </button>
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
          {scanStatus === 'scanning' && !isLoading && (
            <div className="text-center">
              <p className={`${currentTheme.colors.textPrimary} mb-2`}>
                Point camera at package barcode
              </p>
              {detectionProgress && (
                <p className={`text-sm ${currentTheme.colors.textSecondary}`}>
                  Detecting: {detectionProgress.code} ({detectionProgress.count}/{REQUIRED_DETECTIONS})
                </p>
              )}
              <button
                onClick={() => setShowManualInput(true)}
                className={`mt-2 text-sm ${currentTheme.colors.accent} hover:underline`}
              >
                Enter manually instead
              </button>
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
                This tracking number doesn&apos;t match any orders
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