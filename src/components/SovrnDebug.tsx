'use client';

import React, { useEffect, useState } from 'react';
import { useSovrn } from '@/lib/hooks/useSovrn';

export default function SovrnDebug() {
  const { isInitialized } = useSovrn();
  const [serverEnvCheck, setServerEnvCheck] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check server-side environment variables
    fetch('/api/debug/env-check')
      .then(res => res.json())
      .then(data => {
        setServerEnvCheck(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to check server env:', err);
        setLoading(false);
      });
  }, []);

  // Client-side environment check
  const clientEnvCheck = {
    NEXT_PUBLIC_SOVRN_API_KEY: process.env.NEXT_PUBLIC_SOVRN_API_KEY,
    NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION: process.env.NEXT_PUBLIC_SOVRN_ENABLE_OPTIMIZATION,
    // Check if any NEXT_PUBLIC vars are available
    anyPublicVars: Object.keys(process.env).filter(key => key.startsWith('NEXT_PUBLIC_')).length,
    // Check a known working env var
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'EXISTS' : 'NOT_FOUND',
  };

  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold mb-4">Sovrn Environment Debug</h3>
      
      <div className="space-y-4">
        <div>
          <h4 className="font-medium mb-2">Client-Side Check:</h4>
          <pre className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs overflow-auto">
            {JSON.stringify(clientEnvCheck, null, 2)}
          </pre>
          <p className="text-sm mt-2">
            Sovrn Hook Initialized: <span className={isInitialized ? 'text-green-600' : 'text-red-600'}>
              {isInitialized ? 'Yes' : 'No'}
            </span>
          </p>
        </div>

        {loading ? (
          <p>Loading server check...</p>
        ) : (
          <div>
            <h4 className="font-medium mb-2">Server-Side Check:</h4>
            <pre className="bg-gray-200 dark:bg-gray-700 p-2 rounded text-xs overflow-auto">
              {JSON.stringify(serverEnvCheck, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-900 rounded">
          <h4 className="font-medium mb-2">Troubleshooting Steps:</h4>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Ensure NEXT_PUBLIC_SOVRN_API_KEY is added to Vercel Environment Variables</li>
            <li>Make sure to redeploy after adding environment variables</li>
            <li>Environment variables must start with NEXT_PUBLIC_ to be available client-side</li>
            <li>Check that there are no typos in the variable names</li>
            <li>Verify the variables are added to the correct environment (Production)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}