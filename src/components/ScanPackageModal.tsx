'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, Smartphone, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

// Store the library references
let Html5QrcodeLib: any = null;

interface ScanPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (trackingNumber: string) => void;
}

const ScanPackageModal = ({ isOpen, onClose, onScanComplete }: ScanPackageModalProps) => {
  const { currentTheme } = useTheme();
  const [activeMode, setActiveMode] = useState<'camera' | 'manual'>('manual');
  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'active' | 'error' | 'permission-denied'>('ready');
  const [errorMessage, setErrorMessage] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState([
    'Enhanced Scanner Ready',
    'Mobile-optimized camera support',
    'Point camera at barcode/QR code'
  ]);
  
  const scannerRef = useRef<any>(null);
  const elementId = 'barcode-scanner-container';

  // Mock purchase data for demonstration
  const mockPurchases = [
    {
      id: 1,
      trackingNumber: '7721739262229',
      product: {
        name: 'Air Jordan 1 High OG "Chicago"',
        brand: 'Nike',
        size: 'Size US 10',
      },
      orderNumber: 'XX-7721739262229',
      status: 'Order Placed',
      market: 'StockX',
      price: '$2,200.00'
    },
    {
      id: 2,
      trackingNumber: '888637538408',
      product: {
        name: 'Travis Scott Cactus Jack x Spider Days Before Rode...',
        brand: 'Travis Scott',
        size: 'Size US XL',
      },
      orderNumber: '81-CE1Y398K3Z',
      status: 'Delivered',
      market: 'StockX',
      price: '$118.90'
    }
  ];

  // Initialize html5-qrcode library
  useEffect(() => {
    const loadScanner = async () => {
      try {
        if (typeof window !== 'undefined') {
          const html5QrcodeModule = await import('html5-qrcode');
          Html5QrcodeLib = html5QrcodeModule.Html5Qrcode;
          console.log('✅ html5-qrcode library loaded successfully');
        }
      } catch (error) {
        console.error('❌ Failed to load html5-qrcode:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown library loading error';
        setErrorMessage(`Failed to load camera library: ${errorMsg}`);
      }
    };

    loadScanner();
  }, []);

  // Enhanced feedback function with multiple methods
  const triggerHapticFeedback = () => {
    console.log('🔊 Triggering success feedback...');
    
    let feedbackWorked = false;
    
    // Method 1: Haptic feedback
    try {
      if ('vibrate' in navigator) {
        const result = navigator.vibrate([200, 100, 200]);
        if (result) {
          feedbackWorked = true;
          console.log('✅ Haptic feedback triggered');
        }
      }
    } catch (vibrateError) {
      console.log('Vibration failed:', vibrateError);
    }
    
    // Method 2: Success sound
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.frequency.setValueAtTime(1568, audioContext.currentTime);
      gain.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 1);
      osc.type = 'sine';
      osc.start();
      osc.stop(audioContext.currentTime + 1);
      
      feedbackWorked = true;
      console.log('✅ Success sound played');
    } catch (audioError) {
      console.log('Audio failed:', audioError);
    }
    
    // Method 3: Visual feedback
    try {
      const flashOverlay = document.createElement('div');
      flashOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(34, 197, 94, 0.3);
        z-index: 9999;
        pointer-events: none;
        animation: flashGreen 0.4s ease-out;
      `;
      
      const style = document.createElement('style');
      style.textContent = `
        @keyframes flashGreen {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(flashOverlay);
      
      setTimeout(() => {
        if (document.body.contains(flashOverlay)) {
          document.body.removeChild(flashOverlay);
        }
        if (document.head.contains(style)) {
          document.head.removeChild(style);
        }
      }, 400);
      
      feedbackWorked = true;
      console.log('✅ Visual feedback shown');
    } catch (visualError) {
      console.log('Visual feedback failed:', visualError);
    }
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

  return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopScanning();
    }
  }, [isOpen]);


  const requestCameraPermission = async () => {
    try {
      console.log("🎥 Requesting camera permission...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      console.log("✅ Camera permission granted");
      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error: any) {
      console.error("❌ Camera permission denied:", error);
      const errorName = error?.name || "";
      const errorMessage = error?.message || "";
      
      let userFriendlyMessage = "Camera access failed: ";
      
      if (errorName === "NotAllowedError" || errorMessage.includes("Permission denied")) {
        userFriendlyMessage += "Permission denied. Please allow camera access and try again.";
        setCameraStatus("permission-denied");
      } else if (errorName === "NotFoundError") {
        userFriendlyMessage += "No camera found on this device.";
      } else {
        userFriendlyMessage += `${errorMessage || "Unknown error occurred"}`;
      }
      
      setErrorMessage(userFriendlyMessage);
      setCameraStatus("error");
      return false;
    }
  };
  const startScanning = async () => {
    if (!Html5QrcodeLib) {
      setErrorMessage('Scanner library not loaded yet. Please try again.');
      return;
    }


    // First request camera permission explicitly
    console.log("🎥 Requesting camera permission before starting scanner...");
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      setIsScanning(false);
      return;
    }
    try {
      setIsScanning(true);
      setCameraStatus('active');
      setErrorMessage('');
      
      // Create scanner instance
      scannerRef.current = new Html5QrcodeLib(elementId);
      
      // Enhanced configuration for better mobile support
      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.777778, // 16:9
        disableFlip: false,
        videoConstraints: {
          facingMode: "environment", // Back camera
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const onScanSuccess = (decodedText: string, decodedResult: any) => {
        console.log('✅ Barcode scanned successfully:', decodedText);
        
        // Trigger feedback
        triggerHapticFeedback();
        
        // Stop scanning
        stopScanning();
        
        // Handle the scanned result
        handleScannedCode(decodedText);
      };

      const onScanFailure = (error: string) => {
        // Ignore frequent scanning errors to avoid spam
        if (error && typeof error === 'string' && !error.includes('NotFoundException')) {
          console.log('Scan attempt:', error);
        }
      };

      // Start scanning with enhanced error handling
      await scannerRef.current.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanFailure
      );

      setCameraStatus('active');
      console.log('✅ Camera started successfully');
      
    } catch (error: any) {
      console.error('❌ Camera start failed:', error);
      
      let userFriendlyMessage = 'Camera access failed: ';
      
      const errorName = error?.name || '';
      const errorMessage = error?.message || '';
      
      if (errorName === 'NotAllowedError' || errorMessage.includes('Permission denied')) {
        userFriendlyMessage += 'Permission denied. Please allow camera access and try again.';
        setCameraStatus('permission-denied');
      } else if (errorName === 'NotFoundError') {
        userFriendlyMessage += 'No camera found on this device.';
      } else if (errorName === 'NotSupportedError') {
        userFriendlyMessage += 'Camera not supported on this device.\n\n';
        userFriendlyMessage += '1. Make sure you\'re using Safari (iOS) or Chrome\n';
        userFriendlyMessage += '2. Update your browser to latest version\n';
        userFriendlyMessage += '3. Check if camera works in other apps\n';
        userFriendlyMessage += '4. Try using Manual mode instead';
      } else {
        userFriendlyMessage += `${errorMessage || 'Unknown error occurred'}`;
      }
      
      setErrorMessage(userFriendlyMessage);
      setCameraStatus('error');
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      if (scannerRef.current && typeof scannerRef.current.isScanning === 'boolean' && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
      scannerRef.current = null;
      setIsScanning(false);
      setCameraStatus('ready');
      console.log('✅ Camera stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping camera:', error);
      // Always reset state even if stopping fails
      scannerRef.current = null;
      setIsScanning(false);
      setCameraStatus('ready');
    }
  };

  const handleScannedCode = (scannedCode: string) => {
    console.log('🔍 Processing scanned code:', scannedCode);
    
    // Find matching purchase
    const foundPurchase = mockPurchases.find(p => 
      p.trackingNumber === scannedCode || 
      p.orderNumber === scannedCode
    );
    
    if (foundPurchase) {
      setSearchResults(foundPurchase);
      setDebugInfo([
        `✅ Match found!`,
        `Tracking: ${scannedCode}`,
        `Product: ${foundPurchase.product.name}`,
        `Status: ${foundPurchase.status}`
      ]);
    } else {
      setSearchResults(null);
      setDebugInfo([
        `📦 Scanned: ${scannedCode}`,
        `⚠️ No matching purchase found`,
        `This may be a new package`,
        `Try manual entry if needed`
      ]);
    }
    
    if (onScanComplete) {
      onScanComplete(scannedCode);
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      handleScannedCode(manualInput.trim());
      setManualInput('');
    }
  };

  const handleMarkAsReceived = () => {
    triggerHapticFeedback();
    setDebugInfo([
      '✅ Package marked as received!',
      'Status updated successfully',
      'Inventory has been updated'
    ]);
    
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleManualSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm overflow-y-auto overscroll-contain">
      <div className="min-h-full min-h-screen flex items-start justify-center p-2 sm:p-4 py-4 sm:py-8 md:py-12">
        <div className={`${currentTheme.colors.cardBackground} rounded-3xl max-w-lg w-full mx-auto shadow-2xl ${
          currentTheme.name === 'Neon' 
            ? 'border border-white/20 shadow-[0_0_50px_rgba(16,185,129,0.15)] backdrop-blur-xl bg-gray-900/90'
            : `${currentTheme.colors.border} border`
        } my-auto max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className={`relative p-8 pb-6 ${
          currentTheme.name === 'Neon' 
            ? 'border-b border-white/10' 
            : `border-b ${currentTheme.colors.border}`
        }`}>
          <div className="flex items-start space-x-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
              currentTheme.name === 'Neon' 
                ? 'bg-gradient-to-br from-emerald-500 to-cyan-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                : 'bg-gradient-to-br from-blue-600 to-blue-700'
            }`}>
              <div className="w-6 h-4 border-2 border-white rounded-sm relative">
                <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex-1 pt-1">
              <h2 className={`text-2xl font-semibold leading-tight ${currentTheme.colors.textPrimary}`}>
                Package Tracker
              </h2>
              <p className={`mt-1 leading-relaxed ${currentTheme.colors.textSecondary}`}>
                Enter tracking number to find and mark packages as received
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full transition-all ${
              currentTheme.name === 'Neon' 
                ? 'text-gray-400 hover:text-white hover:bg-white/10' 
                : `${currentTheme.colors.textSecondary} hover:text-gray-600 hover:bg-gray-100`
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Mode Selection */}
          <div className="px-8 py-6">
          <div className={`p-1.5 rounded-2xl flex space-x-1 ${
            currentTheme.name === 'Neon' 
              ? 'bg-white/5 backdrop-blur-sm border border-white/10' 
              : 'bg-gray-50'
          }`}>
            <button
              onClick={() => {
                console.log('Switching to manual mode');
                stopScanning();
                setActiveMode('manual');
                setSearchResults(null); // Clear any search results
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
                activeMode === 'manual' 
                  ? currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-white text-gray-900 shadow-sm'
                  : currentTheme.name === 'Neon'
                    ? 'text-gray-300 hover:text-white hover:bg-white/10'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              <span>Type Number</span>
            </button>
            <button
              onClick={() => {
                console.log('Switching to camera mode');
                stopScanning(); // Stop any existing scanning first
                setActiveMode('camera');
                setSearchResults(null); // Clear any search results
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
                activeMode === 'camera' 
                  ? currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                    : 'bg-white text-gray-900 shadow-sm'
                  : currentTheme.name === 'Neon'
                    ? 'text-gray-300 hover:text-white hover:bg-white/10'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Camera className="w-5 h-5" />
              <span>Camera (Beta)</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="px-8 pb-8">
          {searchResults ? (
            <div className="space-y-6">
              {/* Success Message */}
              <div className={`rounded-2xl p-4 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-emerald-500/10 border border-emerald-500/30 backdrop-blur-sm' 
                  : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                      : 'bg-green-600'
                  }`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-semibold ${
                      currentTheme.name === 'Neon' ? 'text-emerald-300' : 'text-green-900'
                    }`}>
                      Barcode Scanned Successfully!
                    </div>
                    <div className={`text-sm ${
                      currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-green-700'
                    }`}>
                      Tracking: {searchResults.trackingNumber}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scanned Tracking Number */}
              <div className={`rounded-2xl p-4 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/5 border border-white/20 backdrop-blur-sm' 
                  : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]' 
                      : 'bg-blue-600'
                  }`}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className={`font-medium ${currentTheme.colors.textPrimary}`}>
                      Scanned Tracking Number
                    </div>
                    <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                      {searchResults.trackingNumber}
                    </div>
                  </div>
                </div>
              </div>

              {searchResults.purchase ? (
                <>
                  {/* Found Purchase */}
                  <div className={`rounded-2xl p-4 ${
                    currentTheme.name === 'Neon' 
                      ? 'bg-white/5 border border-white/20 backdrop-blur-sm' 
                      : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        currentTheme.name === 'Neon' 
                          ? 'bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]' 
                          : 'bg-blue-600'
                      }`}>
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${currentTheme.colors.textPrimary}`}>
                          Found Purchase
                        </div>
                        <div className={`text-lg font-semibold mt-1 ${currentTheme.colors.textPrimary}`}>
                          {searchResults.purchase.product.name}
                        </div>
                        <div className={`text-sm mt-1 ${currentTheme.colors.textSecondary}`}>
                          Order: {searchResults.purchase.orderNumber}
                        </div>
                        <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                          Status: {searchResults.purchase.status}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mark as Received Button */}
                  <button
                    onClick={handleMarkAsReceived}
                    className={`w-full py-4 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/25'
                    }`}
                  >
                    Mark as Received
                  </button>
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-red-900">No Purchase Found</div>
                      <div className="text-sm text-red-700">No purchase matches this tracking number</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Back Button */}
              <button
                onClick={() => {
                  console.log('🔄 Search Another Package clicked - resetting modal');
                  
                  // Clear all states
                  setSearchResults(null);
                  setManualInput('');
                  setIsScanning(false);
                  
                  // Stop scanning if running
                  stopScanning();
                  
                  // Force re-render by triggering state change
                  setDebugInfo(['🔄 Modal reset', 'Ready for new scan', 'Click to search again']);
                  
                  // Alert to confirm it's working
                  alert('✅ Modal reset! Ready for new search.');
                }}
                className={`w-full py-3 rounded-2xl transition-all duration-200 font-medium ${
                  currentTheme.name === 'Neon'
                    ? 'border border-white/20 text-gray-300 hover:bg-white/10 hover:border-cyan-500/50'
                    : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                🔄 Search Another Package
              </button>
            </div>
          ) : activeMode === 'camera' ? (
            <div className="space-y-6">
              {/* Scanner Status */}
              <div className={`border-2 rounded-2xl p-4 ${
                cameraStatus === 'active' ? 'bg-green-50 border-green-200' :
                cameraStatus === 'error' ? 'bg-red-50 border-red-200' :
                cameraStatus === 'permission-denied' ? 'bg-yellow-50 border-yellow-200' :
                'bg-blue-50 border-blue-200'
              }`}>
                <div className="flex items-center space-x-3">
                  {cameraStatus === 'active' && <CheckCircle className="w-5 h-5 text-green-600" />}
                  {cameraStatus === 'error' && <AlertTriangle className="w-5 h-5 text-red-600" />}
                  {cameraStatus === 'permission-denied' && <AlertTriangle className="w-5 h-5 text-yellow-600" />}
                  {cameraStatus === 'ready' && <Camera className="w-5 h-5 text-blue-600" />}
                  <div>
                    <div className={`font-medium ${
                      cameraStatus === 'active' ? 'text-green-900' :
                      cameraStatus === 'error' ? 'text-red-900' :
                      cameraStatus === 'permission-denied' ? 'text-yellow-900' :
                      'text-blue-900'
                    }`}>
                      Enhanced Camera Mode
                    </div>
                    <div className={`text-sm ${
                      cameraStatus === 'active' ? 'text-green-700' :
                      cameraStatus === 'error' ? 'text-red-700' :
                      cameraStatus === 'permission-denied' ? 'text-yellow-700' :
                      'text-blue-700'
                    }`}>
                      Status: {cameraStatus === 'active' ? 'Scanning active - point at barcode' :
                              cameraStatus === 'error' ? 'Camera error - try again' :
                              cameraStatus === 'permission-denied' ? 'Permission needed' :
                              'Ready to scan'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-red-900">Camera Access Failed</div>
                      <div className="text-sm text-red-700 mt-1 whitespace-pre-line">{errorMessage}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Debug Info */}
              <div className="bg-gray-900 rounded-2xl p-5 text-green-400 text-sm font-mono border border-gray-800">
                <div className="text-gray-300 mb-3 font-medium">Scanner Info:</div>
                {debugInfo.map((info, index) => (
                  <div key={index} className="leading-relaxed">{info}</div>
                ))}
              </div>

              {/* Camera Scanner Container */}
              <div className="bg-gray-900 rounded-2xl overflow-hidden relative border border-gray-200">
                {!isScanning ? (
                  <div className="h-64 flex items-center justify-center text-center text-gray-400">
                    <div>
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Camera className="w-8 h-8" />
                      </div>
                      <div className="font-medium">Camera Mode Ready</div>
                      <div className="text-xs text-gray-500 mt-1">Click "Start Scanning" to begin</div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {/* html5-qrcode scanner container */}
                    <div 
                      id={elementId} 
                      className="w-full"
                      style={{ minHeight: '300px' }}
                    />
                    
                    {/* Success overlay for visual feedback */}
                    <div className="absolute top-4 left-4 right-4">
                      <div className="bg-black/50 text-white px-3 py-2 rounded-lg text-sm">
                        📱 Point camera at barcode or QR code
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    console.log('Camera button clicked, isScanning:', isScanning);
                    if (isScanning) {
                      stopScanning();
                    } else {
                      startScanning();
                    }
                  }}
                  disabled={!Html5QrcodeLib}
                  className={`w-full py-4 rounded-2xl font-semibold text-white transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isScanning 
                      ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-500/25' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/25'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-3">
                    <Camera className="w-5 h-5" />
                    <span>
                      {!Html5QrcodeLib ? 'Loading Scanner...' :
                       isScanning ? 'Stop Scanning' : 'Start Scanning'}
                    </span>
                  </div>
                </button>
                
                {/* Help & Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <div className="text-gray-900 font-medium mb-2">📱 Mobile Tips:</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <div>• Use Safari on iPhone or Chrome on Android</div>
                    <div>• Allow camera permission when prompted</div>
                    <div>• Hold device steady and point at barcode</div>
                    <div>• Try Manual mode if camera issues persist</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Instructions */}
              <div className={`rounded-2xl p-4 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/5 border border-cyan-500/30 backdrop-blur-sm' 
                  : 'bg-blue-50 border border-blue-200'
              }`}>
                <div className="flex items-start space-x-3">
                  <Smartphone className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
                  }`} />
                  <div>
                    <div className={`font-medium ${
                      currentTheme.name === 'Neon' ? 'text-cyan-300' : 'text-blue-900'
                    }`}>
                      How to find tracking numbers:
                    </div>
                    <div className={`text-sm mt-1 space-y-1 ${
                      currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-blue-700'
                    }`}>
                      <div>• Check shipping confirmation emails</div>
                      <div>• Look for tracking labels on packages</div>
                      <div>• Usually 10-22 digits or letters</div>
                      <div>• Examples: 1Z12345E0205271688, 9400111899564229610393</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input Section */}
              <div>
                <label className={`block text-lg font-semibold mb-3 ${currentTheme.colors.textPrimary}`}>
                  📦 Enter Tracking Number
                </label>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value.toUpperCase().trim())}
                    onKeyPress={handleKeyPress}
                    placeholder="Type or paste tracking number..."
                    className={`w-full px-4 py-4 border-2 rounded-2xl focus:ring-2 transition-all text-lg font-mono ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/5 border-white/20 focus:border-emerald-500 focus:ring-emerald-500/20 text-white placeholder-gray-400 backdrop-blur-sm'
                        : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500'
                    }`}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck="false"
                  />
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualInput.trim()}
                    className={`w-full py-4 font-semibold rounded-2xl transition-all duration-200 shadow-lg ${
                      currentTheme.name === 'Neon'
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white'
                    }`}
                  >
                    🔍 Search Package
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className={`rounded-2xl p-4 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/5 border border-white/10 backdrop-blur-sm' 
                  : 'bg-gray-50 border border-gray-200'
              }`}>
                <div className={`font-medium mb-3 ${currentTheme.colors.textPrimary}`}>
                  📱 Quick Actions:
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => setManualInput('7721739262229')}
                    className={`w-full py-3 px-4 rounded-xl transition-all duration-200 font-medium text-left ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/5 border border-white/20 text-gray-300 hover:bg-white/10 hover:border-cyan-500/50'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-blue-300'
                    }`}
                  >
                    📋 Use Sample Number (for testing)
                  </button>
                  
                  <button
                    onClick={() => {
                      // Try to access clipboard if available
                      if (navigator.clipboard && navigator.clipboard.readText) {
                        navigator.clipboard.readText()
                          .then(text => {
                            const cleaned = text.trim().toUpperCase();
                            if (cleaned.length >= 8) {
                              setManualInput(cleaned);
                            } else {
                              alert('📋 Clipboard text seems too short for a tracking number');
                            }
                          })
                          .catch(() => {
                            alert('📋 Unable to access clipboard. Please paste manually.');
                          });
                      } else {
                        alert('📋 Clipboard access not supported. Please paste manually.');
                      }
                    }}
                    className={`w-full py-3 px-4 rounded-xl transition-all duration-200 font-medium text-left ${
                      currentTheme.name === 'Neon'
                        ? 'bg-white/5 border border-white/20 text-gray-300 hover:bg-white/10 hover:border-emerald-500/50'
                        : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-green-300'
                    }`}
                  >
                    📋 Paste from Clipboard
                  </button>
                </div>
              </div>

              {/* Tips */}
              <div className={`rounded-2xl p-4 ${
                currentTheme.name === 'Neon' 
                  ? 'bg-white/5 border border-emerald-500/30 backdrop-blur-sm' 
                  : 'bg-green-50 border border-green-200'
              }`}>
                <div className={`font-medium mb-2 ${
                  currentTheme.name === 'Neon' ? 'text-emerald-300' : 'text-green-900'
                }`}>
                  💡 Pro Tips:
                </div>
                <div className={`text-sm space-y-1 ${
                  currentTheme.name === 'Neon' ? 'text-gray-300' : 'text-green-700'
                }`}>
                  <div>• Manual entry is often faster than camera scanning</div>
                  <div>• Copy/paste from shipping emails works great</div>
                  <div>• Numbers are automatically capitalized</div>
                  <div>• Press Enter after typing to search instantly</div>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default ScanPackageModal; 