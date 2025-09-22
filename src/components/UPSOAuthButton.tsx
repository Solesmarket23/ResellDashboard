'use client';

import { useState } from 'react';
import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';

interface UPSOAuthButtonProps {
  userId?: string;
  onAuthSuccess?: (tokenInfo: any) => void;
  onAuthError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export default function UPSOAuthButton({ 
  userId, 
  onAuthSuccess, 
  onAuthError, 
  className = '',
  children 
}: UPSOAuthButtonProps) {
  const { 
    isAuthenticated, 
    isLoading, 
    error, 
    tokenInfo, 
    startAuth, 
    refreshToken, 
    logout, 
    clearError 
  } = useUPSOAuth(userId);

  // Debug logging
  console.log('🔍 UPSOAuthButton render:', { 
    isAuthenticated, 
    isLoading, 
    error, 
    userId,
    hasTokenInfo: !!tokenInfo 
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const success = await refreshToken();
      if (success && onAuthSuccess) {
        onAuthSuccess(tokenInfo);
      } else if (!success && onAuthError) {
        onAuthError('Failed to refresh token');
      }
    } catch (error) {
      if (onAuthError) {
        onAuthError(error instanceof Error ? error.message : 'Unknown error');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (isAuthenticated) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">
                UPS OAuth Connected
              </h3>
              <div className="mt-2 text-sm text-green-700">
                <p>Token Type: {tokenInfo?.token_type}</p>
                <p>Expires In: {tokenInfo?.expires_in} seconds</p>
                <p>Scope: {tokenInfo?.scope}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isRefreshing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </>
            ) : (
              'Refresh Token'
            )}
          </button>

          <button
            onClick={handleLogout}
            className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Authentication Error
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <a
          href="/api/ups/oauth/authorize"
          onClick={(e) => {
            console.log('🔗 UPS OAuth link clicked!', e);
            console.log('🔗 Link href:', e.currentTarget.href);
            console.log('🔗 User ID:', userId);
            console.log('🔗 Event target:', e.target);
            console.log('🔗 Event current target:', e.currentTarget);
          }}
          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          {children || 'Connect with UPS OAuth'}
        </a>
        
        {/* Debug button */}
        <button
          onClick={() => {
            console.log('🧪 Test button clicked!');
            console.log('🧪 Current state:', { isAuthenticated, isLoading, error, userId });
            
            try {
              console.log('🧪 Attempting navigation...');
              window.location.href = '/api/ups/oauth/authorize';
              console.log('🧪 Navigation command sent');
            } catch (error) {
              console.error('🧪 Navigation error:', error);
            }
          }}
          className="inline-flex items-center px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Test OAuth (Debug)
        </button>
        
        {/* Simple test link */}
        <a 
          href="/api/ups/oauth/authorize" 
          className="inline-block px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
        >
          Simple Test Link
        </a>
        
        {/* Test redirect to Google */}
        <a 
          href="/api/test-redirect" 
          className="inline-block px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test Redirect to Google
        </a>
      </div>

      {!userId && (
        <p className="text-sm text-gray-500">
          User ID is required for OAuth authentication
        </p>
      )}
    </div>
  );
}
