'use client';

import { useState, useEffect } from 'react';
import { Search, AlertCircle, CheckCircle, Loader2, LogIn, Shield } from 'lucide-react';

const StockXTest = () => {
  const [query, setQuery] = useState('jordan');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [authStatus, setAuthStatus] = useState<'unknown' | 'authenticated' | 'unauthenticated'>('unknown');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [apiTestResults, setApiTestResults] = useState<any>(null);

  useEffect(() => {
    // Check URL params for OAuth callback results
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const error = urlParams.get('error');
    const details = urlParams.get('details');
    const debug = urlParams.get('debug');

    if (success === 'true') {
      setAuthStatus('authenticated');
      setTestResult({
        status: 'success',
        message: 'Successfully authenticated with StockX! 🎉',
        oauthComplete: true
      });
    } else if (error) {
      let errorMessage = `Authentication failed: ${error}`;
      
      // Add specific error explanations
      if (error === 'invalid_state') {
        errorMessage += ' (State parameter validation failed - possible cookie issue)';
      } else if (error === 'token_exchange_failed') {
        errorMessage += ' (Failed to exchange authorization code for access token)';
      } else if (error === 'missing_credentials') {
        errorMessage += ' (Missing StockX API credentials in environment)';
      }
      
      setTestResult({
        status: 'error',
        message: errorMessage,
        errorDetails: details ? decodeURIComponent(details) : undefined,
        debugInfo: debug ? `Debug: ${debug}` : undefined,
        oauthError: true
      });
    }

    // Clean up URL params
    if (success || error) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  const startOAuthFlow = () => {
    // Redirect to StockX OAuth with return URL
    const returnUrl = '/dashboard?section=stockx-test';
    window.location.href = `/api/stockx/auth?returnTo=${encodeURIComponent(returnUrl)}`;
  };

  const testConnection = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stockx/test');
      const data = await response.json();
      setTestResult(data);
      
      if (data.status === 'success') {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
      }
    } catch (error) {
      setTestResult({
        status: 'error',
        message: 'Failed to connect to test endpoint',
        errorDetails: error instanceof Error ? error.message : 'Unknown error'
      });
      setAuthStatus('unauthenticated');
    }
    setLoading(false);
  };

  const searchProducts = async () => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/stockx/search?query=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();
      setResult(data);
      
      if (data.authRequired) {
        setAuthStatus('unauthenticated');
      }
    } catch (error) {
      setResult({
        error: 'Failed to search products',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    setLoading(false);
  };

  const testAPIAccess = async () => {
    setIsLoading(true);
    setError('');
    setApiTestResults(null);
    
    try {
      const response = await fetch('/api/stockx/test');
      const data = await response.json();
      
      if (response.ok) {
        setApiTestResults(data);
      } else {
        setError(data.error || 'Failed to test API access');
      }
    } catch (err) {
      setError('Error testing API access');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const getAuthStatusBadge = () => {
    switch (authStatus) {
      case 'authenticated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-900/20 text-green-300 border border-green-500/30">
            <CheckCircle className="w-3 h-3" />
            Authenticated
          </span>
        );
      case 'unauthenticated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-900/20 text-red-300 border border-red-500/30">
            <AlertCircle className="w-3 h-3" />
            Not Authenticated
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-900/20 text-yellow-300 border border-yellow-500/30">
            <Shield className="w-3 h-3" />
            Unknown
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-100 flex items-center gap-2">
            <Search className="w-6 h-6" />
            StockX API Integration Test
          </h2>
          {getAuthStatusBadge()}
        </div>
        
        {/* OAuth Authentication Section */}
        <div className="mb-6 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <LogIn className="w-5 h-5" />
            OAuth Authentication
          </h3>
          
          {authStatus === 'unauthenticated' ? (
            <div className="space-y-3">
              <p className="text-slate-300 text-sm">
                StockX uses OAuth2 Authorization Code flow. You need to authenticate with your StockX account first.
              </p>
              <button
                onClick={startOAuthFlow}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg hover:from-blue-600 hover:to-purple-600 transition-all"
              >
                <LogIn className="w-4 h-4" />
                Login with StockX
              </button>
            </div>
          ) : authStatus === 'authenticated' ? (
            <div className="space-y-3">
              <p className="text-green-300 text-sm flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Successfully authenticated with StockX!
              </p>
              <button
                onClick={testConnection}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-lg hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Test Connection
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-slate-300 text-sm">
                Check your authentication status with StockX.
              </p>
              <button
                onClick={testConnection}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-lg hover:from-cyan-600 hover:to-emerald-600 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Test Connection
              </button>
            </div>
          )}
        </div>

        {/* Test Results */}
        {testResult && (
          <div className="mb-6 p-4 rounded-lg bg-slate-700/50 border border-slate-600">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(testResult.status)}
              <span className="font-medium text-white">{testResult.message}</span>
            </div>
            
            {testResult.credentials && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Credentials Status:</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>Client ID: {testResult.credentials.clientId}</li>
                  <li>Client Secret: {testResult.credentials.clientSecret}</li>
                  <li>API Key: {testResult.credentials.apiKey}</li>
                </ul>
              </div>
            )}

            {testResult.authTests && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Authentication Tests:</h4>
                <div className="space-y-2">
                  {testResult.authTests.map((test: any, index: number) => (
                    <div key={index} className="text-sm p-2 bg-slate-800/50 rounded border border-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{test.method}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          test.result.includes('SUCCESS') ? 'bg-green-900/20 text-green-300' : 'bg-red-900/20 text-red-300'
                        }`}>
                          {test.result}
                        </span>
                      </div>
                      {test.error && (
                        <div className="mt-1 text-xs text-slate-400">{test.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {testResult.errorDetails && (
              <div className="mt-3 p-3 bg-red-900/20 border border-red-500/30 rounded text-red-200 text-sm">
                <strong>Error:</strong> {testResult.errorDetails}
              </div>
            )}

            {testResult.debugInfo && (
              <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded text-yellow-200 text-sm">
                <strong>Debug Info:</strong> {testResult.debugInfo}
              </div>
            )}

            {testResult.nextSteps && (
              <div className="mt-3">
                <h4 className="text-sm font-medium text-slate-300 mb-2">Next Steps:</h4>
                <ol className="text-sm text-slate-400 space-y-1 list-decimal list-inside">
                  {testResult.nextSteps.map((step: string, index: number) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Search Test - Only show if authenticated */}
        {authStatus === 'authenticated' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-cyan-100 mb-2">
                Search Products
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for sneakers..."
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-700/60 text-white placeholder-slate-300 border border-slate-500/50 focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
                  onKeyPress={(e) => e.key === 'Enter' && searchProducts()}
                />
                <button
                  onClick={searchProducts}
                  disabled={loading || !query.trim()}
                  className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg hover:from-emerald-600 hover:to-cyan-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Search
                </button>
              </div>
            </div>

            {/* Search Results */}
            {result && (
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600">
                <h4 className="font-medium text-white mb-3">Search Results:</h4>
                <pre className="text-sm text-slate-300 overflow-auto max-h-96 bg-slate-800/50 p-3 rounded border">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">StockX API Access Test</h2>
        
        <div className="space-y-4">
          <button
            onClick={testAPIAccess}
            disabled={isLoading}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : 'Test API Access'}
          </button>
          
          {error && (
            <div className="text-red-600 bg-red-50 p-3 rounded">
              {error}
            </div>
          )}
          
          {apiTestResults && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded">
                <h3 className="font-semibold mb-2">Test Summary</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Working Endpoints:</strong> {apiTestResults.summary.workingEndpoints}/{apiTestResults.summary.totalEndpoints}
                  </div>
                  <div>
                    <strong>Basic Access:</strong> {apiTestResults.summary.hasBasicAccess ? '✅ Yes' : '❌ No'}
                  </div>
                  <div>
                    <strong>Catalog Access:</strong> {apiTestResults.summary.hasCatalogAccess ? '✅ Yes' : '❌ No'}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold">Endpoint Test Results:</h3>
                {apiTestResults.results.map((result: any, index: number) => (
                  <div key={index} className={`p-3 rounded border ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <strong>{result.endpoint}</strong>
                        <p className="text-sm text-gray-600">{result.description}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {result.status}
                      </span>
                    </div>
                    {result.error && (
                      <div className="mt-2 text-sm text-red-600">
                        Error: {result.error}
                      </div>
                    )}
                    {result.data && (
                      <details className="mt-2">
                        <summary className="text-sm text-gray-500 cursor-pointer">View Response</summary>
                        <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(result.data, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockXTest; 