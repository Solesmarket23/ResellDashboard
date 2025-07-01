'use client';

import { useState } from 'react';
import { db } from '../lib/firebase/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

// All the tracking fixes we identified
const TRACKING_FIXES = [
  {
    orderNumber: '01-95H9NC36ST',
    currentTracking: '252525252525253',
    correctTracking: '1Z24WA430206362750',
    productName: 'Nike Air Jordan 1 Retro',
    reason: 'User-reported UPS tracking issue'
  },
  {
    orderNumber: '01-B56RWN58RD', 
    currentTracking: '882268115454',
    correctTracking: '1Z24WA430227721340',
    productName: 'Yeezy Boost 350',
    reason: 'Discovered UPS tracking not extracted correctly'
  }
];

const QuickTrackingFix = () => {
  const [fixing, setFixing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<any[]>([]);

  const fixAllTracking = async () => {
    setFixing(true);
    setStatus('Starting bulk tracking fix...');
    setResults([]);
    
    const fixResults = [];

    try {
      for (const fix of TRACKING_FIXES) {
        setStatus(`Processing ${fix.orderNumber}...`);
        
        try {
          // Find the order in Firestore
          const purchasesRef = collection(db, 'purchases');
          const q = query(purchasesRef, where('orderNumber', '==', fix.orderNumber));
          const querySnapshot = await getDocs(q);
          
          if (querySnapshot.empty) {
            fixResults.push({
              orderNumber: fix.orderNumber,
              status: '❌ Not found in database',
              success: false
            });
            continue;
          }
          
          // Update the tracking number
          const orderDoc = querySnapshot.docs[0];
          const orderRef = doc(db, 'purchases', orderDoc.id);
          
          await updateDoc(orderRef, {
            tracking: fix.correctTracking,
            trackingNumber: fix.correctTracking,
            lastUpdated: new Date().toISOString(),
            fixedBy: 'bulk-tracking-fix'
          });
          
          fixResults.push({
            orderNumber: fix.orderNumber,
            productName: fix.productName,
            oldTracking: fix.currentTracking,
            newTracking: fix.correctTracking,
            status: '✅ Updated successfully',
            success: true
          });
          
        } catch (error) {
          fixResults.push({
            orderNumber: fix.orderNumber,
            status: `❌ Error: ${error.message}`,
            success: false
          });
        }
      }
      
      setResults(fixResults);
      const successCount = fixResults.filter(r => r.success).length;
      setStatus(`🎉 Completed! ${successCount}/${TRACKING_FIXES.length} orders fixed`);
      
      // Refresh the page after a delay
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (error) {
      console.error('Error fixing tracking:', error);
      setStatus(`❌ Bulk fix error: ${error.message}`);
    } finally {
      setFixing(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-yellow-800 mb-2">
        🔧 Bulk Tracking Fix
      </h3>
      <p className="text-yellow-700 mb-3">
        Fix all {TRACKING_FIXES.length} orders with incorrect UPS tracking numbers
      </p>
      
      {/* Orders to fix */}
      <div className="bg-white rounded p-3 mb-3 text-sm">
        <h4 className="font-medium text-gray-800 mb-2">Orders to fix:</h4>
        {TRACKING_FIXES.map((fix, index) => (
          <div key={fix.orderNumber} className="mb-2 pl-2 border-l-2 border-gray-200">
            <div className="font-medium text-gray-700">{fix.orderNumber} - {fix.productName}</div>
            <div className="text-gray-600 text-xs">
              {fix.currentTracking} → {fix.correctTracking}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex items-center space-x-3 mb-3">
        <button
          onClick={fixAllTracking}
          disabled={fixing}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {fixing ? 'Fixing All Orders...' : `Fix All ${TRACKING_FIXES.length} Orders`}
        </button>
        {status && (
          <span className="text-sm text-gray-700">{status}</span>
        )}
      </div>
      
      {/* Results */}
      {results.length > 0 && (
        <div className="bg-white rounded p-3 text-sm">
          <h4 className="font-medium text-gray-800 mb-2">Results:</h4>
          {results.map((result, index) => (
            <div key={result.orderNumber} className="mb-1 flex items-center justify-between">
              <span className="font-medium">{result.orderNumber}</span>
              <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                {result.status}
              </span>
            </div>
          ))}
        </div>
      )}
      
      <div className="mt-2 text-xs text-yellow-600">
        This will update all orders found by our analysis with correct UPS tracking numbers.
      </div>
    </div>
  );
};

export default QuickTrackingFix; 