'use client';

import { useState, useEffect } from 'react';

const GmailConnectionDebugger = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isDebugging, setIsDebugging] = useState(false);

  const runDebug = async () => {
    setIsDebugging(true);
    setDebugInfo(null);

    try {
      console.log('🔍 Starting Gmail connection debug...');
      
      // Check client-side cookies
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      console.log('🍪 Client-side cookies:', cookies);

      // Check server-side status
      const response = await fetch('/api/gmail/status');
      const serverStatus = await response.json();
      console.log('📡 Server status:', serverStatus);

      // Check if purchases exist in Firebase
      const purchasesResponse = await fetch('/api/gmail/purchases');
      const purchasesData = await purchasesResponse.json();
      console.log('📦 Purchases data:', purchasesData);

      setDebugInfo({
        clientCookies: cookies,
        serverStatus,
        purchasesCount: purchasesData.purchases?.length || 0,
        purchasesData: purchasesData.purchases?.slice(0, 3) || [],
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Debug failed:', error);
      setDebugInfo({
        error: error.message,
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsDebugging(false);
    }
  };

  useEffect(() => {
    // Auto-run debug on mount
    runDebug();
  }, []);

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-purple-800 mb-2">
        🔍 Gmail Connection Debugger
      </h3>
      <p className="text-sm text-purple-700 mb-3">
        This will help diagnose why Gmail disconnects on refresh and purchases disappear.
      </p>
      
      <div className="mb-3">
        <button
          onClick={runDebug}
          disabled={isDebugging}
          className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white px-4 py-2 rounded text-sm font-medium"
        >
          {isDebugging ? 'Debugging...' : 'Run Debug'}
        </button>
      </div>

      {debugInfo && (
        <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
          <h4 className="font-semibold mb-2">Debug Results:</h4>
          <div className="space-y-2">
            <div>
              <strong>Client Cookies:</strong>
              <div className="ml-2 text-xs">
                {Object.entries(debugInfo.clientCookies || {}).map(([key, value]) => (
                  <div key={key}>
                    {key}: {value ? '✅ Set' : '❌ Missing'}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <strong>Server Status:</strong>
              <div className="ml-2 text-xs">
                Connected: {debugInfo.serverStatus?.connected ? '✅ Yes' : '❌ No'}
                {debugInfo.serverStatus?.reason && (
                  <div>Reason: {debugInfo.serverStatus.reason}</div>
                )}
              </div>
            </div>
            
            <div>
              <strong>Purchases:</strong>
              <div className="ml-2 text-xs">
                Count: {debugInfo.purchasesCount}
                {debugInfo.purchasesData?.length > 0 && (
                  <div>Sample: {JSON.stringify(debugInfo.purchasesData[0], null, 2)}</div>
                )}
              </div>
            </div>
          </div>
          
          <details className="mt-2">
            <summary className="cursor-pointer font-medium">Full Debug Data</summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
};

export default GmailConnectionDebugger;
