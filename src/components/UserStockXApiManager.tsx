'use client';

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Save, 
  Trash2, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  AlertTriangle, 
  RefreshCw,
  ExternalLink,
  Shield,
  Settings
} from 'lucide-react';

interface UserStockXApiManagerProps {
  userId: string;
  onKeysUpdated?: (hasKeys: boolean) => void;
}

interface ApiKeyForm {
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export default function UserStockXApiManager({ userId, onKeysUpdated }: UserStockXApiManagerProps) {
  const [formData, setFormData] = useState<ApiKeyForm>({
    apiKey: '',
    clientId: '',
    clientSecret: ''
  });
  const [showSecrets, setShowSecrets] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<{
    hasKeys: boolean;
    isValid: boolean;
    message: string;
    lastTested?: string;
  }>({
    hasKeys: false,
    isValid: false,
    message: 'Checking API key status...'
  });
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  useEffect(() => {
    checkApiKeyStatus();
  }, [userId]);

  const checkApiKeyStatus = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/stockx-keys?userId=${userId}&action=status`);
      const data = await response.json();
      
      if (data.success) {
        setStatus({
          hasKeys: data.status.hasStockXKeys,
          isValid: data.status.isConfigured,
          message: data.status.isConfigured ? 'API keys configured' : 'No API keys found',
          lastTested: data.status.lastUpdated
        });
        onKeysUpdated?.(data.status.isConfigured);
      } else {
        setStatus({
          hasKeys: false,
          isValid: false,
          message: 'Failed to check status'
        });
      }
    } catch (error) {
      console.error('Error checking API key status:', error);
      setStatus({
        hasKeys: false,
        isValid: false,
        message: 'Error checking status'
      });
    }
    setIsLoading(false);
  };

  const testApiKeys = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch(`/api/user/stockx-keys?userId=${userId}&action=test`);
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: data.testResult.isValid,
          message: data.testResult.isValid ? 'API keys are valid!' : data.testResult.error || 'Test failed',
          details: data.testResult.details
        });
        
        if (data.testResult.isValid) {
          setStatus(prev => ({
            ...prev,
            isValid: true,
            message: 'API keys are working correctly',
            lastTested: new Date().toISOString()
          }));
        }
      } else {
        setTestResult({
          success: false,
          message: 'Failed to test API keys'
        });
      }
    } catch (error) {
      console.error('Error testing API keys:', error);
      setTestResult({
        success: false,
        message: 'Error testing API keys'
      });
    }
    setIsTesting(false);
  };

  const saveApiKeys = async () => {
    if (!formData.apiKey.trim()) {
      setTestResult({
        success: false,
        message: 'API key is required'
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/user/stockx-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          apiKey: formData.apiKey.trim(),
          clientId: formData.clientId.trim() || undefined,
          clientSecret: formData.clientSecret.trim() || undefined
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: 'API keys saved successfully!'
        });
        
        // Clear form
        setFormData({
          apiKey: '',
          clientId: '',
          clientSecret: ''
        });
        
        // Update status
        await checkApiKeyStatus();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to save API keys'
        });
      }
    } catch (error) {
      console.error('Error saving API keys:', error);
      setTestResult({
        success: false,
        message: 'Error saving API keys'
      });
    }
    setIsLoading(false);
  };

  const deleteApiKeys = async () => {
    if (!confirm('Are you sure you want to delete your StockX API keys? This action cannot be undone.')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/user/stockx-keys?userId=${userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: 'API keys deleted successfully'
        });
        await checkApiKeyStatus();
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Failed to delete API keys'
        });
      }
    } catch (error) {
      console.error('Error deleting API keys:', error);
      setTestResult({
        success: false,
        message: 'Error deleting API keys'
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Key className="w-6 h-6 text-blue-400" />
        <div>
          <h3 className="text-lg font-semibold text-slate-200">StockX API Configuration</h3>
          <p className="text-sm text-slate-400">
            Configure your own StockX API credentials for personalized access
          </p>
        </div>
      </div>

      {/* Status Display */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status.hasKeys ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
            )}
            <span className="text-slate-300 font-medium">
              {status.message}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkApiKeyStatus}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            {status.hasKeys && (
              <button
                onClick={testApiKeys}
                disabled={isTesting}
                className="px-3 py-1 bg-blue-600/80 hover:bg-blue-600 text-white rounded text-sm transition-colors flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                Test
              </button>
            )}
          </div>
        </div>
        
        {status.lastTested && (
          <p className="text-xs text-slate-500 mt-1">
            Last tested: {new Date(status.lastTested).toLocaleString()}
          </p>
        )}
      </div>

      {/* Test Results */}
      {testResult && (
        <div className={`mb-6 p-4 rounded-lg border ${
          testResult.success 
            ? 'bg-green-900/20 border-green-500/30' 
            : 'bg-red-900/20 border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400" />
            )}
            <span className={testResult.success ? 'text-green-300' : 'text-red-300'}>
              {testResult.message}
            </span>
          </div>
          {testResult.details && (
            <pre className="text-xs text-slate-400 mt-2 bg-slate-900/50 p-2 rounded overflow-x-auto">
              {JSON.stringify(testResult.details, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* API Key Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            StockX API Key *
          </label>
          <div className="relative">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={formData.apiKey}
              onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="Enter your StockX API key"
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Client ID (Optional)
          </label>
          <input
            type="text"
            value={formData.clientId}
            onChange={(e) => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
            placeholder="Enter your StockX Client ID"
            className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Client Secret (Optional)
          </label>
          <div className="relative">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={formData.clientSecret}
              onChange={(e) => setFormData(prev => ({ ...prev, clientSecret: e.target.value }))}
              placeholder="Enter your StockX Client Secret"
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600/50 rounded-lg text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={saveApiKeys}
            disabled={isLoading || !formData.apiKey.trim()}
            className="px-4 py-2 bg-blue-600/80 hover:bg-blue-600 disabled:bg-slate-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {isLoading ? 'Saving...' : 'Save API Keys'}
          </button>

          {status.hasKeys && (
            <button
              onClick={deleteApiKeys}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600/80 hover:bg-red-600 disabled:bg-slate-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Keys
            </button>
          )}
        </div>
      </div>

      {/* Help Information */}
      <div className="mt-6 p-4 bg-slate-900/30 border border-slate-600/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-blue-300 font-medium mb-2">How to Get StockX API Access</h4>
            <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
              <li>Contact StockX to request API access for your application</li>
              <li>You'll need to be a Level 3+ seller to qualify</li>
              <li>Once approved, you'll receive your API credentials</li>
              <li>Enter your credentials above to start using StockX features</li>
            </ol>
            <div className="mt-3">
              <a
                href="https://stockx.com/api"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Learn more about StockX API
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Security Notice */}
      <div className="mt-4 p-3 bg-green-900/20 border border-green-500/20 rounded-lg">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-green-300">
            Your API keys are encrypted and stored securely. Only you can access your credentials.
          </p>
        </div>
      </div>
    </div>
  );
} 