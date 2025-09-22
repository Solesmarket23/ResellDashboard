'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function UPSOAuthError() {
  const searchParams = useSearchParams();
  const [errorInfo, setErrorInfo] = useState<any>(null);

  useEffect(() => {
    const error = searchParams.get('error');
    const description = searchParams.get('description');

    if (error) {
      setErrorInfo({
        error,
        description: description || 'Unknown error occurred'
      });
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            OAuth Error
          </h1>
          <p className="text-gray-600 mb-6">
            There was a problem with the UPS OAuth authentication
          </p>
        </div>

        {errorInfo && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <h3 className="text-sm font-medium text-red-800 mb-2">Error Details:</h3>
            <div className="text-xs text-red-700 space-y-1">
              <p><strong>Error Code:</strong> {errorInfo.error}</p>
              <p><strong>Description:</strong> {errorInfo.description}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.href = '/ups-oauth-demo'}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Try Again
          </button>
          
          <button
            onClick={() => window.location.href = '/'}
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            Go to Dashboard
          </button>
        </div>

        <div className="mt-6 text-xs text-gray-500">
          <p><strong>Common Issues:</strong></p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Check your UPS OAuth client ID and redirect URI</li>
            <li>Ensure your redirect URI matches exactly in UPS developer console</li>
            <li>Verify your OAuth application is properly configured</li>
            <li>Check that you have the required scopes enabled</li>
          </ul>
        </div>
      </div>
    </div>
  );
}