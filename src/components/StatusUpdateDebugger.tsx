'use client';

import { useState } from 'react';
import { Bug, Check, X, AlertCircle } from 'lucide-react';

interface StatusUpdateDebuggerProps {
  orderNumbers: string[];
}

const StatusUpdateDebugger = ({ orderNumbers }: StatusUpdateDebuggerProps) => {
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [debugResults, setDebugResults] = useState<any>(null);

  const runDebugger = async () => {
    setIsDebugging(true);
    setDebugLog([]);
    setDebugResults(null);

    const log = (message: string) => {
      console.log(message);
      setDebugLog(prev => [...prev, message]);
    };

    try {
      log('🐛 STATUS UPDATE DEBUGGER STARTED');
      log(`📋 Testing orders: ${orderNumbers.join(', ')}`);
      
      // Test 1: Check Gmail connection
      log('🔐 Testing Gmail connection...');
      const cookieTest = document.cookie.includes('gmail_access_token');
      log(cookieTest ? '✅ Gmail access token found in cookies' : '❌ Gmail access token NOT found');

      // Test 2: Call the status update endpoint
      log('📡 Calling /api/gmail/update-status...');
      const response = await fetch('/api/gmail/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      const data = await response.json();
      
      log(`📊 Response status: ${response.status}`);
      log(`📊 Response data: ${JSON.stringify(data, null, 2)}`);
      
      setDebugResults(data);

      if (data.success) {
        log(`✅ Success! Updated ${data.summary.updated}/${data.summary.requested} orders`);
        log(`📧 Found ${data.summary.statusEmails} status emails total`);
        
        if (data.updatedOrders && data.updatedOrders.length > 0) {
          log('📦 Updated orders:');
          data.updatedOrders.forEach((order: any) => {
            log(`  - ${order.orderNumber}: ${order.status} (from: "${order.subject}")`);
          });
        } else {
          log('⚠️ No orders were updated - possible issues:');
          log('  1. The delivery emails might not match the search query');
          log('  2. The order numbers might not be in the email subjects');
          log('  3. The emails might have different order number formats');
        }

        // Check which orders weren't updated
        const updatedOrderNumbers = data.updatedOrders.map((o: any) => o.orderNumber);
        const notUpdated = orderNumbers.filter(on => !updatedOrderNumbers.includes(on));
        if (notUpdated.length > 0) {
          log(`❌ Orders NOT updated: ${notUpdated.join(', ')}`);
          log('💡 Debugging tips for these orders:');
          log('  - Check if the delivery emails exist in Gmail');
          log('  - Verify the order numbers match exactly');
          log('  - Look for emoji prefixes in subject lines');
        }
      } else {
        log(`❌ Error: ${data.error}`);
        if (data.details) {
          log(`📝 Details: ${data.details}`);
        }
      }

      // Test 3: Direct Gmail API test
      log('🔍 Testing direct Gmail search...');
      const testQuery = 'from:noreply@stockx.com subject:"Delivered" after:2024/1/1';
      log(`📧 Search query: ${testQuery}`);
      
      // Note: This would require a separate endpoint, but shows what to check

    } catch (error) {
      log(`❌ Error during debugging: ${error}`);
    } finally {
      setIsDebugging(false);
      log('🏁 DEBUG SESSION COMPLETE');
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Bug className="w-5 h-5" />
          Status Update Debugger
        </h3>
        <button
          onClick={runDebugger}
          disabled={isDebugging}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-all"
        >
          {isDebugging ? 'Debugging...' : 'Run Debugger'}
        </button>
      </div>

      {debugLog.length > 0 && (
        <div className="bg-black/50 rounded p-3 font-mono text-xs overflow-auto max-h-96">
          {debugLog.map((log, index) => (
            <div 
              key={index} 
              className={`py-1 ${
                log.includes('✅') ? 'text-green-400' : 
                log.includes('❌') ? 'text-red-400' : 
                log.includes('⚠️') ? 'text-yellow-400' :
                log.includes('💡') ? 'text-blue-400' :
                'text-gray-300'
              }`}
            >
              {log}
            </div>
          ))}
        </div>
      )}

      {debugResults && (
        <div className="mt-4 p-3 bg-gray-900 rounded">
          <h4 className="text-sm font-semibold text-white mb-2">Debug Results:</h4>
          <pre className="text-xs text-gray-300 overflow-auto">
            {JSON.stringify(debugResults, null, 2)}
          </pre>
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded">
        <h4 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Browser Console Instructions:
        </h4>
        <ol className="text-xs text-blue-300 space-y-1 list-decimal list-inside">
          <li>Press F12 to open Developer Tools</li>
          <li>Click on the "Console" tab</li>
          <li>Click "Run Debugger" above</li>
          <li>Look for messages starting with 🐛, 📧, ✅, or ❌</li>
          <li>Check the Network tab for the /api/gmail/update-status request</li>
          <li>Copy any error messages you see</li>
        </ol>
      </div>
    </div>
  );
};

export default StatusUpdateDebugger;