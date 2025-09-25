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
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Check if neon theme is active
  const isNeonTheme = currentTheme?.name === 'Neon';

  useEffect(() => {
    checkConnectionStatus();
    
    // Check for OAuth callback results
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('gmail_connected') === 'true') {
      setIsConnected(true);
      onConnectionChange?.(true);
      // Clean up only Gmail-specific params, preserve other query params like 'section'
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail_connected');
      url.searchParams.delete('gmail_error');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    } else if (urlParams.get('gmail_error') === 'true') {
      setError('Failed to connect to Gmail. Please try again.');
      // Clean up only Gmail-specific params, preserve other query params like 'section'
      const url = new URL(window.location.href);
      url.searchParams.delete('gmail_connected');
      url.searchParams.delete('gmail_error');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    }
  }, [onConnectionChange]);

  const checkConnectionStatus = async () => {
    try {
      console.log('🔍 Checking Gmail connection status...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection check timeout')), 10000)
      );
      
      const fetchPromise = fetch('/api/gmail/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      const data = await response.json().catch(() => ({}));
      
      console.log(`📋 Gmail connection check: Status ${response.status}`, data);
      
      if (response.status === 401 || data.needsReconnect) {
        console.log('🔐 Gmail authentication needed:', data);
        setIsConnected(false);
        setNeedsReconnect(true);
        setDaysRemaining(null);
        onConnectionChange?.(false);
        
        if (data.reason?.includes('7 days')) {
          setError(`Gmail connection expired after 7 days. Please reconnect.`);
        }
      } else {
        setIsConnected(true);
        setNeedsReconnect(false);
        setDaysRemaining(data.daysRemaining || null);
        onConnectionChange?.(true);
        setError(null);
      }
    } catch (error) {
      console.error('❌ Gmail connection check failed:', error);
      
      // If it's a timeout, assume not connected and don't show error
      if (error instanceof Error && error.message.includes('timeout')) {
        console.log('⏰ Connection check timed out - assuming not connected');
        setIsConnected(false);
        onConnectionChange?.(false);
      } else {
        setIsConnected(false);
        onConnectionChange?.(false);
        setError('Connection check failed');
      }
    }
  };

  const connectToGmail = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Set a timeout to prevent infinite connecting state
      const timeoutId = setTimeout(() => {
        if (isConnecting) {
          setError('Connection timed out. Please try resetting the connection.');
          setIsConnecting(false);
        }
      }, 15000); // 15 second timeout
      
      // Get the current page to return to after authentication
      const currentPath = window.location.pathname + window.location.search;
      console.log('🔐 Gmail Connector - Current path:', currentPath);
      console.log('🔐 Gmail Connector - Pathname:', window.location.pathname);
      console.log('🔐 Gmail Connector - Search:', window.location.search);
      console.log('🔐 Gmail Connector - Full URL:', window.location.href);
      
      const response = await fetch(`/api/gmail/auth?returnUrl=${encodeURIComponent(currentPath)}`);
      const data = await response.json();
      
      clearTimeout(timeoutId);
      
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

  const resetGmailConnection = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      // Reset Gmail connection
      await fetch('/api/gmail/reset', { method: 'POST' });
      
      // Wait a moment then try to reconnect
      setTimeout(() => {
        connectToGmail();
      }, 1000);
    } catch (error) {
      console.error('Error resetting Gmail connection:', error);
      setError('Failed to reset Gmail connection');
      setIsConnecting(false);
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
          }`}>
            Purchase emails will be automatically imported
            {daysRemaining !== null && (
              <span className="block mt-1">
                {daysRemaining > 1 ? `Expires in ${daysRemaining} days` : 
                 daysRemaining === 1 ? 'Expires tomorrow' : 
                 'Expires today'}
              </span>
            )}
          </div>
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
        <div className="flex space-x-2">
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
          <button
            onClick={resetGmailConnection}
            className={`text-xs underline ${ 
              isNeonTheme 
                ? 'text-red-400 hover:text-red-300' 
                : 'text-red-700 hover:text-red-900'
            }`}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className={`flex items-center space-x-3 px-4 py-3 rounded-lg border ${ 
        isNeonTheme 
          ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 backdrop-blur-sm' 
          : 'bg-yellow-50 text-yellow-800 border-yellow-200'
      }`}>
        <Loader2 className={`w-5 h-5 animate-spin ${ 
          isNeonTheme 
            ? 'text-yellow-400' 
            : 'text-yellow-600'
        }`} />
        <div className="flex-1">
          <div className="font-medium text-sm">Connecting to Gmail...</div>
          <div className={`text-xs ${ 
            isNeonTheme 
              ? 'text-yellow-400/70' 
              : 'text-yellow-600'
          }`}>Please wait while we establish the connection</div>
        </div>
        <button
          onClick={resetGmailConnection}
          className={`text-xs underline ${ 
            isNeonTheme 
              ? 'text-yellow-400 hover:text-yellow-300' 
              : 'text-yellow-700 hover:text-yellow-900'
          }`}
        >
          Reset
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