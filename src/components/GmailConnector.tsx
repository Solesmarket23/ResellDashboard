'use client';

import { useState, useEffect } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface GmailConnectorProps {
  onConnectionChange?: (connected: boolean) => void;
}

const GmailConnector: React.FC<GmailConnectorProps> = ({ onConnectionChange }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
    
    // Check for OAuth callback results
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('gmail_connected') === 'true') {
      setIsConnected(true);
      onConnectionChange?.(true);
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    } else if (urlParams.get('gmail_error') === 'true') {
      setError('Failed to connect to Gmail. Please try again.');
      // Clean up URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [onConnectionChange]);

  const checkConnectionStatus = async () => {
    try {
      const response = await fetch('/api/gmail/purchases');
      setIsConnected(response.status !== 401);
      onConnectionChange?.(response.status !== 401);
    } catch (error) {
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  };

  const connectToGmail = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/api/gmail/auth');
      const data = await response.json();
      
      if (data.authUrl) {
        // Redirect to Google OAuth
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Error connecting to Gmail:', error);
      setError('Failed to initiate Gmail connection');
      setIsConnecting(false);
    }
  };

  const disconnectFromGmail = async () => {
    try {
      // Clear cookies by making a request to clear them
      await fetch('/api/gmail/disconnect', { method: 'POST' });
      setIsConnected(false);
      onConnectionChange?.(false);
    } catch (error) {
      console.error('Error disconnecting from Gmail:', error);
    }
  };

  if (isConnected) {
    return (
      <div className="flex items-center space-x-3 bg-green-50 text-green-800 px-4 py-3 rounded-lg border border-green-200">
        <CheckCircle className="w-5 h-5 text-green-600" />
        <div className="flex-1">
          <div className="font-medium text-sm">Gmail Connected</div>
          <div className="text-xs text-green-600">Purchase emails will be automatically imported</div>
        </div>
        <button
          onClick={disconnectFromGmail}
          className="text-xs text-green-700 hover:text-green-900 underline"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center space-x-3 bg-red-50 text-red-800 px-4 py-3 rounded-lg border border-red-200">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <div className="flex-1">
          <div className="font-medium text-sm">Connection Error</div>
          <div className="text-xs text-red-600">{error}</div>
        </div>
        <button
          onClick={() => {
            setError(null);
            connectToGmail();
          }}
          className="text-xs text-red-700 hover:text-red-900 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3 bg-blue-50 text-blue-800 px-4 py-3 rounded-lg border border-blue-200">
      <Mail className="w-5 h-5 text-blue-600" />
      <div className="flex-1">
        <div className="font-medium text-sm">Connect Gmail</div>
        <div className="text-xs text-blue-600">Import purchase emails automatically from StockX, GOAT, and more</div>
      </div>
      <button
        onClick={connectToGmail}
        disabled={isConnecting}
        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <span>Connect</span>
        )}
      </button>
    </div>
  );
};

export default GmailConnector; 