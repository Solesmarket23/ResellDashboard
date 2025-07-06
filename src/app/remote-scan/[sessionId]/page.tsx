'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle, X, Camera, Smartphone, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    Quagga: any;
  }
}

const RemoteScanPage = () => {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  
  const [isScanning, setIsScanning] = useState(false);
  const [scannedResult, setScannedResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [permissionState, setPermissionState] = useState<'unknown' | 'requesting' | 'granted' | 'denied'>('unknown');
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'scanning' | 'completed'>('waiting');
  const [detectionHash, setDetectionHash] = useState<{ [key: string]: number }>({});
  const [detectionProgress, setDetectionProgress] = useState<{ code: string; count: number } | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  
  const REQUIRED_DETECTIONS = 3;

  // Load QuaggaJS dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js';
    script.onload = () => {
      console.log('📱 QuaggaJS loaded for remote scanning');
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  // Update session status
  const updateSessionStatus = async (status: 'waiting' | 'scanning' | 'completed', result?: string) => {
    try {
      await fetch(`/api/remote-scan/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, result })
      });
      setSessionStatus(status);
    } catch (error) {
      console.error('Failed to update session status:', error);
    }
  };

  const startScanning = async () => {
    setPermissionState('requesting');
    setError('');
    
    try {
      if (!window.Quagga) {
        throw new Error('QuaggaJS not loaded');
      }

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      cameraStream.current = stream;
      setPermissionState('granted');
      setIsScanning(true);
      scanningRef.current = true;
      
      // Update session status
      await updateSessionStatus('scanning');

      // Initialize Quagga
      window.Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            width: 1280,
            height: 720,
            facingMode: "environment"
          }
        },
        decoder: {
          readers: ['code_128_reader', 'ean_reader', 'ean_8_reader', 'code_39_reader', 'codabar_reader', 'i2of5_reader', 'upc_reader', 'upc_e_reader']
        },
        locate: true,
        locator: {
          patchSize: "large",
          halfSample: false
        },
        frequency: 5,
        numOfWorkers: 4
      }, (err: any) => {
        if (err) {
          console.error('QuaggaJS initialization error:', err);
          setError('Failed to initialize scanner: ' + err.message);
          setPermissionState('denied');
          return;
        }
        
        window.Quagga.start();
        console.log('📱 Remote QuaggaJS scanner started');
        
        // Add detection handler
        window.Quagga.onDetected(handleBarcodeDetected);
      });
      
    } catch (error: any) {
      console.error('Camera permission error:', error);
      setPermissionState('denied');
      setError(error.message || 'Camera access denied');
    }
  };

  const handleBarcodeDetected = (data: any) => {
    if (!scanningRef.current) return;
    
    const code = data.codeResult.code;
    const quality = data.codeResult.quality;
    
    console.log('📱 Remote scan detection:', { code, quality });
    
    // Quality threshold
    if (quality < 0.25) {
      console.log('❌ Low quality detection, ignoring');
      return;
    }
    
    // Validate barcode
    if (!isValidBarcode(code)) {
      console.log('❌ Invalid barcode format:', code);
      return;
    }
    
    // Update detection hash
    const newDetectionHash = { ...detectionHash };
    if (!newDetectionHash[code]) {
      newDetectionHash[code] = 0;
    }
    newDetectionHash[code]++;
    setDetectionHash(newDetectionHash);
    
    console.log(`📱 Detection count for ${code}: ${newDetectionHash[code]}/${REQUIRED_DETECTIONS}`);
    
    // Update progress
    setDetectionProgress({ code, count: newDetectionHash[code] });
    
    // Check if we have enough detections
    if (newDetectionHash[code] >= REQUIRED_DETECTIONS) {
      console.log('✅ Remote scan confirmed:', code);
      
      // Trigger haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      
      handleScanComplete(code);
    }
  };

  const isValidBarcode = (code: string): boolean => {
    const cleanCode = code.trim();
    
    // Require minimum 12 characters for UPC/EAN
    if (cleanCode.length < 12) {
      return false;
    }
    
    // Check for valid characters
    const validChars = /^[A-Za-z0-9]+$/;
    if (!validChars.test(cleanCode)) {
      return false;
    }
    
    // UPC/EAN codes (12-13 digits)
    const isAllNumeric = /^[0-9]+$/.test(cleanCode);
    if (isAllNumeric && (cleanCode.length === 12 || cleanCode.length === 13)) {
      return true;
    }
    
    return false;
  };

  const handleScanComplete = async (result: string) => {
    setScannedResult(result);
    setIsScanning(false);
    scanningRef.current = false;
    
    // Stop QuaggaJS
    if (window.Quagga) {
      window.Quagga.stop();
    }
    
    // Stop camera stream
    if (cameraStream.current) {
      cameraStream.current.getTracks().forEach(track => track.stop());
      cameraStream.current = null;
    }
    
    // Update session with result
    await updateSessionStatus('completed', result);
    
    // Show completion for 2 seconds then close
    setTimeout(() => {
      router.push('/');
    }, 2000);
  };

  const stopScanning = () => {
    setIsScanning(false);
    scanningRef.current = false;
    
    if (window.Quagga) {
      window.Quagga.stop();
    }
    
    if (cameraStream.current) {
      cameraStream.current.getTracks().forEach(track => track.stop());
      cameraStream.current = null;
    }
    
    updateSessionStatus('waiting');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-purple-400" />
            <div>
              <h1 className="text-white text-lg font-bold">Remote Scanner</h1>
              <p className="text-gray-400 text-sm">Session: {sessionId.slice(0, 8)}...</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="flex-1 relative">
        {!isScanning && !scannedResult && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-purple-600 rounded-full flex items-center justify-center mx-auto">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold mb-2">Ready to Scan</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Your computer is waiting for you to scan a barcode
                </p>
              </div>
              
              {error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-300 text-sm">{error}</span>
                  </div>
                </div>
              )}
              
              <button
                onClick={startScanning}
                disabled={permissionState === 'requesting'}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                {permissionState === 'requesting' ? 'Starting Camera...' : 'Start Scanning'}
              </button>
            </div>
          </div>
        )}

        {isScanning && (
          <div className="h-full relative">
            <div ref={scannerRef} className="w-full h-full">
              <video ref={videoRef} className="w-full h-full object-cover" />
            </div>
            
            {/* Scanner overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Scanning frame */}
                <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                  {/* Corner indicators */}
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-xl shadow-lg"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-xl shadow-lg"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-xl shadow-lg"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-xl shadow-lg"></div>
                  
                  {/* Center cross-hair */}
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-8 h-0.5 bg-green-400 shadow-lg"></div>
                    <div className="w-0.5 h-8 bg-green-400 shadow-lg absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
                  </div>
                </div>
                
                {/* Instructions */}
                <div className="absolute top-full mt-6 left-1/2 transform -translate-x-1/2 text-center">
                  <div className="text-lg font-semibold mb-2 px-4 py-2 rounded-lg bg-black/50 text-white">
                    📱 Remote Scanner
                  </div>
                  <p className="text-gray-300 text-sm bg-black/50 px-3 py-1 rounded-lg">
                    Point camera at barcode
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
            
            {/* Stop button */}
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
              <button
                onClick={stopScanning}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Stop Scanning
              </button>
            </div>
          </div>
        )}

        {scannedResult && (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-white text-xl font-bold mb-2">Scan Complete!</h2>
                <p className="text-gray-400 text-sm mb-4">
                  Result sent to your computer
                </p>
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
                  <div className="font-mono text-green-300 text-lg">
                    {scannedResult}
                  </div>
                </div>
              </div>
              <p className="text-gray-500 text-sm">
                Closing automatically...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteScanPage; 