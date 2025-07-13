'use client';

import { useState } from 'react';
import { useTheme } from '../../lib/contexts/ThemeContext';

export default function DebugStatusPage() {
  const { currentTheme } = useTheme();
  const [debugOutput, setDebugOutput] = useState<string[]>([]);
  const [isDebugging, setIsDebugging] = useState(false);
  
  // The problematic order numbers
  const testOrders = ['01-95H9NC36ST', '01-47MDU2T9C5', '01-3KF7CE560J'];

  const runDebug = async () => {
    setIsDebugging(true);
    setDebugOutput([]);
    const log = (msg: string) => {
      console.log(msg);
      setDebugOutput(prev => [...prev, msg]);
    };

    try {
      log('🐛 DEBUG SESSION STARTED');
      log('📋 Testing orders: ' + testOrders.join(', '));
      
      // Test 1: Check Gmail connection
      log('\n🔐 Testing Gmail connection...');
      const cookieCheck = document.cookie.includes('gmail_access_token');
      log(cookieCheck ? '✅ Gmail token found in cookies' : '❌ Gmail token NOT found');

      // Test 2: Debug status update endpoint
      log('\n📡 Calling debug status update endpoint...');
      const debugResponse = await fetch('/api/gmail/debug-status-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumbers: testOrders })
      });
      
      const debugData = await debugResponse.json();
      log('📊 Debug response received');
      
      if (debugData.success) {
        log('\n🔍 Debug Results:');
        debugData.debugResults.forEach((result: any, index: number) => {
          if (result.query) {
            log(`\n  Query ${index + 1}: "${result.query}"`);
            if (result.emailId) {
              log(`    ✅ Found email: "${result.subject}"`);
              log(`    📦 Order: ${result.orderNumber || 'NOT EXTRACTED'}`);
              log(`    🎯 Matches requested: ${result.matchesRequestedOrders ? 'YES' : 'NO'}`);
            } else if (result.error) {
              log(`    ❌ Error: ${result.error}`);
            }
          } else if (result.orderNumberSearch) {
            log(`\n  📦 Order search for: ${result.orderNumberSearch}`);
            log(`    📧 Emails found: ${result.emailsFound}`);
            if (result.emails && result.emails.length > 0) {
              result.emails.forEach((email: any) => {
                log(`    - "${email.subject}"`);
                log(`      Delivery email: ${email.isDeliveryEmail ? 'YES' : 'NO'}`);
                log(`      Has emoji: ${email.hasEmoji ? 'YES' : 'NO'}`);
              });
            }
          }
        });
      } else {
        log('❌ Debug failed: ' + debugData.error);
      }

      // Test 3: Regular status update
      log('\n\n📡 Testing regular status update...');
      const statusResponse = await fetch('/api/gmail/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumbers: testOrders })
      });
      
      const statusData = await statusResponse.json();
      log('📊 Status update response received');
      
      if (statusData.success) {
        log(`✅ Updated ${statusData.summary.updated}/${statusData.summary.requested} orders`);
        log(`📧 Found ${statusData.summary.statusEmails} status emails total`);
        
        if (statusData.updatedOrders && statusData.updatedOrders.length > 0) {
          log('\n📦 Updated orders:');
          statusData.updatedOrders.forEach((order: any) => {
            log(`  - ${order.orderNumber}: ${order.status}`);
            log(`    From: "${order.subject}"`);
          });
        } else {
          log('\n⚠️ No orders were updated!');
        }
      } else {
        log('❌ Status update failed: ' + statusData.error);
      }

      // Test 4: Direct email search test
      log('\n\n🔍 Recommendations:');
      log('1. Check Gmail directly for these order numbers');
      log('2. Look for emails with subjects like:');
      log('   - "🎉 Xpress Ship Order Delivered: #01-3KF7CE560J"');
      log('   - "Xpress Ship Order Delivered: #01-3KF7CE560J"');
      log('3. Verify the order numbers in the emails match exactly');
      log('4. Check if the emails are in Spam or other folders');

    } catch (error) {
      log('❌ Error during debug: ' + error);
    } finally {
      setIsDebugging(false);
      log('\n🏁 DEBUG SESSION COMPLETE');
    }
  };

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} p-8`}>
      <div className="max-w-4xl mx-auto">
        <h1 className={`text-3xl font-bold ${currentTheme.colors.textPrimary} mb-6`}>
          Status Update Debugger
        </h1>
        
        <div className={`${currentTheme.colors.card} rounded-lg p-6 mb-6`}>
          <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
            Debug Information
          </h2>
          <p className={`${currentTheme.colors.textSecondary} mb-4`}>
            This tool will help debug why the status update isn't working for orders:
          </p>
          <ul className={`list-disc list-inside ${currentTheme.colors.textSecondary} mb-6`}>
            {testOrders.map(order => (
              <li key={order}>{order}</li>
            ))}
          </ul>
          
          <button
            onClick={runDebug}
            disabled={isDebugging}
            className={`${
              currentTheme.name === 'Neon'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                : 'bg-blue-600 hover:bg-blue-700'
            } text-white px-6 py-3 rounded-lg font-medium transition-all disabled:opacity-50`}
          >
            {isDebugging ? 'Debugging...' : 'Run Debug Test'}
          </button>
        </div>

        {debugOutput.length > 0 && (
          <div className={`${currentTheme.colors.card} rounded-lg p-6`}>
            <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
              Debug Output
            </h2>
            <div className="bg-black/50 rounded p-4 font-mono text-sm overflow-auto max-h-96">
              {debugOutput.map((line, index) => (
                <div
                  key={index}
                  className={`${
                    line.includes('✅') ? 'text-green-400' :
                    line.includes('❌') ? 'text-red-400' :
                    line.includes('⚠️') ? 'text-yellow-400' :
                    line.includes('🔍') || line.includes('📋') || line.includes('📡') ? 'text-blue-400' :
                    'text-gray-300'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`${currentTheme.colors.card} rounded-lg p-6 mt-6`}>
          <h2 className={`text-xl font-semibold ${currentTheme.colors.textPrimary} mb-4`}>
            Browser Console Instructions
          </h2>
          <ol className={`list-decimal list-inside ${currentTheme.colors.textSecondary} space-y-2`}>
            <li>Press F12 to open Developer Tools</li>
            <li>Click on the "Console" tab</li>
            <li>Click "Run Debug Test" above</li>
            <li>Look for detailed messages in the console</li>
            <li>Check the Network tab for API calls to /api/gmail/update-status</li>
            <li>Copy any error messages you see</li>
          </ol>
        </div>
      </div>
    </div>
  );
}