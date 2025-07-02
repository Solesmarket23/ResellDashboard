'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, CheckCircle, Copy, RotateCcw, Zap } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface NativeBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (trackingNumber: string) => void;
}

const NativeBarcodeScannerModal = ({ isOpen, onClose, onScanComplete }: NativeBarcodeScannerModalProps) => {
  const { currentTheme } = useTheme();
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [permissionState, setPermissionState] = useState<'initial' | 'requesting' | 'granted' | 'denied'>('initial');
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [scanAttempts, setScanAttempts] = useState(0);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualInput, setManualInput] = useState('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Mock scan results for demo (in real app, this would use actual barcode detection)
  const mockBarcodes = [
    '1Z12345E6205277936', // UPS
    '9400109699939926709875', // USPS
    '123456789012', // FedEx 
    '1Z999AA1012345675', // UPS
    '9361289999995723456789' // USPS
  ];

  // Check if camera API is supported
  const isCameraSupported = () => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  // Check if HTTPS is required and not available
  const isHttpsRequired = () => {
    // Allow localhost, 127.0.0.1, and local network IPs without HTTPS
    const hostname = location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLocalNetwork = hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.');
    
    return location.protocol !== 'https:' && !isLocalhost && !isLocalNetwork;
  };

  // Request camera permission with explicit user interaction
  const requestCameraPermission = async () => {
    setPermissionState('requesting');
    setError('');
    
    try {
      console.log('🎥 Checking camera support...');
      console.log('User Agent:', navigator.userAgent);
      console.log('Location:', location.href);
      console.log('Navigator mediaDevices available:', !!navigator.mediaDevices);
      console.log('getUserMedia available:', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
      
      // Check if camera API is supported
      if (!isCameraSupported()) {
        throw new Error('Camera API not supported in this browser. Please try the manual entry option below.');
      }
      
      // Check if HTTPS is required
      if (isHttpsRequired()) {
        console.log('HTTPS required but not available');
        throw new Error('Camera access requires HTTPS. Please access this site using a secure connection.');
      }
      
      console.log('🎥 Requesting camera permission...');
      
      // For iOS Safari, try with simpler constraints first
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
      
      let videoConstraints: any = {
        facingMode: { ideal: 'environment' }, // Prefer rear camera
        width: { ideal: 1280 },
        height: { ideal: 720 }
      };
      
      // For iOS Safari, use simpler constraints
      if (isIOS && isSafari) {
        console.log('🍎 Detected iOS Safari, using simplified camera constraints');
        videoConstraints = {
          facingMode: 'environment' // Simpler constraint for iOS
        };
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints
      });
      
      console.log('✅ Camera permission granted');
      setCameraStream(stream);
      setPermissionState('granted');
      
      // Auto-start scanning once permission is granted
      startScanning(stream);
      
      return true;
    } catch (error: any) {
      console.error('❌ Camera permission error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      
      setPermissionState('denied');
      
      const userAgent = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(userAgent);
      const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
      
      if (error.name === 'NotAllowedError') {
        if (isIOS && isSafari) {
          setError('Camera access denied. After granting permission in Safari settings, you may need to refresh this page. Try the manual entry option below.');
        } else {
          setError('Camera permission denied. Please enable camera access in your browser settings and try again.');
        }
      } else if (error.name === 'NotFoundError') {
        setError('No camera found on this device. Please use the manual entry option below.');
      } else if (error.name === 'NotReadableError') {
        setError('Camera is already in use by another application. Please close other camera apps and try again.');
      } else if (error.message.includes('Camera API not supported')) {
        setError('Camera not supported in this browser. Please use the manual entry option below.');
      } else if (error.message.includes('requires HTTPS')) {
        setError('Camera access requires a secure connection (HTTPS). Please refresh the page or contact support.');
      } else {
        if (isIOS && isSafari) {
          setError('iOS Safari camera issue. Since you\'ve granted permission, try refreshing the page. Otherwise, use manual entry below.');
        } else {
          setError('Camera error: ' + (error.message || 'Unknown error occurred') + '. Try the manual entry option below.');
        }
      }
      
      return false;
    }
  };

  // Start the scanning process
  const startScanning = (stream: MediaStream) => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    video.srcObject = stream;
    video.play();
    
    setIsScanning(true);
    
    // Simulate barcode detection (in real app, use actual barcode detection library)
    const simulateBarcodeScan = () => {
      if (Math.random() > 0.7) { // 30% chance to "detect" a barcode
        const randomBarcode = mockBarcodes[Math.floor(Math.random() * mockBarcodes.length)];
        handleBarcodeDetected(randomBarcode);
      }
    };
    
    // Start scanning simulation
    scanIntervalRef.current = setInterval(simulateBarcodeScan, 2000);
  };

  // Handle barcode detection
  const handleBarcodeDetected = (barcode: string) => {
    console.log('📱 Barcode detected:', barcode);
    
    // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
      navigator.vibrate([100]);
    }
    
    setScannedResult(barcode);
    stopScanning();
    setScanAttempts(prev => prev + 1);
  };

  // Stop scanning and cleanup
  const stopScanning = () => {
    setIsScanning(false);
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Copy result to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      
      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([50]);
      }
    } catch (error) {
      console.error('Copy failed:', error);
    }
  };

  // Handle manual input submission
  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      setScannedResult(manualInput.trim());
      setShowManualInput(false);
      setManualInput('');
    }
  };

  // Toggle manual input mode
  const toggleManualInput = () => {
    setShowManualInput(!showManualInput);
    if (showManualInput) {
      setManualInput('');
    }
  };

  // Start new scan
  const startNewScan = () => {
    setScannedResult(null);
    setError('');
    setPermissionState('initial');
    setShowManualInput(false);
    setManualInput('');
  };

  // Close modal and cleanup
  const handleClose = () => {
    stopScanning();
    setScannedResult(null);
    setError('');
    setPermissionState('initial');
    setScanAttempts(0);
    setShowManualInput(false);
    setManualInput('');
    onClose();
  };

  // Submit result
  const handleSubmit = () => {
    if (scannedResult && onScanComplete) {
      onScanComplete(scannedResult);
    }
    handleClose();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  // Handle modal close when isOpen changes
  useEffect(() => {
    if (!isOpen) {
      stopScanning();
      setScannedResult(null);
      setError('');
      setPermissionState('initial');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-sm">
        <h1 className="text-white text-lg font-semibold">Barcode Scanner</h1>
        <button
          onClick={handleClose}
          className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          <X className="w-6 h-6 text-white" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {scannedResult ? (
          // Success State
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            
            <h2 className="text-white text-xl font-bold mb-2">Barcode Scanned!</h2>
            <p className="text-gray-300 text-sm mb-6">Successfully detected tracking number</p>
            
            {/* Scanned Result */}
            <div className="w-full max-w-sm bg-white/10 backdrop-blur-sm rounded-2xl p-4 mb-6">
              <div className="text-gray-400 text-xs uppercase tracking-wide mb-2">Tracking Number</div>
              <div className="text-white text-lg font-mono break-all">{scannedResult}</div>
            </div>
            
            {/* Action Buttons */}
            <div className="w-full max-w-sm space-y-3">
              <button
                onClick={() => copyToClipboard(scannedResult)}
                className="w-full flex items-center justify-center px-6 py-4 bg-white/20 hover:bg-white/30 rounded-2xl text-white font-semibold transition-all duration-200"
              >
                <Copy className="w-5 h-5 mr-2" />
                Copy to Clipboard
              </button>
              
              <button
                onClick={handleSubmit}
                className="w-full flex items-center justify-center px-6 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-semibold transition-all duration-200"
              >
                <Zap className="w-5 h-5 mr-2" />
                Add to Tracking
              </button>
              
              <button
                onClick={startNewScan}
                className="w-full flex items-center justify-center px-6 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-semibold transition-all duration-200"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Scan Again
              </button>
            </div>
          </div>
        ) : (
          // Scanning State
          <div className="flex-1 flex flex-col">
            {/* Camera View */}
            <div className="flex-1 relative bg-black">
              {permissionState === 'granted' && isScanning ? (
                <>
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  
                  {/* Scanning Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Scanning Frame */}
                      <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                        {/* Corner indicators */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-xl"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-xl"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-xl"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-xl"></div>
                        
                        {/* Scanning Line Animation */}
                        <div className="absolute inset-0 overflow-hidden rounded-2xl">
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse"></div>
                        </div>
                      </div>
                      
                      {/* Instructions */}
                      <div className="absolute top-full mt-6 left-1/2 transform -translate-x-1/2 text-center">
                        <p className="text-white text-lg font-semibold mb-2">Point camera at barcode</p>
                        <p className="text-gray-300 text-sm">Align barcode within the frame</p>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                // Permission / Error State
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  {permissionState === 'denied' || error ? (
                    <>
                      <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
                        <Camera className="w-10 h-10 text-red-400" />
                      </div>
                      <h2 className="text-white text-xl font-bold mb-2">Camera Access Required</h2>
                      <p className="text-gray-300 text-sm mb-6 max-w-sm">{error}</p>
                      
                      {/* Special iOS Safari refresh suggestion */}
                      {navigator.userAgent.toLowerCase().includes('iphone') && 
                       /safari/.test(navigator.userAgent.toLowerCase()) && 
                       !navigator.userAgent.toLowerCase().includes('chrome') && 
                       error.includes('Camera access denied') && (
                        <div className="mb-4 p-3 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                          <p className="text-blue-300 text-xs">
                            💡 <strong>iOS Safari Tip:</strong> Try refreshing this page after granting camera permission in Settings
                          </p>
                        </div>
                      )}
                      
                      {showManualInput ? (
                        <div className="w-full max-w-sm space-y-4">
                          <div>
                            <label className="block text-gray-300 text-sm mb-2">Enter Tracking Number</label>
                            <input
                              type="text"
                              value={manualInput}
                              onChange={(e) => setManualInput(e.target.value)}
                              placeholder="e.g. 1Z999AA1012345675"
                              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:bg-white/20"
                              onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
                            />
                          </div>
                          <div className="flex space-x-3">
                            <button
                              onClick={handleManualSubmit}
                              disabled={!manualInput.trim()}
                              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded-xl text-white font-semibold transition-all duration-200"
                            >
                              Add Tracking
                            </button>
                            <button
                              onClick={toggleManualInput}
                              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all duration-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <button
                            onClick={requestCameraPermission}
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-semibold transition-all duration-200"
                          >
                            Try Again
                          </button>
                          <button
                            onClick={toggleManualInput}
                            className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-semibold transition-all duration-200"
                          >
                            Enter Manually
                          </button>
                        </div>
                      )}
                    </>
                  ) : permissionState === 'requesting' ? (
                    <>
                      <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
                        <Camera className="w-10 h-10 text-blue-400 animate-pulse" />
                      </div>
                      <h2 className="text-white text-xl font-bold mb-2">Requesting Camera Access</h2>
                      <p className="text-gray-300 text-sm">Please allow camera permission when prompted</p>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
                        <Camera className="w-10 h-10 text-blue-400" />
                      </div>
                      <h2 className="text-white text-xl font-bold mb-2">Add Tracking Number</h2>
                      <p className="text-gray-300 text-sm mb-6 max-w-sm">
                        Choose how you'd like to add your tracking number
                      </p>
                      
                      {showManualInput ? (
                        <div className="w-full max-w-sm space-y-4">
                          <div>
                            <label className="block text-gray-300 text-sm mb-2">Enter Tracking Number</label>
                            <input
                              type="text"
                              value={manualInput}
                              onChange={(e) => setManualInput(e.target.value)}
                              placeholder="e.g. 1Z999AA1012345675"
                              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:bg-white/20"
                              onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
                              autoFocus
                            />
                          </div>
                          <div className="flex space-x-3">
                            <button
                              onClick={handleManualSubmit}
                              disabled={!manualInput.trim()}
                              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded-xl text-white font-semibold transition-all duration-200"
                            >
                              Add Tracking
                            </button>
                            <button
                              onClick={toggleManualInput}
                              className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all duration-200"
                            >
                              Back
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full max-w-sm space-y-3">
                          <button
                            onClick={toggleManualInput}
                            className="w-full px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white font-semibold transition-all duration-200 shadow-lg"
                          >
                            📝 Enter Manually
                          </button>
                          <button
                            onClick={requestCameraPermission}
                            className="w-full px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-white font-semibold transition-all duration-200"
                          >
                            📸 Scan with Camera
                          </button>
                          <p className="text-gray-400 text-xs text-center mt-3">
                            Manual entry is fast and reliable
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Bottom Controls */}
            {isScanning && (
              <div className="p-6 bg-black/50 backdrop-blur-sm">
                <button
                  onClick={stopScanning}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 rounded-2xl text-white font-semibold transition-all duration-200"
                >
                  Stop Scanning
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvas for barcode processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default NativeBarcodeScannerModal;
