'use client';

import React, { useState, useEffect } from 'react';
import { X, Copy, Smartphone, CheckCircle, Clock, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

interface RemoteScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (trackingNumber: string) => void;
}

const RemoteScanModal = ({ isOpen, onClose, onScanComplete }: RemoteScanModalProps) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [scanUrl, setScanUrl] = useState<string>('');
  const [status, setStatus] = useState<'waiting' | 'scanning' | 'completed'>('waiting');
  const [scannedResult, setScannedResult] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [polling, setPolling] = useState(false);

  // Generate unique session ID and scan URL
  useEffect(() => {
    if (isOpen) {
      const newSessionId = generateSessionId();
      // Use ngrok URL if available, otherwise fall back to localhost
      const baseUrl = window.location.hostname === 'localhost' 
        ? 'https://ff5f-98-124-107-39.ngrok-free.app' 
        : window.location.origin;
      const newScanUrl = `${baseUrl}/remote-scan/${newSessionId}`;
      
      setSessionId(newSessionId);
      setScanUrl(newScanUrl);
      setStatus('waiting');
      setScannedResult('');
      
      // Generate QR code
      generateQRCode(newScanUrl);
      
      // Start polling for scan results
      startPolling(newSessionId);
    }

    return () => {
      setPolling(false);
    };
  }, [isOpen]);

  const generateSessionId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  const generateQRCode = async (url: string) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeDataUrl(qrDataUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  };

  const startPolling = (sessionId: string) => {
    setPolling(true);
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/remote-scan/${sessionId}`);
        const data = await response.json();
        
        if (data.status === 'completed' && data.result) {
          setStatus('completed');
          setScannedResult(data.result);
          setPolling(false);
          clearInterval(pollInterval);
          
          // Trigger haptic feedback
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
        } else if (data.status === 'scanning') {
          setStatus('scanning');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      setPolling(false);
      clearInterval(pollInterval);
    }, 5 * 60 * 1000);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleComplete = () => {
    if (scannedResult && onScanComplete) {
      onScanComplete(scannedResult);
    }
    onClose();
  };

  const handleClose = () => {
    setPolling(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-purple-400" />
            <h2 className="text-white text-xl font-bold">Remote Scan</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status */}
          <div className="text-center">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
              status === 'waiting' ? 'bg-purple-500/20 text-purple-300' :
              status === 'scanning' ? 'bg-blue-500/20 text-blue-300' :
              'bg-green-500/20 text-green-300'
            }`}>
              {status === 'waiting' && <Clock className="w-4 h-4" />}
              {status === 'scanning' && <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />}
              {status === 'completed' && <CheckCircle className="w-4 h-4" />}
              {status === 'waiting' && 'Waiting for phone...'}
              {status === 'scanning' && 'Scanning in progress...'}
              {status === 'completed' && 'Scan completed!'}
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-white rounded-2xl p-6 text-center">
            <div className="w-48 h-48 mx-auto bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              {qrCodeDataUrl ? (
                <img 
                  src={qrCodeDataUrl} 
                  alt="QR Code for Remote Scanning" 
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <QrCode className="w-16 h-16 text-gray-400" />
                  <div className="text-xs text-gray-500">
                    Generating QR Code...
                  </div>
                </div>
              )}
            </div>
            <p className="text-gray-600 text-sm">
              Scan this QR code with your phone's camera
            </p>
          </div>

          {/* URL */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Or open this link on your phone:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={scanUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(scanUrl)}
                className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white/5 rounded-lg p-4 text-sm text-gray-300">
            <h3 className="font-medium text-white mb-2">How to scan:</h3>
            <ol className="space-y-1 text-xs">
              <li>1. Scan the QR code or open the link on your phone</li>
              <li>2. Allow camera access when prompted</li>
              <li>3. Point your phone at the barcode</li>
              <li>4. The result will appear here automatically</li>
            </ol>
          </div>

          {/* Scan Result */}
          {scannedResult && (
            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-300 font-medium">Scanned Successfully!</span>
              </div>
              <div className="bg-black/50 rounded-lg p-3 font-mono text-white text-sm">
                {scannedResult}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {scannedResult ? (
              <>
                <button
                  onClick={handleComplete}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  Use This Code
                </button>
                <button
                  onClick={() => {
                    setScannedResult('');
                    setStatus('waiting');
                    startPolling(sessionId);
                  }}
                  className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
                >
                  Scan Again
                </button>
              </>
            ) : (
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RemoteScanModal; 