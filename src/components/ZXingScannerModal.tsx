'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Camera } from 'lucide-react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';

interface ZXingScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (trackingNumber: string) => void;
}

const ZXingScannerModal = ({ isOpen, onClose, onScanComplete }: ZXingScannerModalProps) => {
  const [permissionState, setPermissionState] = useState<'unknown' | 'requesting' | 'granted' | 'denied'>('unknown');
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [scanAttempts, setScanAttempts] = useState(0);
  const [scanStatus, setScanStatus] = useState<'scanning' | 'detected' | 'rejected'>('scanning');
  const [detectionProgress, setDetectionProgress] = useState<{ code: string; count: number } | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const zxingReader = useRef<BrowserMultiFormatReader | null>(null);
  const detectionHashRef = useRef<{ [key: string]: number }>({});
  const scanningRef = useRef(false);
  
  const REQUIRED_DETECTIONS = 3;

  useEffect(() => {
    if (isOpen) {
      // Initialize ZXing reader
      zxingReader.current = new BrowserMultiFormatReader();
      console.log('🔍 ZXing-js reader initialized');
    }

    return () => {
      console.log('🧹 ZXing modal cleanup...');
      if (zxingReader.current) {
        try {
          zxingReader.current.reset();
          zxingReader.current = null;
        } catch (error) {
          console.error('Error during ZXing cleanup:', error);
        }
      }
      stopScanning();
    };
  }, [isOpen]);

  const requestCameraPermission = async () => {
    setPermissionState('requesting');
    setError('');
    
    try {
      console.log('🎥 Requesting camera permission for ZXing scanner...');
      
      // Check if camera API is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser');
      }

      // Get camera stream manually first
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      console.log('✅ Camera permission granted, got stream:', stream);
      cameraStream.current = stream;

      // Set the video stream to the video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        console.log('📺 Video stream attached to video element');
        
        // Add video error event listeners
        videoRef.current.addEventListener('error', handleVideoError);
        videoRef.current.addEventListener('ended', handleVideoEnded);
        videoRef.current.addEventListener('pause', handleVideoPaused);
        videoRef.current.addEventListener('abort', handleVideoAborted);
      }

      // Add stream track ended listeners
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', handleStreamTrackEnded);
      });

      setPermissionState('granted');
      
      // Start ZXing scanning with the stream
      startZXingScanning();
      
    } catch (error: any) {
      console.error('❌ Camera permission error:', error);
      setPermissionState('denied');
      setError(error.message || 'Camera access denied');
    }
  };

  // Video error event handlers
  const handleVideoError = (event: Event) => {
    console.error('📺 Video error:', event);
    setError('Video stream error. Please try again.');
    handleStreamInterruption();
  };

  const handleVideoEnded = () => {
    console.log('📺 Video stream ended');
    setError('Video stream ended. Please restart the scanner.');
    handleStreamInterruption();
  };

  const handleVideoPaused = () => {
    console.log('📺 Video stream paused');
    // Don't treat pause as an error, just log it
  };

  const handleVideoAborted = () => {
    console.log('📺 Video stream aborted');
    setError('Video stream was interrupted. Please try again.');
    handleStreamInterruption();
  };

  const handleStreamTrackEnded = () => {
    console.log('📹 Camera track ended');
    setError('Camera access was interrupted. Please restart the scanner.');
    handleStreamInterruption();
  };

  const handleStreamInterruption = () => {
    console.log('🚫 Stream interrupted - stopping scanner');
    scanningRef.current = false;
    setIsScanning(false);
    setPermissionState('denied');
  };

  const startZXingScanning = async () => {
    console.log('🔍 ZXing scanner start check:', {
      hasReader: !!zxingReader.current,
      hasVideoRef: !!videoRef.current,
      videoElement: videoRef.current,
      videoSrcObject: videoRef.current?.srcObject
    });
    
    if (!zxingReader.current || !videoRef.current) {
      console.error('❌ ZXing reader or video element not available', {
        reader: !!zxingReader.current,
        video: !!videoRef.current
      });
      setError('Video element not ready. Please try again.');
      setPermissionState('denied');
      return;
    }

    try {
      setIsScanning(true);
      scanningRef.current = true;
      console.log('🎯 Starting ZXing-js continuous scanning...');
      
      // Wait for video to be ready
      if (videoRef.current.readyState < 2) {
        console.log('📺 Waiting for video to be ready...');
        await new Promise((resolve, reject) => {
          const onCanPlay = () => {
            videoRef.current?.removeEventListener('canplay', onCanPlay);
            videoRef.current?.removeEventListener('error', onError);
            resolve(null);
          };
          const onError = (error: Event) => {
            videoRef.current?.removeEventListener('canplay', onCanPlay);
            videoRef.current?.removeEventListener('error', onError);
            reject(new Error('Video failed to load'));
          };
          videoRef.current?.addEventListener('canplay', onCanPlay);
          videoRef.current?.addEventListener('error', onError);
        });
      }

      // Start continuous scanning from the video element
      const scanLoop = async () => {
        if (!scanningRef.current || !zxingReader.current || !videoRef.current) {
          return;
        }

        // Check if video stream is still active
        if (videoRef.current.readyState < 2) {
          console.log('📺 Video not ready, skipping frame');
          if (scanningRef.current) {
            setTimeout(scanLoop, 200);
          }
          return;
        }

        // Check if video has ended
        if (videoRef.current.ended) {
          console.log('📺 Video ended, stopping scanner');
          handleStreamInterruption();
          return;
        }

        try {
          const result = zxingReader.current.decodeFromVideo(videoRef.current);
          
          if (result) {
            const code = result.getText();
            const format = result.getBarcodeFormat();
            
            console.log('🔍 ZXing detection:', {
              code,
              format: format.toString(),
              length: code.length
            });

            setScanStatus('detected');
            setTimeout(() => setScanStatus('scanning'), 800);

            // Validate and process barcode
            if (isValidBarcode(code)) {
              handleBarcodeDetected(code);
              return; // Stop scanning after successful detection
            } else {
              console.log('❌ Invalid barcode format:', code);
            }
          }
        } catch (error) {
          // Handle specific ZXing errors
          if (error instanceof NotFoundException) {
            // This is expected when no barcode is found - don't log as error
          } else if (error instanceof Error) {
            if (error.message.includes('Video stream has ended')) {
              console.log('📺 Video stream ended during scanning');
              handleStreamInterruption();
              return;
            } else if (error.message.includes('HTMLVideoElement')) {
              console.log('📺 Video element error during scanning');
              // Try to continue scanning - this might be temporary
            } else {
              console.error('ZXing scanning error:', error);
              // For other errors, continue scanning but log them
            }
          }
        }

        // Continue scanning with error protection
        if (scanningRef.current) {
          setTimeout(scanLoop, 100); // Scan every 100ms
        }
      };

      // Start the scanning loop
      scanLoop();

      console.log('✅ ZXing scanner started successfully');

    } catch (error) {
      console.error('❌ ZXing scanning failed:', error);
      setError('Scanner initialization failed. ' + (error as Error).message);
      setIsScanning(false);
      setPermissionState('denied');
    }
  };

  const isValidBarcode = (code: string): boolean => {
    const cleanCode = code.trim();
    console.log('🔍 Validating barcode:', cleanCode, 'Length:', cleanCode.length);
    
    // Require minimum 12 characters for UPC/EAN
    if (cleanCode.length < 12) {
      console.log('❌ Barcode too short (need 12+ for UPC/EAN):', cleanCode.length);
      return false;
    }
    
    // Check for valid characters (alphanumeric only)
    const validChars = /^[A-Za-z0-9]+$/;
    if (!validChars.test(cleanCode)) {
      console.log('❌ Invalid characters in barcode:', cleanCode);
      return false;
    }
    
    // UPC/EAN codes (12-13 digits)
    const isAllNumeric = /^[0-9]+$/.test(cleanCode);
    if (isAllNumeric && (cleanCode.length === 12 || cleanCode.length === 13)) {
      console.log('✅ Valid UPC/EAN code:', cleanCode);
      return true;
    }
    
    return false;
  };

  const handleBarcodeDetected = (barcode: string) => {
    console.log('📱 ZXing barcode detected:', barcode);
    
    // Initialize detection count
    if (!detectionHashRef.current[barcode]) {
      detectionHashRef.current[barcode] = 0;
    }
    
    // Increment detection count
    detectionHashRef.current[barcode]++;
    
    console.log(`🔢 ZXing detection count for ${barcode}: ${detectionHashRef.current[barcode]}/${REQUIRED_DETECTIONS}`);
    
    // Update progress display
    setDetectionProgress({ code: barcode, count: detectionHashRef.current[barcode] });
    
    // Check if we have enough consistent detections
    if (detectionHashRef.current[barcode] >= REQUIRED_DETECTIONS) {
      console.log('✅ ZXing barcode confirmed:', barcode);
      
      // Reset detection hash and progress
      detectionHashRef.current = {};
      setDetectionProgress(null);
      
      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      
      setScannedResult(barcode);
      stopScanning();
      setScanAttempts(prev => prev + 1);
    }
  };

  const stopScanning = () => {
    console.log('🛑 Stopping ZXing scanner...');
    scanningRef.current = false;
    setIsScanning(false);
    
    try {
      if (zxingReader.current) {
        zxingReader.current.reset();
        console.log('✅ ZXing reader reset successfully');
      }
    } catch (error) {
      console.error('Error resetting ZXing reader:', error);
    }
    
    // Remove video event listeners
    if (videoRef.current) {
      videoRef.current.removeEventListener('error', handleVideoError);
      videoRef.current.removeEventListener('ended', handleVideoEnded);
      videoRef.current.removeEventListener('pause', handleVideoPaused);
      videoRef.current.removeEventListener('abort', handleVideoAborted);
      videoRef.current.srcObject = null;
      console.log('📺 Video event listeners removed');
    }
    
    // Stop camera stream and remove track listeners
    if (cameraStream.current) {
      cameraStream.current.getTracks().forEach(track => {
        track.removeEventListener('ended', handleStreamTrackEnded);
        track.stop();
      });
      cameraStream.current = null;
      console.log('📹 Camera stream stopped and listeners removed');
    }
  };

  const handleClose = () => {
    stopScanning();
    onClose();
  };

  const handleSubmit = () => {
    if (scannedResult && onScanComplete) {
      onScanComplete(scannedResult);
    }
    handleClose();
  };

  const handleManualSubmit = () => {
    if (manualInput.trim() && onScanComplete) {
      onScanComplete(manualInput.trim());
    }
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-white text-xl font-bold">ZXing Scanner Test</h2>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Scanner Results */}
        {scannedResult && (
          <div className="p-6 bg-green-900/20 border-b border-green-500/20">
            <div className="flex items-center justify-between mb-4">
              <span className="text-green-300 font-semibold">✅ Scanned Result:</span>
              <span className="text-xs text-gray-400">Attempt #{scanAttempts}</span>
            </div>
            
            <div className="bg-black/50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-white font-mono text-lg">{scannedResult}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(scannedResult)}
                  className="text-blue-400 hover:text-blue-300 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 rounded-xl text-white font-semibold transition-colors"
              >
                Use This Code
              </button>
              <button
                onClick={() => { setScannedResult(null); startZXingScanning(); }}
                className="px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-colors"
              >
                Scan Again
              </button>
            </div>
          </div>
        )}

        {/* Scanner Area */}
        <div className="flex-1 relative bg-black">
          {/* Video Element */}
          <video
            ref={videoRef}
            className="w-full h-64 object-cover"
            style={{ transform: 'scaleX(-1)' }}
            playsInline
            muted
            autoPlay
          />

          {permissionState === 'granted' && isScanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Scanning Frame */}
                <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                  {/* Corner indicators */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-400 rounded-tl-xl shadow-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-400 rounded-tr-xl shadow-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-400 rounded-bl-xl shadow-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-400 rounded-br-xl shadow-lg"></div>
                  
                  {/* Center cross-hair */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-8 h-0.5 bg-blue-400"></div>
                    <div className="w-0.5 h-8 bg-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
                  </div>
                </div>
                
                {/* Instructions */}
                <div className="absolute top-full mt-6 left-1/2 transform -translate-x-1/2 text-center">
                  <div className="text-lg font-semibold mb-2 px-4 py-2 rounded-lg bg-black/50 text-white">
                    🔍 ZXing-js Scanner
                  </div>
                  <p className="text-gray-300 text-sm bg-black/50 px-3 py-1 rounded-lg">
                    Testing barcode detection accuracy
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
                            className="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
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
          )}
        </div>

        {/* Permission State */}
        {permissionState !== 'granted' && (
          <div className="p-6 text-center">
            {permissionState === 'requesting' ? (
              <div className="text-white">
                <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p>Requesting camera permission...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 mb-4">
                    <div className="flex items-center mb-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                      <span className="text-red-300 font-semibold">Scanner Error</span>
                    </div>
                    <p className="text-red-200 text-sm">{error}</p>
                  </div>
                )}
                <button
                  onClick={requestCameraPermission}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold transition-colors"
                >
                  📸 {error ? 'Retry' : 'Start'} ZXing Scanner
                </button>
                <button
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-colors"
                >
                  📝 Manual Entry
                </button>
              </div>
            )}
          </div>
        )}

        {/* Manual Input */}
        {showManualInput && (
          <div className="p-6 border-t border-white/10">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Enter barcode manually"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-blue-400 mb-4"
              onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
            />
            <button
              onClick={handleManualSubmit}
              disabled={!manualInput.trim()}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded-xl text-white font-semibold transition-colors"
            >
              Submit
            </button>
          </div>
        )}

        {/* Bottom Controls */}
        {(isScanning || error) && (
          <div className="p-6 bg-black/50 space-y-3">
            {isScanning && (
              <button
                onClick={stopScanning}
                className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold transition-colors"
              >
                Stop ZXing Scanner
              </button>
            )}
            {error && permissionState === 'denied' && (
              <button
                onClick={() => {
                  setError('');
                  requestCameraPermission();
                }}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold transition-colors"
              >
                🔄 Restart Scanner
              </button>
            )}
          </div>
        )}

        {/* Error Display During Scanning */}
        {isScanning && error && (
          <div className="p-4 mx-6 bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                <span className="text-yellow-300 font-semibold text-sm">Warning</span>
              </div>
              <button
                onClick={() => setError('')}
                className="text-yellow-300 hover:text-yellow-200 text-xs"
              >
                Dismiss
              </button>
            </div>
            <p className="text-yellow-200 text-xs mt-1">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ZXingScannerModal; 