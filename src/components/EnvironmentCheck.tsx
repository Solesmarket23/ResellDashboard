'use client';

import { useState, useEffect } from 'react';

const EnvironmentCheck = () => {
  const [envStatus, setEnvStatus] = useState<any>(null);

  useEffect(() => {
    const checkEnvironment = () => {
      const envVars = {
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      };

      const hasValidConfig = envVars.NEXT_PUBLIC_FIREBASE_API_KEY && 
                            envVars.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

      setEnvStatus({
        hasValidConfig,
        envVars,
        isClientSide: typeof window !== 'undefined',
        nodeEnv: process.env.NODE_ENV
      });
    };

    checkEnvironment();
  }, []);

  if (!envStatus) {
    return <div>Loading environment check...</div>;
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-red-800 mb-2">
        🔍 Environment Check
      </h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Firebase Config Valid:</strong> 
          <span className={`ml-2 px-2 py-1 rounded text-xs ${envStatus.hasValidConfig ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {envStatus.hasValidConfig ? '✅ Yes' : '❌ No'}
          </span>
        </div>
        
        <div>
          <strong>Client Side:</strong> 
          <span className={`ml-2 px-2 py-1 rounded text-xs ${envStatus.isClientSide ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {envStatus.isClientSide ? '✅ Yes' : '❌ No'}
          </span>
        </div>
        
        <div>
          <strong>Node Environment:</strong> 
          <span className="ml-2 px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
            {envStatus.nodeEnv}
          </span>
        </div>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer font-medium text-sm">Environment Variables</summary>
        <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(envStatus.envVars, null, 2)}
          </pre>
        </div>
      </details>

      {!envStatus.hasValidConfig && (
        <div className="mt-3 p-2 bg-yellow-100 border border-yellow-300 rounded text-sm">
          <strong>⚠️ Issue Found:</strong> Firebase environment variables are not properly configured. 
          Please check your <code>.env.local</code> file and ensure all required Firebase environment variables are set.
        </div>
      )}
    </div>
  );
};

export default EnvironmentCheck;
