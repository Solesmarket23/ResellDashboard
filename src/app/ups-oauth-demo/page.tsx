'use client';

import { useState } from 'react';

export default function UPSOAuthDemo() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const initiateOAuth = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/ups/oauth/initiate');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to initiate OAuth');
      }

      setResult(data);
      
      // Redirect to UPS authorization page
      window.location.href = data.authorization_url;
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            UPS OAuth Demo
          </h1>
          <p className="text-gray-600 mb-6">
            Test the UPS OAuth Authorization Code flow with PKCE
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={initiateOAuth}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? 'Initiating OAuth...' : 'Start UPS OAuth Flow'}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-green-800 text-sm mb-2">
                <strong>OAuth initiated successfully!</strong>
              </p>
              <div className="text-xs text-green-700 space-y-1">
                <p><strong>Client ID:</strong> {result.client_id}</p>
                <p><strong>Redirect URI:</strong> {result.redirect_uri}</p>
                <p><strong>Scope:</strong> {result.scope}</p>
                <p><strong>State:</strong> {result.state}</p>
                <p><strong>Code Verifier:</strong> {result.code_verifier.substring(0, 10)}...</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-gray-500">
          <p><strong>Note:</strong> This will redirect you to UPS for authentication.</p>
          <p>After successful authentication, you'll be redirected back to the callback URL.</p>
        </div>
      </div>
    </div>
  );
}
