'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function UPSOAuthSuccessContent() {
  const searchParams = useSearchParams();
  const [tokenInfo, setTokenInfo] = useState<any>(null);

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const expiresIn = searchParams.get('expires_in');
    const scope = searchParams.get('scope');

    if (accessToken) {
      setTokenInfo({
        access_token: accessToken,
        expires_in: expiresIn,
        scope: scope
      });
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            OAuth Success!
          </h1>
          <p className="text-gray-600 mb-6">
            You have successfully authenticated with UPS
          </p>
        </div>

        {tokenInfo && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <h3 className="text-sm font-medium text-green-800 mb-2">Token Information:</h3>
            <div className="text-xs text-green-700 space-y-1">
              <p><strong>Access Token:</strong> {tokenInfo.access_token}</p>
              <p><strong>Expires In:</strong> {tokenInfo.expires_in} seconds</p>
              <p><strong>Scope:</strong> {tokenInfo.scope}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.href = '/ups-oauth-demo'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Start New OAuth Flow
          </button>
          
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          <p><strong>Next Steps:</strong></p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Use the access token to make UPS API calls</li>
            <li>Store the token securely for future use</li>
            <li>Use the refresh token when the access token expires</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function UPSOAuthSuccess() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <UPSOAuthSuccessContent />
    </Suspense>
  );
}