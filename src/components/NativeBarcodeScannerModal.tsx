'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, CheckCircle, Copy, RotateCcw, Zap } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

// QuaggaJS types
interface QuaggaResult {
  codeResult: {
    code: string;
    format: string;
    startInfo?: {
      error: number;
    };
  };
}

// Store the library reference
let Quagga: any = null;

// Add mobile console types
declare global {
  interface Window {
    eruda?: any;
  }
}

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
  const [scanStatus, setScanStatus] = useState<'scanning' | 'detected' | 'rejected'>('scanning');
  const [detectionProgress, setDetectionProgress] = useState<{ code: string; count: number } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerElementRef = useRef<HTMLDivElement>(null);
  const isQuaggaInitialized = useRef(false);

  // Initialize QuaggaJS library and mobile console
  useEffect(() => {
    const loadQuagga = async () => {
      try {
        if (typeof window !== 'undefined' && !Quagga) {
          // Load mobile console for debugging
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/eruda';
          script.onload = () => {
            if (window.eruda) {
              window.eruda.init();
              console.log('📱 Mobile console loaded - tap floating button to open');
            }
          };
          document.head.appendChild(script);
          
          // Dynamic import of QuaggaJS
          const QuaggaModule = await import('quagga');
          Quagga = QuaggaModule.default;
          console.log('✅ QuaggaJS library loaded successfully');
        }
      } catch (error) {
        console.error('❌ Failed to load QuaggaJS:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown library loading error';
        setError(`Failed to load barcode library: ${errorMsg}`);
      }
    };

    loadQuagga();
  }, []);

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

  // Validate barcode quality and format - STRICT validation
  const isValidBarcode = (code: string): boolean => {
    // Remove any whitespace
    const cleanCode = code.trim();
    
    console.log('🔍 Validating barcode:', cleanCode, 'Length:', cleanCode.length);
    
    // STRICT: Require minimum 12 characters for UPC/EAN (reject short partial reads)
    if (cleanCode.length < 12) {
      console.log('❌ Barcode too short (need 12+ for UPC/EAN):', cleanCode.length);
      return false;
    }
    
    // Check maximum length (most tracking numbers are under 30 characters)
    if (cleanCode.length > 30) {
      console.log('❌ Barcode too long:', cleanCode.length);
      return false;
    }
    
    // Check for valid characters (alphanumeric only)
    const validChars = /^[A-Za-z0-9]+$/;
    if (!validChars.test(cleanCode)) {
      console.log('❌ Invalid characters in barcode:', cleanCode);
      return false;
    }
    
    // Common barcode formats validation
    const isAllNumeric = /^[0-9]+$/.test(cleanCode);
    const hasLetters = /[A-Za-z]/.test(cleanCode);
    
    // UPC/EAN codes (like 882225829046 - 12 digits)
    if (isAllNumeric && (cleanCode.length === 12 || cleanCode.length === 13)) {
      console.log('✅ Valid UPC/EAN code:', cleanCode);
      return true;
    }
    
    // Tracking numbers (usually 10-22 mixed alphanumeric)
    if (cleanCode.length >= 10 && cleanCode.length <= 22) {
      // Must have either all numbers OR mixed alphanumeric (not all letters)
      if (isAllNumeric || (hasLetters && /[0-9]/.test(cleanCode))) {
        console.log('✅ Valid tracking format:', cleanCode);
        return true;
      }
    }
    
    // REJECT: Short random numbers that are often misreads
    if (isAllNumeric && cleanCode.length < 10) {
      console.log('❌ Rejected short number (likely misread):', cleanCode);
      return false;
    }
    
    console.log('❌ Barcode validation failed - unknown format:', cleanCode);
    return false;
  };

  // Start the scanning process with QuaggaJS
  const startScanning = (stream: MediaStream) => {
    if (!Quagga) {
      setError('QuaggaJS library not loaded yet. Please try again.');
      return;
    }

    // More robust DOM readiness check with multiple retries
    const initializeScanner = (attempt = 1, maxAttempts = 10) => {
      console.log(`🎯 Scanner initialization attempt ${attempt}/${maxAttempts}`);
      
      if (!scannerElementRef.current) {
        if (attempt < maxAttempts) {
          console.log(`Scanner container not ready, retrying in ${attempt * 100}ms...`);
          setTimeout(() => {
            initializeScanner(attempt + 1, maxAttempts);
          }, attempt * 100); // Exponential backoff
          return;
        } else {
          console.error('❌ Scanner container never became ready after multiple attempts');
          setError('Camera initialization failed. Please try manual entry.');
          return;
        }
      }

      // Container is ready, proceed with initialization
      console.log('✅ Scanner container is ready, initializing QuaggaJS...');
      
      try {
    setIsScanning(true);
        setError('');
        
        console.log('🎯 Starting QuaggaJS with container:', scannerElementRef.current);

        // QuaggaJS configuration - OPTIMIZED for full barcode detection
        const config = {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: scannerElementRef.current,
            constraints: {
              width: 1280,  // Higher resolution for better detail
              height: 720,
              facingMode: "environment"
            }
          },
          decoder: {
            readers: [
              "upc_reader",         // 12-digit product barcodes (PRIORITY)
              "ean_reader",         // 13-digit product barcodes  
              "code_128_reader",    // Common for shipping labels
              "code_39_reader",     // Industrial/shipping
              "upc_e_reader"        // Compact UPC
              // Removed ean_8_reader to prevent partial reads
            ]
          },
          locate: true,
          locator: {
            patchSize: "large",     // Larger patches for better detection
            halfSample: false       // Full resolution sampling
          },
          numOfWorkers: 4,          // More processing power
          frequency: 5,             // Slower, more thorough scanning
          debug: {
            showCanvas: false,
            showPatches: false,
            showFoundPatches: false,
            showSkeleton: false,
            showLabels: false,
            showPatchLabels: false,
            showRemainingPatchLabels: false,
            boxFromPatches: {
              showTransformed: false,
              showTransformedBox: false,
              showBB: false
            }
          }
        };

        // Initialize Quagga
        Quagga.init(config, (err: any) => {
          if (err) {
            console.error('❌ QuaggaJS initialization failed:', err);
            setError(`Camera initialization failed. Please try manual entry.`);
            setIsScanning(false);
            return;
          }

          console.log('✅ QuaggaJS initialized successfully');
          isQuaggaInitialized.current = true;
          setScanStatus('scanning');
          
          // Start scanning
          Quagga.start();
          
          // Add processed event for debugging
          Quagga.onProcessed((result: any) => {
            console.log('📸 Frame processed by QuaggaJS:', { 
              hasResult: !!result,
              timestamp: new Date().toISOString().split('T')[1] 
            });
            
            // Log any partial detections for debugging
            if (result && result.codeResult && result.codeResult.code) {
              console.log('🔍 Partial detection found:', result.codeResult.code, 'Format:', result.codeResult.format);
            }
          });

          // Set up detection handler with confidence-based validation
          Quagga.onDetected((result: QuaggaResult) => {
            const code = result.codeResult.code;
            const format = result.codeResult.format;
            
            // Get quality metrics from QuaggaJS
            const quality = result.codeResult.startInfo?.error || 1;
            const isHighQuality = quality < 0.4; // BALANCED: Good quality threshold
            
            console.log('🔍 RAW Barcode detected:', { 
              code, 
              format, 
              quality: quality.toFixed(3), 
              isHighQuality,
              length: code.length 
            });
    
            // Show detection feedback
            setScanStatus('detected');
            setTimeout(() => setScanStatus('scanning'), 800);
            
            // Quality check - require reasonable quality
            if (!isHighQuality) {
              console.log('⚠️ Low quality read, skipping (error:', quality.toFixed(3), ')');
              return;
            }
            
            // Validate barcode format and length
            if (isValidBarcode(code)) {
              console.log('✅ Valid barcode format confirmed:', code);
              handleBarcodeDetected(code);
            } else {
              console.log('❌ Invalid format, rejecting:', code, 'Length:', code.length);
            }
          });
        });

        console.log('✅ QuaggaJS setup completed');
        
      } catch (error: any) {
        console.error('❌ QuaggaJS setup error:', error);
        setError(`Camera setup failed. Please try manual entry.`);
        setIsScanning(false);
      }
    };

    // Start the initialization process
    initializeScanner();
  };

  // Handle barcode detection with confidence-based validation
  const detectionHashRef = useRef<{ [key: string]: number }>({});
  const REQUIRED_DETECTIONS = 3; // Require 3 consistent detections
  
  const handleBarcodeDetected = (barcode: string) => {
    console.log('📱 Barcode detected:', barcode);
    
    // Initialize detection count for this barcode
    if (!detectionHashRef.current[barcode]) {
      detectionHashRef.current[barcode] = 0;
    }
    
    // Increment detection count
    detectionHashRef.current[barcode]++;
    
    console.log(`🔢 Detection count for ${barcode}: ${detectionHashRef.current[barcode]}/${REQUIRED_DETECTIONS}`);
    
    // Update progress display
    setDetectionProgress({ code: barcode, count: detectionHashRef.current[barcode] });
    
    // Check if we have enough consistent detections
    if (detectionHashRef.current[barcode] >= REQUIRED_DETECTIONS) {
      console.log('✅ Barcode confirmed with sufficient detections:', barcode);
      
      // Reset detection hash and progress
      detectionHashRef.current = {};
      setDetectionProgress(null);
      
      // Trigger haptic feedback if available
    if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
    }
    
      console.log('✅ Barcode accepted:', barcode);
    setScannedResult(barcode);
    stopScanning();
    setScanAttempts(prev => prev + 1);
    } else {
      console.log(`⏳ Waiting for more detections: ${barcode} (${detectionHashRef.current[barcode]}/${REQUIRED_DETECTIONS})`);
      
      // Clean up old detections to prevent memory buildup
      const currentTime = Date.now();
      if (!detectionHashRef.current._lastCleanup || currentTime - detectionHashRef.current._lastCleanup > 10000) {
        const oldCount = Object.keys(detectionHashRef.current).length;
        detectionHashRef.current = { [barcode]: detectionHashRef.current[barcode] };
        detectionHashRef.current._lastCleanup = currentTime;
        setDetectionProgress({ code: barcode, count: detectionHashRef.current[barcode] });
        console.log(`🧹 Cleaned up detection hash (was ${oldCount} entries)`);
      }
    }
  };

  // Stop scanning and cleanup
  const stopScanning = () => {
    setIsScanning(false);
    
    try {
      if (Quagga && isQuaggaInitialized.current) {
        Quagga.stop();
        isQuaggaInitialized.current = false;
        console.log('✅ QuaggaJS stopped');
      }
    } catch (error) {
      console.error('Error stopping Quagga:', error);
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
    setScanStatus('scanning');
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

  // Ensure DOM element is ready for scanning
  useEffect(() => {
    if (isOpen) {
      // Force a check for the scanner container after modal renders
      setTimeout(() => {
        if (scannerElementRef.current) {
          console.log('✅ Scanner container is ready:', scannerElementRef.current);
        } else {
          console.log('⚠️ Scanner container still not available after modal open');
        }
      }, 50);
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
              {/* QuaggaJS Scanner Container - Always render but hide when not scanning */}
              <div
                ref={scannerElementRef}
                className={`scanner-container absolute inset-0 w-full h-full z-10 ${
                  permissionState === 'granted' && isScanning ? 'block' : 'hidden'
                }`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 10
                }}
              />
              

              {permissionState === 'granted' && isScanning ? (
                <>
                  {/* Scanning Overlay - Higher z-index to appear above camera */}
                  <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                    <div className="relative">
                      {/* Scanning Frame */}
                      <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                        {/* Corner indicators - Brighter green */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-xl shadow-lg shadow-green-400/50"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-xl shadow-lg shadow-green-400/50"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-xl shadow-lg shadow-green-400/50"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-xl shadow-lg shadow-green-400/50"></div>
                        
                        {/* Scanning Line Animation */}
                        <div className="absolute inset-0 overflow-hidden rounded-2xl">
                          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse shadow-lg shadow-green-400/50"></div>
                        </div>
                        
                        {/* Center cross-hair */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                          <div className="w-8 h-0.5 bg-green-400 shadow-lg shadow-green-400/50"></div>
                          <div className="w-0.5 h-8 bg-green-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-lg shadow-green-400/50"></div>
                        </div>
                      </div>
                      
                      {/* Instructions */}
                      <div className="absolute top-full mt-6 left-1/2 transform -translate-x-1/2 text-center">
                        <div className={`text-lg font-semibold mb-2 px-4 py-2 rounded-lg transition-all ${
                          scanStatus === 'scanning' ? 'text-white bg-black/50' :
                          scanStatus === 'detected' ? 'text-green-300 bg-green-900/50' :
                          'text-red-300 bg-red-900/50'
                        }`}>
                          {scanStatus === 'scanning' && '📱 Point camera at barcode'}
                          {scanStatus === 'detected' && '✅ Barcode detected!'}
                          {scanStatus === 'rejected' && '❌ Poor quality - try again'}
                        </div>
                        <p className="text-gray-300 text-sm bg-black/50 px-3 py-1 rounded-lg">
                          {scanStatus === 'scanning' && 'Need 12+ digit UPC/EAN code'}
                          {scanStatus === 'detected' && 'Processing barcode...'}
                          {scanStatus === 'rejected' && 'Looking for valid barcode...'}
                        </p>
                        {/* Detection Progress */}
                        {detectionProgress && (
                          <div className="mt-3 bg-black/70 px-4 py-2 rounded-lg border border-white/20">
                            <p className="text-white text-sm font-medium">
                              Confirming: {detectionProgress.code.length > 8 ? `${detectionProgress.code.substring(0, 8)}...` : detectionProgress.code}
                            </p>
                            <div className="flex items-center mt-1">
                              <div className="flex-1 bg-white/20 rounded-full h-1.5 mr-2">
                                <div 
                                  className="bg-green-400 h-1.5 rounded-full transition-all duration-300"
                                  style={{ width: `${(detectionProgress.count / REQUIRED_DETECTIONS) * 100}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-300">
                                {detectionProgress.count}/{REQUIRED_DETECTIONS}
                              </span>
                            </div>
                          </div>
                        )}
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
