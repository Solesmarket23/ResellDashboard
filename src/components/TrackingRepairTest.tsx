'use client';

import { useState } from 'react';
import { db } from '../lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const TrackingRepairTest = () => {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<any>(null);

  const testConnection = async () => {
    setTesting(true);
    setStatus('Testing Firebase connection...');
    setResult(null);

    try {
      // Test 0: Check if Firebase is initialized
      if (!db) {
        throw new Error('Firebase database not initialized. Please check your Firebase configuration and environment variables.');
      }
      
      // Test 1: Basic connection
      setStatus('Testing basic Firebase connection...');
      const testCollection = collection(db, 'purchases');
      console.log('Firebase collection reference created');

      // Test 2: Simple query - try different approaches
      setStatus('Testing simple query...');
      
      // Try 1: Query for empty tracking number
      let querySnapshot;
      try {
        const q1 = query(collection(db, 'purchases'), where('trackingNumber', '==', ''));
        console.log('Query 1 created (empty string)');
        querySnapshot = await getDocs(q1);
        console.log('Query 1 executed successfully');
      } catch (error) {
        console.log('Query 1 failed, trying alternative:', error.message);
        
        // Try 2: Query for null tracking number
        try {
          const q2 = query(collection(db, 'purchases'), where('trackingNumber', '==', null));
          console.log('Query 2 created (null)');
          querySnapshot = await getDocs(q2);
          console.log('Query 2 executed successfully');
        } catch (error2) {
          console.log('Query 2 failed, trying alternative:', error2.message);
          
          // Try 3: Get all purchases and filter client-side
          try {
            const q3 = query(collection(db, 'purchases'));
            console.log('Query 3 created (all purchases)');
            querySnapshot = await getDocs(q3);
            console.log('Query 3 executed successfully');
          } catch (error3) {
            throw new Error(`All query approaches failed. Query 1: ${error.message}, Query 2: ${error2.message}, Query 3: ${error3.message}`);
          }
        }
      }
      
      console.log('Query snapshot size:', querySnapshot.size);

      // Test 4: Process results
      setStatus('Processing results...');
      const allOrders = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter for orders without tracking numbers (in case we got all orders)
      const ordersWithoutTracking = allOrders.filter(order => 
        !order.trackingNumber || order.trackingNumber === '' || order.trackingNumber === null
      );

      setStatus('✅ All tests passed!');
      setResult({
        success: true,
        message: 'Firebase connection and queries working',
        totalOrders: allOrders.length,
        ordersWithoutTracking: ordersWithoutTracking.length,
        sampleOrder: ordersWithoutTracking[0] || allOrders[0] || 'No orders found',
        trackingNumberFields: allOrders.slice(0, 3).map(order => ({
          id: order.id,
          trackingNumber: order.trackingNumber,
          hasTrackingNumber: !!order.trackingNumber
        })),
        allOrderFields: allOrders.length > 0 ? Object.keys(allOrders[0]) : [],
        sampleOrderData: allOrders[0] || null
      });

    } catch (error) {
      console.error('Test failed:', error);
      setStatus(`❌ Test failed: ${error.message}`);
      setResult({
        success: false,
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-yellow-800 mb-2">
        🧪 Tracking Repair Test
      </h3>
      <p className="text-sm text-yellow-700 mb-3">
        This will test the Firebase connection and basic queries to identify the issue.
      </p>
      
      <div className="mb-3">
        <button
          onClick={testConnection}
          disabled={testing}
          className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white px-4 py-2 rounded text-sm font-medium"
        >
          {testing ? 'Testing...' : 'Run Connection Test'}
        </button>
      </div>

      {status && (
        <div className="text-sm text-gray-700 mb-2">
          <strong>Status:</strong> {status}
        </div>
      )}

      {result && (
        <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
          <pre className="whitespace-pre-wrap text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TrackingRepairTest;
