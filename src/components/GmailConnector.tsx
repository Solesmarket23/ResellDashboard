'use client';

import { useState, useEffect, useRef } from 'react';
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';

interface GmailConnectorProps {
  onConnectionChange?: (connected: boolean) => void;
}

const GmailConnector: React.FC<GmailConnectorProps> = ({ onConnectionChange }) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isChecking, setIsChecking] = useState(false); // Start as false, only show when actually checking
  const [error, setError] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Check if neon theme is active
  const isNeonTheme = currentTheme?.name === 'Neon';

  // Use ref to track if we've checked connection status to prevent re-checking on every render
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Only check connection status once on mount, unless we haven't checked yet
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      // Only show checking state if we're not already connected (quick check via localStorage/cookie)
      const quickCheck = document.cookie.includes('gmail_connected=true') || 
                        localStorage.getItem('gmail_connected') === 'true';
      if (!quickCheck) {
        setIsChecking(true);
      }
      checkConnectionStatus();
    }
    
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

  const registerGmailWebhook = async (statusData: any) => {
    try {
      console.log('📬 Registering Gmail webhook...');
      
      // Call watch endpoint with Firebase user ID
      const response = await fetch('/api/gmail/watch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.uid // Pass Firebase user ID
        })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Gmail webhook registered:', result);
      } else {
        const errorText = await response.text();
        console.warn('⚠️ Gmail webhook registration failed:', errorText);
      }
    } catch (error) {
      console.warn('⚠️ Gmail webhook registration error:', error);
    }
  };

  const checkConnectionStatus = async () => {
    // Only show checking state if not already connected
    if (!isConnected) {
      setIsChecking(true);
    }
    try {
      console.log('🔍 Checking Gmail connection status...');
      
      // Create abort controller for timeout (5 seconds max)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('/api/gmail/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
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
        
        // Register Gmail webhook for push notifications (fire and forget)
        registerGmailWebhook(data).catch(err => {
          console.warn('⚠️ Failed to register Gmail webhook:', err);
          // Don't show error to user - webhook is optional enhancement
        });
      }
    } catch (error) {
      console.error('❌ Gmail connection check failed:', error);
      
      // If it's a timeout or abort, assume not connected and don't show error
      if (error instanceof Error && (error.message.includes('timeout') || error.name === 'AbortError')) {
        console.log('⏰ Connection check timed out - assuming not connected (page will still load)');
        setIsConnected(false);
        setIsChecking(false); // Stop showing checking state
        onConnectionChange?.(false);
      } else {
        setIsConnected(false);
        setIsChecking(false);
        onConnectionChange?.(false);
        // Don't set error for timeout - just silently fail
        if (!(error instanceof Error && error.message.includes('timeout'))) {
          setError('Connection check failed');
        }
      }
    } finally {
      setIsChecking(false); // Always stop checking state
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

  // Show loading state while checking connection status
  if (isChecking) {
    return (
      <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${ 
        isNeonTheme 
          ? 'bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-gray-700/50 shadow-lg' 
          : 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200 shadow-sm'
      }`}>
        <div className="relative flex items-center gap-4 px-5 py-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            isNeonTheme 
              ? 'bg-gray-700/50' 
              : 'bg-gray-200'
          }`}>
            <Loader2 className={`w-5 h-5 animate-spin ${ 
              isNeonTheme 
                ? 'text-gray-400' 
                : 'text-gray-600'
            }`} />
          </div>
          
          <div className="flex-1">
            <div className={`font-semibold text-base ${
              isNeonTheme ? 'text-gray-300' : 'text-gray-800'
            }`}>
              Checking Gmail connection...
            </div>
            <div className={`text-sm mt-1 ${
              isNeonTheme 
                ? 'text-gray-400' 
                : 'text-gray-600'
            }`}>
              Please wait
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${ 
        isNeonTheme 
          ? 'bg-gradient-to-br from-emerald-500/10 via-green-500/10 to-teal-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
          : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-sm'
      }`}>
        {/* Animated background gradient */}
        <div className={`absolute inset-0 opacity-30 ${
          isNeonTheme ? 'bg-gradient-to-r from-emerald-500/20 via-green-500/20 to-teal-500/20' : ''
        }`} style={{
          backgroundSize: '200% 200%',
          animation: 'gradient 8s ease infinite'
        }} />
        
        <div className="relative flex items-center gap-4 px-5 py-4">
          {/* Icon */}
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            isNeonTheme 
              ? 'bg-emerald-500/20 ring-2 ring-emerald-500/50' 
              : 'bg-green-100 ring-2 ring-green-300'
          }`}>
            <div className="relative">
              <img
                src="/google-g.svg"
                alt="Google"
                className="w-5 h-5"
                loading="lazy"
                decoding="async"
              />
              {/* Small status badge so it's still obvious this is a success state */}
              <div
                className={`absolute -right-2 -bottom-2 rounded-full ${
                  isNeonTheme ? 'bg-emerald-500/90' : 'bg-green-600'
                }`}
                style={{ width: 16, height: 16 }}
                aria-hidden="true"
              >
                <CheckCircle className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className={`font-semibold text-base flex items-center gap-2 ${
              isNeonTheme ? 'text-emerald-400' : 'text-green-800'
            }`}>
              Gmail Connected
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                isNeonTheme 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-green-100 text-green-700 border border-green-300'
              }`}>
                Active
              </span>
            </div>
            <div className={`text-sm mt-1 ${
              isNeonTheme 
                ? 'text-emerald-400/80' 
                : 'text-green-700'
            }`}>
              Purchase emails will be automatically imported
            </div>
            {daysRemaining !== null && (
              <div className={`text-xs mt-1.5 flex items-center gap-1.5 ${
                isNeonTheme 
                  ? 'text-emerald-400/60' 
                  : 'text-green-600'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  {daysRemaining > 1 ? `Expires in ${daysRemaining} days` : 
                   daysRemaining === 1 ? 'Expires tomorrow' : 
                   'Expires today'}
                </span>
              </div>
            )}
          </div>
          
          {/* Disconnect button */}
          <button
            onClick={disconnectFromGmail}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              isNeonTheme 
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/50 hover:border-emerald-500' 
                : 'bg-white hover:bg-green-50 text-green-700 border border-green-300 hover:border-green-400 shadow-sm'
            }`}
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${ 
        isNeonTheme 
          ? 'bg-gradient-to-br from-red-500/10 via-rose-500/10 to-pink-500/10 border-red-500/30 shadow-lg shadow-red-500/10' 
          : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200 shadow-sm'
      }`}>
        <div className="relative flex items-center gap-4 px-5 py-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            isNeonTheme 
              ? 'bg-red-500/20 ring-2 ring-red-500/50' 
              : 'bg-red-100 ring-2 ring-red-300'
          }`}>
            <AlertCircle className={`w-5 h-5 ${ 
              isNeonTheme 
                ? 'text-red-400' 
                : 'text-red-600'
            }`} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className={`font-semibold text-base ${
              isNeonTheme ? 'text-red-400' : 'text-red-800'
            }`}>
              Connection Error
            </div>
            <div className={`text-sm mt-1 ${
              isNeonTheme 
                ? 'text-red-400/80' 
                : 'text-red-700'
            }`}>
              {error}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => {
                setError(null);
                connectToGmail();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                isNeonTheme 
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 hover:border-red-500' 
                  : 'bg-white hover:bg-red-50 text-red-700 border border-red-300 hover:border-red-400 shadow-sm'
              }`}
            >
              Retry
            </button>
            <button
              onClick={resetGmailConnection}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                isNeonTheme 
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 hover:border-red-500/50' 
                  : 'bg-white hover:bg-red-50 text-red-700 border border-red-200 hover:border-red-300 shadow-sm'
              }`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 ${ 
        isNeonTheme 
          ? 'bg-gradient-to-br from-yellow-500/10 via-amber-500/10 to-orange-500/10 border-yellow-500/30 shadow-lg' 
          : 'bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200 shadow-sm'
      }`}>
        <div className="relative flex items-center gap-4 px-5 py-4">
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
            isNeonTheme 
              ? 'bg-yellow-500/20' 
              : 'bg-yellow-100'
          }`}>
            <Loader2 className={`w-5 h-5 animate-spin ${ 
              isNeonTheme 
                ? 'text-yellow-400' 
                : 'text-yellow-600'
            }`} />
          </div>
          
          <div className="flex-1">
            <div className={`font-semibold text-base ${
              isNeonTheme ? 'text-yellow-400' : 'text-yellow-800'
            }`}>
              Connecting to Gmail...
            </div>
            <div className={`text-sm mt-1 ${
              isNeonTheme 
                ? 'text-yellow-400/80' 
                : 'text-yellow-700'
            }`}>
              Please wait while we establish the connection
            </div>
          </div>
          
          <button
            onClick={resetGmailConnection}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              isNeonTheme 
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/50' 
                : 'bg-white hover:bg-yellow-50 text-yellow-700 border border-yellow-300 shadow-sm'
            }`}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border transition-all duration-300 hover:shadow-lg ${ 
      isNeonTheme 
        ? 'bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-blue-500/30 shadow-md hover:shadow-blue-500/20' 
        : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-sm hover:shadow-md'
    }`}>
      <div className="relative flex items-center gap-4 px-5 py-4">
        <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
          isNeonTheme 
            ? 'bg-blue-500/20 ring-2 ring-blue-500/50' 
            : 'bg-blue-100 ring-2 ring-blue-300'
        }`}>
          <Mail className={`w-5 h-5 ${ 
            isNeonTheme 
              ? 'text-blue-400' 
              : 'text-blue-600'
          }`} />
        </div>
        
        <div className="flex-1">
          <div className={`font-semibold text-base ${
            isNeonTheme ? 'text-blue-400' : 'text-blue-800'
          }`}>
            Connect Gmail
          </div>
          <div className={`text-sm mt-1 ${
            isNeonTheme 
              ? 'text-blue-400/80' 
              : 'text-blue-700'
          }`}>
            Import purchase emails automatically from StockX, GOAT, and more
          </div>
        </div>
        
        <button
          onClick={connectToGmail}
          disabled={isConnecting}
          className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${
            `${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white shadow-lg`
          }`}
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Connecting...
            </span>
          ) : (
            <span>Connect</span>
          )}
        </button>
      </div>
    </div>
  );
};

export default GmailConnector; 