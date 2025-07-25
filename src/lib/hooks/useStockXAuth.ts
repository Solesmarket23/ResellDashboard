'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseStockXAuthOptions {
  onAuthError?: () => void;
  onTokenRefreshed?: () => void;
  checkInterval?: number; // How often to check token validity (default: 5 minutes)
  refreshBuffer?: number; // Refresh tokens this many minutes before expiry (default: 10 minutes)
}

export function useStockXAuth({
  onAuthError,
  onTokenRefreshed,
  checkInterval = 5 * 60 * 1000, // 5 minutes
  refreshBuffer = 10 * 60 * 1000  // 10 minutes
}: UseStockXAuthOptions = {}) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastRefreshRef = useRef<Date | null>(null);
  
  const checkAndRefreshToken = useCallback(async () => {
    try {
      console.log('🔍 Checking StockX token status...');
      
      // Check current auth status
      const statusResponse = await fetch('/api/stockx/auth/status');
      const statusData = await statusResponse.json();
      
      // Check if token is expired or needs refresh
      if (!statusData.isAuthenticated || statusData.tokenExpired) {
        console.log('❌ Token invalid or expired, attempting refresh...');
        
        // Only attempt refresh if we have a refresh token
        if (statusData.hasRefreshToken) {
          // Attempt to refresh the token
          const refreshResponse = await fetch('/api/stockx/refresh-token', {
            method: 'POST',
            credentials: 'include' // Important: include cookies
          });
          
          const refreshData = await refreshResponse.json();
          
          if (refreshData.success) {
            console.log('✅ Token refreshed successfully');
            lastRefreshRef.current = new Date();
            onTokenRefreshed?.();
          } else {
            console.error('❌ Token refresh failed:', refreshData.error);
            if (refreshData.needsReauth) {
              onAuthError?.();
            }
          }
        } else {
          console.log('❌ No refresh token available - need to re-authenticate');
          onAuthError?.();
        }
      } else {
        console.log('✅ Token is valid');
      }
    } catch (error) {
      console.error('Error checking/refreshing token:', error);
    }
  }, [onAuthError, onTokenRefreshed]);
  
  const startTokenRefreshInterval = useCallback(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Check immediately
    checkAndRefreshToken();
    
    // Set up periodic checks
    intervalRef.current = setInterval(checkAndRefreshToken, checkInterval);
    
    console.log(`🔄 Started StockX token refresh interval (every ${checkInterval / 1000 / 60} minutes)`);
  }, [checkAndRefreshToken, checkInterval]);
  
  const stopTokenRefreshInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('🛑 Stopped StockX token refresh interval');
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTokenRefreshInterval();
    };
  }, [stopTokenRefreshInterval]);
  
  return {
    startTokenRefreshInterval,
    stopTokenRefreshInterval,
    checkAndRefreshToken,
    lastRefresh: lastRefreshRef.current
  };
}