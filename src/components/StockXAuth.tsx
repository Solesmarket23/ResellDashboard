'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Settings, ExternalLink, RefreshCw, LogIn } from 'lucide-react';

interface AuthStatus {
  isAuthenticated: boolean;
  hasCredentials: boolean;
  message: string;
  statusCode?: number;
}

interface StockXAuthProps {
  onAuthChange?: (isAuthenticated: boolean) => void;
  showInstructions?: boolean;
}

export default function StockXAuth({ onAuthChange, showInstructions = true }: StockXAuthProps) {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isAuthenticated: false,
    hasCredentials: false,
    message: 'Checking authentication...'
  });
  const [isLoading, setIsLoading] = useState(true);

  const checkAuthStatus = async () => {
    setIsLoading(true);
    try {
      // Check authentication status first
      const testResponse = await fetch('/api/stockx/test');
      const testData = await testResponse.json();
      
      console.log('🔍 Auth check response:', testData);
      
      // Check if we have credentials by looking at the test response
      const hasCredentials = testData.apiKeyPresent || testData.accessTokenPresent;
      
      if (!hasCredentials) {
        setAuthStatus({
          isAuthenticated: false,
          hasCredentials: false,
          message: 'StockX OAuth credentials not configured'
        });
        onAuthChange?.(false);
        setIsLoading(false);
        return;
      }

      // If we have credentials, check if we're authenticated
      if (testData.accessTokenPresent) {
        setAuthStatus({
          isAuthenticated: true,
          hasCredentials: true,
          message: 'Connected to StockX',
          statusCode: testResponse.status
        });
        onAuthChange?.(true);
      } else {
        setAuthStatus({
          isAuthenticated: false,
          hasCredentials: true,
          message: 'Not authenticated with StockX - Login required',
          statusCode: testResponse.status
        });
        onAuthChange?.(false);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthStatus({
        isAuthenticated: false,
        hasCredentials: false,
        message: 'Authentication check failed'
      });
      onAuthChange?.(false);
    }
    setIsLoading(false);
  };

  const handleLogin = () => {
    const currentUrl = window.location.href;
    const authUrl = `/api/stockx/auth?returnTo=${encodeURIComponent(currentUrl)}`;
    window.location.href = authUrl;
  };

  const handleRefresh = () => {
    checkAuthStatus();
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (isLoading) {
    return (
      <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-slate-300">Checking StockX authentication...</span>
        </div>
      </div>
    );
  }

  // Missing credentials state
  if (!authStatus.hasCredentials) {
    return (
      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-red-400 font-semibold text-lg mb-2">StockX Credentials Required</h3>
            <p className="text-red-200 mb-4">
              To use StockX features, you need to set up OAuth credentials. This requires StockX API access.
            </p>
            
            {showInstructions && (
              <div className="bg-red-800/20 border border-red-500/20 rounded-lg p-4 mb-4">
                <h4 className="text-red-300 font-medium mb-2">Setup Instructions:</h4>
                <ol className="text-red-200 text-sm space-y-1 list-decimal list-inside">
                  <li>Contact StockX to request API access for your application</li>
                  <li>Once approved, you'll receive your OAuth credentials</li>
                  <li>Add these environment variables to your <code className="bg-red-800/30 px-1 rounded">.env.local</code> file:</li>
                </ol>
                <div className="mt-3 p-3 bg-slate-900/50 rounded border border-red-500/20">
                  <code className="text-red-200 text-sm block">
                    STOCKX_CLIENT_ID=your_client_id<br />
                    STOCKX_CLIENT_SECRET=your_client_secret<br />
                    STOCKX_API_KEY=your_api_key
                  </code>
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
              <a
                href="https://stockx.com/api"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-600/80 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                StockX API Info
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated but credentials exist
  if (!authStatus.isAuthenticated) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-3">
          <Settings className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-yellow-400 font-semibold text-lg mb-2">StockX Login Required</h3>
            <p className="text-yellow-200 mb-4">
              You need to authenticate with your StockX account to access StockX features.
            </p>
            
            <div className="flex items-center gap-2">
              <button
                onClick={handleLogin}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-lg transition-all flex items-center gap-2 font-medium"
              >
                <LogIn className="w-4 h-4" />
                Login with StockX
              </button>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-slate-600/80 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Successfully authenticated
  return (
    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="text-green-300 font-medium">{authStatus.message}</span>
        </div>
        <button
          onClick={handleRefresh}
          className="px-3 py-1 bg-green-600/80 hover:bg-green-600 text-white rounded transition-colors flex items-center gap-1 text-sm"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>
    </div>
  );
} 