'use client';

import { useState } from 'react';
import { useUPSOAuth } from '@/lib/hooks/useUPSOAuth';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { ChevronDown } from 'lucide-react';

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

  const connectHref = "/api/ups/oauth/authorize";

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

  return (
    <div className={className}>
      <details className="relative">
        <summary
          className={`list-none h-11 inline-flex items-center gap-2 rounded-xl px-3 border cursor-pointer select-none transition-colors focus:outline-none focus:ring-2 ${
            currentTheme.name === 'Neon'
              ? 'bg-white/5 border-cyan-500/30 text-white hover:bg-white/10 focus:ring-cyan-400/40'
              : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50 focus:ring-blue-500'
          }`}
          title={isAuthenticated ? 'UPS OAuth is connected' : 'Connect UPS'}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isAuthenticated
                ? (currentTheme.name === 'Neon' ? 'bg-emerald-400' : 'bg-green-500')
                : (currentTheme.name === 'Neon' ? 'bg-gray-400' : 'bg-gray-500')
            }`}
          />
          <span className="text-sm font-semibold">UPS</span>
          <ChevronDown className="w-4 h-4 opacity-80" />
        </summary>

        <div
          className={`absolute right-0 mt-2 min-w-48 rounded-xl border p-1 shadow-xl z-50 ${
            currentTheme.name === 'Neon'
              ? 'bg-gray-900/95 border-cyan-500/30 text-white'
              : 'bg-white border-gray-200 text-gray-900'
          }`}
        >
          {!isAuthenticated ? (
            <>
              <a
                href={connectHref}
                className={`block w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'hover:bg-white/10'
                    : 'hover:bg-gray-100'
                }`}
              >
                {isLoading ? 'Connecting…' : (children || 'Connect UPS')}
              </a>
              {error ? (
                <div
                  className={`mt-1 px-3 pb-2 text-xs ${
                    currentTheme.name === 'Neon' ? 'text-red-200/90' : 'text-red-700'
                  }`}
                >
                  {error}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleRefresh();
                }}
                disabled={isRefreshing}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
                  currentTheme.name === 'Neon'
                    ? 'hover:bg-white/10'
                    : 'hover:bg-gray-100'
                }`}
              >
                {isRefreshing ? 'Refreshing…' : 'Refresh token'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  currentTheme.name === 'Neon'
                    ? 'text-red-300 hover:bg-white/10'
                    : 'text-red-700 hover:bg-red-50'
                }`}
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
