// Alias API Connection Component
'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, ExternalLink, Search, TrendingUp, Package } from 'lucide-react';
import { useAliasApi } from '../lib/hooks/useAliasApi';
import { useTheme } from '../lib/contexts/ThemeContext';

interface AliasConnectorProps {
  className?: string;
  onConnectionChange?: (connected: boolean) => void;
}

const AliasConnector: React.FC<AliasConnectorProps> = ({ 
  className = '', 
  onConnectionChange 
}) => {
  const { currentTheme } = useTheme();
  const { status, testConnection } = useAliasApi();
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await testConnection();
      onConnectionChange?.(status.isConnected);
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusIcon = () => {
    if (status.isLoading || isTesting) {
      return <RefreshCw className="w-4 h-4 animate-spin" />;
    }
    if (status.isConnected) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    return <XCircle className="w-4 h-4 text-red-500" />;
  };

  const getStatusText = () => {
    if (status.isLoading || isTesting) {
      return 'Testing Connection...';
    }
    if (status.isConnected) {
      return 'Alias Connected';
    }
    return 'Alias Not Connected';
  };

  const getStatusColor = () => {
    if (status.isLoading || isTesting) {
      return 'text-yellow-600';
    }
    if (status.isConnected) {
      return 'text-green-600';
    }
    return 'text-red-600';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      <div className={`p-4 rounded-lg border ${
        currentTheme.name === 'Neon' 
          ? 'bg-gray-900/50 border-gray-700' 
          : 'bg-white border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {getStatusText()}
              </span>
            </div>
            {status.isConnected && (
              <span className="text-xs text-gray-500">
                v{status.version}
              </span>
            )}
          </div>
          
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              currentTheme.name === 'Neon'
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50'
                : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'
            }`}
          >
            {isTesting ? 'Testing...' : 'Test'}
          </button>
        </div>

        {status.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {status.error}
          </div>
        )}
      </div>

      {/* API Features Preview */}
      {status.isConnected && (
        <div className={`p-4 rounded-lg border ${
          currentTheme.name === 'Neon' 
            ? 'bg-gray-900/50 border-gray-700' 
            : 'bg-white border-gray-200'
        }`}>
          <h3 className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-3`}>
            Available Features
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-gray-600">Catalog Search</span>
            </div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-600">Pricing Insights</span>
            </div>
            <div className="flex items-center space-x-2">
              <Package className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-gray-600">Order Management</span>
            </div>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      {!status.isConnected && !status.isLoading && (
        <div className={`p-4 rounded-lg border ${
          currentTheme.name === 'Neon' 
            ? 'bg-gray-900/50 border-gray-700' 
            : 'bg-white border-gray-200'
        }`}>
          <h3 className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-2`}>
            Setup Required
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            To use Alias API features, you need to configure your bearer token.
          </p>
          <div className="space-y-2">
            <div className="text-xs text-gray-500">
              1. Get your bearer token from{' '}
              <a 
                href="https://api.alias.org" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center space-x-1"
              >
                <span>api.alias.org</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-xs text-gray-500">
              2. Add <code className="bg-gray-100 px-1 rounded">ALIAS_BEARER_TOKEN</code> to your <code className="bg-gray-100 px-1 rounded">.env.local</code> file
            </div>
            <div className="text-xs text-gray-500">
              3. Restart your development server
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AliasConnector;
