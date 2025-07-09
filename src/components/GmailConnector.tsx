'use client';

import { useState, useEffect } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface GmailConnectorProps {
  onConnectionChange?: (connected: boolean) => void;
}

const GmailConnector: React.FC<GmailConnectorProps> = ({ onConnectionChange }) => {
  const { currentTheme } = useTheme();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if neon theme is active
  const isNeonTheme = currentTheme?.name === 'Neon';

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
      console.log('🔍 Checking Gmail connection status...');
      const response = await fetch('/api/gmail/purchases/');
      const isConnected = response.status !== 401;
      console.log(`📋 Gmail connection check: Status ${response.status}, Connected: ${isConnected}`);
      
      if (response.status === 401) {
        const errorData = await response.json().catch(() => ({}));
        console.log('🔐 Gmail authentication needed:', errorData);
      }
      
      setIsConnected(isConnected);
      onConnectionChange?.(isConnected);
    } catch (error) {
      console.error('❌ Gmail connection check failed:', error);
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
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border ${ 
        isNeonTheme 
          ? 'bg-green-500/10 text-green-400 border-green-500/30 backdrop-blur-sm' 
          : 'bg-green-50 text-green-800 border-green-200'
      }`}>
        <CheckCircle className={`w-5 h-5 ${ 
          isNeonTheme 
            ? 'text-green-400' 
            : 'text-green-600'
        }`} />
        <div className="flex-1">
          <div className="font-medium text-sm">Gmail Connected</div>
          <div className={`text-xs ${ 
            isNeonTheme 
              ? 'text-green-400/70' 
              : 'text-green-600'
          }`}>Purchase emails will be automatically imported</div>
        </div>
        <button
          onClick={disconnectFromGmail}
          className={`text-xs underline ${ 
            isNeonTheme 
              ? 'text-green-400 hover:text-green-300' 
              : 'text-green-700 hover:text-green-900'
          }`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border ${ 
        isNeonTheme 
          ? 'bg-red-500/10 text-red-400 border-red-500/30 backdrop-blur-sm' 
          : 'bg-red-50 text-red-800 border-red-200'
      }`}>
        <AlertCircle className={`w-5 h-5 ${ 
          isNeonTheme 
            ? 'text-red-400' 
            : 'text-red-600'
        }`} />
        <div className="flex-1">
          <div className="font-medium text-sm">Connection Error</div>
          <div className={`text-xs ${ 
            isNeonTheme 
              ? 'text-red-400/70' 
              : 'text-red-600'
          }`}>{error}</div>
        </div>
        <button
          onClick={() => {
            setError(null);
            connectToGmail();
          }}
          className={`text-xs underline ${ 
            isNeonTheme 
              ? 'text-red-400 hover:text-red-300' 
              : 'text-red-700 hover:text-red-900'
          }`}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border ${ 
      isNeonTheme 
        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 backdrop-blur-sm' 
        : 'bg-blue-50 text-blue-800 border-blue-200'
    }`}>
      <Mail className={`w-5 h-5 ${ 
        isNeonTheme 
          ? 'text-blue-400' 
          : 'text-blue-600'
      }`} />
      <div className="flex-1">
        <div className="font-medium text-sm">Connect Gmail</div>
        <div className={`text-xs ${ 
          isNeonTheme 
            ? 'text-blue-400/70' 
            : 'text-blue-600'
        }`}>Import purchase emails automatically from StockX, GOAT, and more</div>
      </div>
      <button
        onClick={connectToGmail}
        disabled={isConnecting}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm disabled:opacity-50 ${ 
          isNeonTheme 
            ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
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