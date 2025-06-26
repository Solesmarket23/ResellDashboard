'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Camera, Smartphone } from 'lucide-react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface ScanPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (trackingNumber: string) => void;
}

const ScanPackageModal = ({ isOpen, onClose, onScanComplete }: ScanPackageModalProps) => {
  const [activeMode, setActiveMode] = useState<'camera' | 'manual'>('camera');
  const [manualInput, setManualInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState([
    'Scanner initialized...',
    'Ready to scan barcodes',
    'Point camera at tracking label'
  ]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

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

  // Initialize barcode reader
  useEffect(() => {
    if (typeof window !== 'undefined') {
      codeReaderRef.current = new BrowserMultiFormatReader();
    }
    
    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset();
      }
    };
  }, []);

    // Enhanced feedback function with multiple methods
  const triggerHapticFeedback = () => {
    console.log('🔊 Triggering success feedback...');
    
    let feedbackWorked = false;
    
    // Method 1: Try multiple vibration approaches
    try {
      console.log('Device info:', {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hasVibrate: 'vibrate' in navigator
      });
      
      if ('vibrate' in navigator) {
        // Try different vibration patterns
        const patterns = [
          [500],           // Simple long vibration
          [200, 100, 200], // Double tap
          [100, 50, 100, 50, 300] // Complex pattern
        ];
        
        for (const pattern of patterns) {
          const result = navigator.vibrate(pattern);
          console.log(`Vibration pattern ${JSON.stringify(pattern)}: ${result}`);
          if (result) {
            feedbackWorked = true;
            break;
          }
        }
      }
    } catch (vibrateError) {
      console.log('Vibration failed:', vibrateError);
    }
    
         // Method 2: Crystal Ting - Clear crystal sound (#8 from Audio Preview)
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
       console.log('✅ Crystal Ting success sound played');
     } catch (audioError) {
       console.log('Audio failed:', audioError);
     }
    
    // Method 3: Visual feedback animation
    try {
      // Flash the screen green briefly
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
      
      // Add CSS animation
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
        document.body.removeChild(flashOverlay);
        document.head.removeChild(style);
      }, 400);
      
      feedbackWorked = true;
      console.log('✅ Visual flash feedback shown');
    } catch (visualError) {
      console.log('Visual feedback failed:', visualError);
    }
    
    // Show appropriate feedback message
    if (feedbackWorked) {
      // Don't show alert immediately, let user experience the feedback first
      setTimeout(() => {
        console.log('✅ Success feedback completed!');
      }, 500);
    } else {
      alert('⚠️ Your device may not support haptic feedback, but scan was successful!');
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

  // Cleanup camera stream when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
  }, [isOpen]);

  const startCamera = async () => {
    try {
      console.log('Starting camera...');
      setIsScanning(true);
      setDebugInfo(['Starting camera...', 'Requesting permission...']);
      
      // Enhanced iOS compatibility checks
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);
      
      console.log('Device info:', {
        isIOS,
        isSafari,
        userAgent: navigator.userAgent,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia
      });
      
             // Enhanced camera API detection
       const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
       const hasLegacyGetUserMedia = !!((navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia);
       
       console.log('Camera API support:', {
         hasMediaDevices,
         hasLegacyGetUserMedia,
         isSecureContext: window.isSecureContext,
         protocol: window.location.protocol
       });
       
       if (!hasMediaDevices && !hasLegacyGetUserMedia) {
         throw new Error('Camera API not supported - please use a modern browser like Chrome or Safari');
       }
       
       // Check for secure context (HTTPS required for camera)
       if (!window.isSecureContext && window.location.protocol !== 'https:') {
         console.warn('Camera access requires HTTPS in most browsers');
       }
      
      // iOS-optimized camera constraints
      let constraints;
      if (isIOS) {
        // Simplified constraints for iOS
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 }
          }
        };
      } else {
        // Standard constraints for other devices
        constraints = {
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };
      }
      
             console.log('Requesting camera with constraints:', constraints);
       setDebugInfo(['Requesting camera access...', 'Please allow permission', 'Check browser popup']);
       
       // Request camera access with timeout for iOS
       const timeoutPromise = new Promise((_, reject) => {
         setTimeout(() => reject(new Error('Camera request timeout - please check permissions')), 10000);
       });
       
       let stream: MediaStream;
       
       try {
         // Try modern API first
         stream = await Promise.race([
           navigator.mediaDevices.getUserMedia(constraints),
           timeoutPromise
         ]) as MediaStream;
       } catch (modernError) {
         console.log('Modern getUserMedia failed, trying legacy methods...', modernError);
         
         // Fallback to legacy getUserMedia
         if (hasLegacyGetUserMedia) {
           const legacyGetUserMedia = (navigator as any).getUserMedia || 
                                    (navigator as any).webkitGetUserMedia || 
                                    (navigator as any).mozGetUserMedia;
           
           stream = await new Promise<MediaStream>((resolve, reject) => {
             legacyGetUserMedia.call(navigator, constraints, resolve, reject);
           });
         } else {
           throw modernError;
         }
       }
      
      console.log('Camera stream obtained:', stream);
      setDebugInfo(['Camera access granted!', 'Connecting stream...']);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Wait for video to be ready (important for iOS)
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('Video metadata loaded');
              resolve(true);
            };
            // Fallback timeout
            setTimeout(resolve, 2000);
          } else {
            resolve(true);
          }
        });
        
        setDebugInfo(['Camera active!', 'Stream connected', 'Initializing scanner...']);
        
        // iOS-specific video play requirements
        if (isIOS && videoRef.current) {
          try {
            await videoRef.current.play();
            console.log('Video play started successfully');
          } catch (playError) {
            console.log('Video play error (might be normal):', playError);
          }
        }
        
        // Initialize ZXing scanner with delay for iOS
        if (codeReaderRef.current) {
          console.log('Starting ZXing scanner...');
          
          // Small delay to ensure video is fully ready
          setTimeout(() => {
            if (codeReaderRef.current && videoRef.current) {
              try {
                codeReaderRef.current.decodeFromVideoDevice(null, videoRef.current, (result, error) => {
                  if (result) {
                    const scannedText = result.getText();
                    console.log('Barcode scanned:', scannedText);
                    setDebugInfo(prev => [...prev, `✅ Scanned: ${scannedText}`]);
                    
                    // Trigger haptic feedback
                    triggerHapticFeedback();
                    
                    // Process the scanned barcode
                    handleScannedCode(scannedText);
                    
                    // Stop scanning after successful scan
                    stopCamera();
                  }
                  
                  if (error && !(error instanceof NotFoundException)) {
                    console.log('Scanner error:', error.message);
                    setDebugInfo(prev => [...prev.slice(-2), `Scanner: ${error.message}`]);
                  }
                });
                
                setDebugInfo(['🎯 Scanner ready!', 'Point at barcode/QR code', 'Hold steady for scan']);
              } catch (scannerError) {
                console.error('Scanner initialization error:', scannerError);
                setDebugInfo(['Scanner setup failed', 'Camera works, scanner issue', 'Try refreshing page']);
              }
            }
          }, isIOS ? 1000 : 500); // Longer delay for iOS
        }
      }
      
    } catch (error) {
      console.error('Camera error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // More specific error messages for iOS
      let userMessage = errorMessage;
      let instructions = [
        '1. Allow camera permission when prompted',
        '2. Check Safari camera settings',
        '3. Refresh the page and try again'
      ];
      
      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        userMessage = 'Camera permission denied';
        instructions = [
          '1. Go to iPhone Settings > Safari > Camera',
          '2. Select "Allow" for camera access',
          '3. Refresh this page and try again'
        ];
      } else if (errorMessage.includes('timeout')) {
        userMessage = 'Camera permission timeout';
        instructions = [
          '1. Look for permission popup in browser',
          '2. Tap "Allow" when prompted',
          '3. If no popup, check Settings > Safari > Camera'
        ];
             } else if (errorMessage.includes('not supported')) {
         userMessage = 'Camera not supported on this device';
         instructions = [
           '1. Make sure you\'re using Safari (iOS) or Chrome',
           '2. Update your browser to latest version',
           '3. Check if camera works in other apps',
           '4. Try using Manual mode instead'
         ];
       } else if (errorMessage.includes('NotFoundError') || errorMessage.includes('DevicesNotFoundError')) {
         userMessage = 'No camera found on this device';
         instructions = [
           '1. Make sure your device has a camera',
           '2. Check if camera is being used by another app',
           '3. Try closing other camera apps',
           '4. Use Manual mode to enter tracking numbers'
         ];
       }
      
      setDebugInfo([
        '❌ Camera failed',
        `Error: ${userMessage}`,
        'Check permissions & try again'
      ]);
      setIsScanning(false);
      
      // Show user-friendly alert with specific instructions
      alert(`Camera access failed: ${userMessage}\n\n${instructions.join('\n')}`);
    }
  };

  const stopCamera = () => {
    console.log('Stopping camera...');
    
    // Stop video stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      streamRef.current = null;
    }
    
    // Reset video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    // Reset ZXing scanner
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
    }
    
    setIsScanning(false);
    setDebugInfo(['📱 Scanner stopped', 'Ready to scan again', 'Click Start to begin']);
  };

  const handleScannedCode = (scannedCode: string) => {
    // Search for matching purchase
    const foundPurchase = mockPurchases.find(purchase => 
      purchase.trackingNumber === scannedCode.trim()
    );
    
    if (foundPurchase) {
      setSearchResults({
        success: true,
        trackingNumber: scannedCode.trim(),
        purchase: foundPurchase
      });
    } else {
      setSearchResults({
        success: false,
        trackingNumber: scannedCode.trim(),
        purchase: null
      });
    }
  };

  const handleManualSubmit = () => {
    console.log('Manual submit clicked, input:', manualInput);
    
    if (manualInput.trim()) {
      // Search for matching purchase
      const foundPurchase = mockPurchases.find(purchase => 
        purchase.trackingNumber === manualInput.trim()
      );
      
      console.log('Found purchase:', foundPurchase);
      
      if (foundPurchase) {
        // Trigger haptic feedback for manual success too
        triggerHapticFeedback();
        setSearchResults({
          success: true,
          trackingNumber: manualInput.trim(),
          purchase: foundPurchase
        });
      } else {
        setSearchResults({
          success: false,
          trackingNumber: manualInput.trim(),
          purchase: null
        });
      }
    } else {
      console.log('No input provided');
      alert('Please enter a tracking number');
    }
  };

  const handleMarkAsReceived = () => {
    if (searchResults?.purchase) {
      onScanComplete?.(searchResults.trackingNumber);
      setSearchResults(null);
      setManualInput('');
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && activeMode === 'manual') {
      handleManualSubmit();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl max-w-lg w-full mx-auto shadow-2xl border border-gray-100">
        {/* Header */}
        <div className="relative p-8 pb-6 border-b border-gray-100">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg">
              <div className="w-6 h-4 border-2 border-white rounded-sm relative">
                <div className="absolute top-1 left-1 w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
            </div>
            <div className="flex-1 pt-1">
              <h2 className="text-2xl font-semibold text-gray-900 leading-tight">Package Scanner</h2>
              <p className="text-gray-600 mt-1 leading-relaxed">Scan or enter tracking number to mark package as received</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selection */}
        <div className="px-8 py-6">
          <div className="bg-gray-50 p-1.5 rounded-2xl flex space-x-1">
            <button
              onClick={() => {
                console.log('Switching to camera mode');
                stopCamera(); // Stop any existing camera first
                setActiveMode('camera');
                setSearchResults(null); // Clear any search results
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
                activeMode === 'camera' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Camera className="w-5 h-5" />
              <span>Camera</span>
            </button>
            <button
              onClick={() => {
                console.log('Switching to manual mode');
                stopCamera();
                setActiveMode('manual');
                setSearchResults(null); // Clear any search results
              }}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
                activeMode === 'manual' 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              <span>Manual</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="px-8 pb-8">
          {searchResults ? (
            <div className="space-y-6">
              {/* Success Message */}
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-semibold text-green-900">Barcode Scanned Successfully!</div>
                    <div className="text-sm text-green-700">Tracking: {searchResults.trackingNumber}</div>
                  </div>
                </div>
              </div>

              {/* Scanned Tracking Number */}
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">Scanned Tracking Number</div>
                    <div className="text-sm text-gray-600">{searchResults.trackingNumber}</div>
                  </div>
                </div>
              </div>

              {searchResults.purchase ? (
                <>
                  {/* Found Purchase */}
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Found Purchase</div>
                        <div className="text-lg font-semibold text-gray-900 mt-1">{searchResults.purchase.product.name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Order: {searchResults.purchase.orderNumber}
                        </div>
                        <div className="text-sm text-gray-600">
                          Status: {searchResults.purchase.status}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Mark as Received Button */}
                  <button
                    onClick={handleMarkAsReceived}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-blue-500/25"
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
                  
                  // Stop camera if running
                  stopCamera();
                  
                  // Force re-render by triggering state change
                  setDebugInfo(['🔄 Modal reset', 'Ready for new scan', 'Click to search again']);
                  
                  // Alert to confirm it's working
                  alert('✅ Modal reset! Ready for new search.');
                }}
                className="w-full py-3 border border-gray-300 rounded-2xl text-gray-700 hover:bg-gray-50 transition-all duration-200 font-medium"
              >
                🔄 Search Another Package
              </button>
            </div>
          ) : activeMode === 'camera' ? (
            <div className="space-y-6">
              {/* Debug Status */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
                <div className="text-blue-900 font-medium">Camera Mode Active</div>
                <div className="text-blue-700 text-sm mt-1">Status: {isScanning ? 'Scanning...' : 'Ready to scan'}</div>
              </div>

              {/* Debug Info */}
              <div className="bg-gray-900 rounded-2xl p-5 text-green-400 text-sm font-mono border border-gray-800">
                <div className="text-gray-300 mb-3 font-medium">Debug Info:</div>
                {debugInfo.map((info, index) => (
                  <div key={index} className="leading-relaxed">{info}</div>
                ))}
              </div>

              {/* Camera View */}
              <div className="bg-gray-900 rounded-2xl overflow-hidden h-64 flex items-center justify-center relative border border-gray-200">
                {isScanning ? (
                  <video 
                    ref={videoRef}
                    autoPlay 
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-gray-400">
                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div className="font-medium">Camera not active</div>
                    <div className="text-xs text-gray-500 mt-1">Click "Start Scanning" to begin</div>
                  </div>
                )}
                
                {/* Scanning overlay */}
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-56 h-36 border-2 border-white border-dashed rounded-xl animate-pulse shadow-lg"></div>
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    console.log('Camera button clicked, isScanning:', isScanning);
                    if (isScanning) {
                      stopCamera();
                    } else {
                      startCamera();
                    }
                  }}
                  className={`w-full py-4 rounded-2xl font-semibold text-white transition-all duration-200 shadow-lg ${
                    isScanning 
                      ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-red-500/25' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-500/25'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-3">
                    <Camera className="w-5 h-5" />
                    <span>{isScanning ? 'Stop Scanning' : 'Start Scanning'}</span>
                  </div>
                </button>
                
                {/* Simple Camera Test */}
                <button
                  onClick={async () => {
                    console.log('Testing basic camera access...');
                    try {
                      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                      console.log('✅ Camera access successful!', stream);
                      setDebugInfo(['✅ Camera test passed!', 'Basic access working', 'Try scanning now']);
                      
                      if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        streamRef.current = stream;
                      }
                      
                      alert('✅ Camera test successful! Camera should now be visible.');
                    } catch (error) {
                      console.error('❌ Camera test failed:', error);
                      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                      setDebugInfo(['❌ Camera test failed', `Error: ${errorMessage}`, 'Check permissions']);
                      alert(`❌ Camera test failed: ${errorMessage}`);
                    }
                  }}
                  className="w-full py-3 rounded-2xl font-medium border-2 border-blue-600 text-blue-600 hover:bg-blue-50 transition-all duration-200"
                >
                  🧪 Test Camera Access
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <label className="block text-lg font-semibold text-gray-900 mb-4">
                  Tracking Number
                </label>
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter tracking number..."
                    className="flex-1 px-4 py-4 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-gray-900 placeholder-gray-500 text-lg"
                    autoFocus
                  />
                  <button
                    onClick={handleManualSubmit}
                    className="px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-2xl transition-all duration-200 shadow-lg shadow-blue-500/25"
                  >
                    Search
                  </button>
                </div>
              </div>
              
              <div className="space-y-3">
                <button
                  onClick={() => setManualInput('7721739262229')}
                  className="w-full py-4 px-4 border border-gray-300 rounded-2xl text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium text-center"
                >
                  Test with Sample Barcode (7721739262229)
                </button>
                
                <button
                  onClick={() => {
                    console.log('Direct test button clicked');
                    setManualInput('7721739262229');
                    setTimeout(() => handleManualSubmit(), 100);
                  }}
                  className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-medium text-center transition-all duration-200"
                >
                  🎯 Quick Test (Auto Search)
                </button>
                
                <button
                  onClick={() => {
                    console.log('Simulating barcode scan...');
                    // Simulate a successful barcode scan
                    triggerHapticFeedback();
                    handleScannedCode('7721739262229');
                  }}
                  className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-medium text-center transition-all duration-200"
                >
                  📷 Simulate Scan (with Haptic)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScanPackageModal; 