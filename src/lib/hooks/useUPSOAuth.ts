import { useState, useEffect } from 'react';

interface UPSOAuthStatus {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  tokenInfo?: {
    accessToken: string;
    expiresAt: number;
    scope: string;
  };
}

export function useUPSOAuth(): UPSOAuthStatus {
  const [status, setStatus] = useState<UPSOAuthStatus>({
    isAuthenticated: false,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    checkOAuthStatus();
  }, []);

  const checkOAuthStatus = async () => {
    try {
      setStatus(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Check if we have OAuth credentials configured
      const response = await fetch('/api/ups/oauth/test-flow');
      const data = await response.json();
      
      if (data.success) {
        // Check if we have a valid token (this would require storing tokens)
        // For now, just check if OAuth is configured
        setStatus({
          isAuthenticated: true,
          isLoading: false,
          error: null,
          tokenInfo: {
            accessToken: 'Configured',
            expiresAt: Date.now() + 3600000, // 1 hour from now
            scope: data.config.scope
          }
        });
      } else {
        setStatus({
          isAuthenticated: false,
          isLoading: false,
          error: data.error || 'UPS OAuth not configured'
        });
      }
    } catch (error) {
      setStatus({
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  return status;
}