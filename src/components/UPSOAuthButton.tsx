'use client';

import { useState } from 'react';
import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';
import { useTheme } from '@/lib/contexts/ThemeContext';

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
  const { currentTheme } = useTheme();
  const { 
    isAuthenticated, 
    isLoading, 
    error, 
    tokenInfo, 
    refreshToken, 
    logout, 
  } = useUPSOAuth(userId);

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
      <div className={className}>
        <div
          className={`h-11 inline-flex items-center justify-between gap-3 rounded-xl px-4 border ${
            currentTheme.name === 'Neon'
              ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-200'
              : 'bg-green-50 border-green-200 text-green-800'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2 h-2 rounded-full ${currentTheme.name === 'Neon' ? 'bg-emerald-400' : 'bg-green-500'}`} />
            <span className="text-sm font-semibold truncate">UPS Connected</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors disabled:opacity-60 ${
                currentTheme.name === 'Neon'
                  ? 'text-emerald-200 hover:bg-white/10'
                  : 'text-green-700 hover:bg-green-100'
              }`}
            >
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
                currentTheme.name === 'Neon'
                  ? 'text-red-300 hover:bg-white/10'
                  : 'text-red-700 hover:bg-red-100'
              }`}
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {error && (
        <div className={`mb-3 rounded-lg p-3 border ${
          currentTheme.name === 'Neon'
            ? 'bg-red-500/10 border-red-400/30 text-red-200'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
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
      <a
        href="/api/ups/oauth/authorize"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
        className={`h-11 inline-flex items-center justify-center px-4 rounded-xl text-sm font-semibold transition-colors focus:outline-none focus:ring-2 ${
          currentTheme.name === 'Neon'
            ? 'bg-indigo-500/90 hover:bg-indigo-500 text-white focus:ring-cyan-400/40'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500'
        }`}
      >
        {isLoading ? 'Connecting…' : (children || 'Connect UPS')}
      </a>
    </div>
  );
}
