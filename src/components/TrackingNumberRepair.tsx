'use client';

import { useState } from 'react';
import { db } from '../lib/firebase/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit } from 'firebase/firestore';

const TrackingNumberRepair = () => {
  const [repairing, setRepairing] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState<any>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Enhanced tracking patterns (same as in the API)
  const trackingPatterns = [
    { 
      name: 'UPS Tracking', 
      regex: /(1Z[0-9A-Z]{16})/gi,
      priority: 1,
      validator: (match: string) => /^1Z[0-9A-Z]{16}$/i.test(match)
    },
    { 
      name: 'FedEx URL Tracking', 
      regex: /fedex\.com.*tracknumbers[=%3D]([0-9]{12,15})/gi,
      priority: 1,
      validator: (match: string) => /^[0-9]{12,15}$/.test(match) && !isExcludedNumber(match)
    },
    { 
      name: 'FedEx URL Encoded', 
      regex: /tracknumbers%3D([0-9]{12,15})/gi,
      priority: 1,
      validator: (match: string) => /^[0-9]{12,15}$/.test(match) && !isExcludedNumber(match)
    },
    { 
      name: 'FedEx Standard', 
      regex: /(?:tracking.*?|number.*?)([0-9]{12})\b/gi,
      priority: 2,
      validator: (match: string) => /^[0-9]{12}$/.test(match) && !isExcludedNumber(match)
    },
    { 
      name: 'FedEx Express', 
      regex: /(?:tracking.*?|number.*?)([0-9]{14})\b/gi,
      priority: 2,
      validator: (match: string) => /^[0-9]{14}$/.test(match) && !isExcludedNumber(match)
    },
    { 
      name: 'USPS Priority', 
      regex: /(9[0-9]{21})\b/gi,
      priority: 3,
      validator: (match: string) => /^9[0-9]{21}$/.test(match)
    },
    { 
      name: 'USPS Standard', 
      regex: /(9[0-9]{19})\b/gi,
      priority: 3,
      validator: (match: string) => /^9[0-9]{19}$/.test(match)
    },
    { 
      name: 'StockX Custom', 
      regex: /([8-9][0-9]{11})\b/gi,
      priority: 4,
      validator: (match: string) => /^[8-9][0-9]{11}$/.test(match) && !isExcludedNumber(match)
    }
  ];

  // Excluded numbers function
  function isExcludedNumber(num: string): boolean {
    const excluded = [
      /^(0{8,}|1{8,})$/, // All zeros or ones
      /^(150|173|14|8|00)$/, // Short numbers
      /^[0-9]{1,3}$/, // Very short numbers
      /^[0-9]{4,6}$/, // Medium short numbers
      /^[0-9]{5}$/, // ZIP codes
      /^[0-9]{10}$/ // Phone numbers
    ];
    
    return excluded.some(pattern => pattern.test(num));
  }

  // Extract tracking number from email content using improved patterns
  const extractTrackingNumber = (emailContent: string) => {
    const allAttempts: any[] = [];
    let bestMatch = null;

    // Try each pattern in priority order
    for (const pattern of trackingPatterns) {
      let regexMatch;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((regexMatch = regex.exec(emailContent)) !== null) {
        const cleanMatch = regexMatch[1] ? regexMatch[1].replace(/[<>]/g, '').trim() : regexMatch[0].replace(/[<>]/g, '').trim();
        
        allAttempts.push({
          pattern: pattern.name,
          match: cleanMatch,
          priority: pattern.priority,
          valid: pattern.validator(cleanMatch)
        });

        if (pattern.validator(cleanMatch)) {
          if (!bestMatch || pattern.priority < bestMatch.priority) {
            bestMatch = {
              trackingNumber: cleanMatch,
              trackingType: pattern.name,
              priority: pattern.priority
            };
          }
        }
      }
    }

    return { bestMatch, allAttempts };
  };

  // Determine carrier from tracking number
  const getCarrierFromTrackingNumber = (trackingNumber: string) => {
    if (/^1Z[0-9A-Z]{16}$/i.test(trackingNumber)) return 'UPS';
    if (/^[0-9]{12,15}$/.test(trackingNumber)) return 'FedEx';
    if (/^9[0-9]{19,21}$/.test(trackingNumber)) return 'USPS';
    if (/^[0-9]{10}$/.test(trackingNumber)) return 'DHL';
    return 'Unknown';
  };

  const runTrackingRepair = async () => {
    setRepairing(true);
    setStatus('Starting tracking number repair...');
    setResults(null);
    setProgress({ current: 0, total: 0 });

    try {
      // Check if Firebase is properly initialized
      if (!db) {
        throw new Error('Firebase database not initialized. Please check your Firebase configuration.');
      }
      
      setStatus('Firebase connection verified...');
      // Get all purchases without tracking numbers
      setStatus('Fetching orders without tracking numbers...');
      
      let querySnapshot;
      let allOrders = [];
      
      try {
        // Try querying for empty tracking numbers first
        const q = query(
          collection(db, 'purchases'),
          where('tracking', '==', '')
        );
        querySnapshot = await getDocs(q);
        console.log('Query snapshot size:', querySnapshot.size);
        
        allOrders = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // If no orders found with empty tracking numbers, get all orders
        if (allOrders.length === 0) {
          setStatus('No orders with empty tracking numbers found, fetching all orders...');
          const allQuery = query(collection(db, 'purchases'));
          const allSnapshot = await getDocs(allQuery);
          allOrders = allSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          console.log('All orders fetched:', allOrders.length);
        }
      } catch (error) {
        console.log('Specific query failed, fetching all orders:', error.message);
        // Fallback: get all orders
        const allQuery = query(collection(db, 'purchases'));
        const allSnapshot = await getDocs(allQuery);
        allOrders = allSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log('All orders fetched as fallback:', allOrders.length);
      }

      // Filter for orders without tracking numbers (handle different field names)
      const ordersWithoutTracking = allOrders.filter(order => 
        !order.tracking || 
        order.tracking === '' || 
        order.tracking === null ||
        order.tracking === undefined
      );

      console.log('Total orders found:', allOrders.length);
      console.log('Orders without tracking:', ordersWithoutTracking.length);
      console.log('Sample order fields:', allOrders.length > 0 ? Object.keys(allOrders[0]) : 'No orders');
      
      if (allOrders.length === 0) {
        setStatus('❌ No orders found in database. Please ensure orders are being created properly.');
        setResults({
          error: 'No orders found',
          message: 'There are no orders in the purchases collection. Please check if orders are being created correctly.',
          suggestions: [
            'Check if the Gmail sync is working',
            'Verify orders are being saved to the purchases collection',
            'Check the order creation process'
          ]
        });
        return;
      }
      
      setProgress({ current: 0, total: ordersWithoutTracking.length });
      setStatus(`Found ${allOrders.length} total orders, ${ordersWithoutTracking.length} without tracking numbers`);

      const repairResults = {
        totalProcessed: 0,
        trackingNumbersFound: 0,
        ordersUpdated: 0,
        errors: 0,
        details: [] as any[]
      };

      // Process each order
      for (let i = 0; i < ordersWithoutTracking.length; i++) {
        const order = ordersWithoutTracking[i];
        setProgress({ current: i + 1, total: ordersWithoutTracking.length });
        setStatus(`Processing order ${order.orderNumber} (${i + 1}/${ordersWithoutTracking.length})...`);

        try {
          // Get the email content for this order
          const emailQuery = query(
            collection(db, 'emails'),
            where('orderNumber', '==', order.orderNumber),
            where('type', '==', 'shipping'),
            limit(1)
          );
          
          const emailSnapshot = await getDocs(emailQuery);
          
          if (emailSnapshot.empty) {
            repairResults.details.push({
              orderNumber: order.orderNumber,
              status: 'no_email',
              message: 'No shipping email found'
            });
            continue;
          }

          const emailDoc = emailSnapshot.docs[0];
          const emailData = emailDoc.data();
          const emailContent = emailData.content || emailData.body || '';

          // Extract tracking number using improved patterns
          const { bestMatch, allAttempts } = extractTrackingNumber(emailContent);

          repairResults.totalProcessed++;

          if (bestMatch) {
            const carrier = getCarrierFromTrackingNumber(bestMatch.trackingNumber);
            
            // Update the order with the tracking number
            const updatedData = {
              ...order,
              trackingNumber: bestMatch.trackingNumber,
              trackingCarrier: carrier,
              trackingType: bestMatch.trackingType,
              lastUpdated: new Date().toISOString(),
              trackingSource: 'regex_repair'
            };

            await updateDoc(doc(db, 'purchases', order.id), updatedData);

            repairResults.trackingNumbersFound++;
            repairResults.ordersUpdated++;
            
            repairResults.details.push({
              orderNumber: order.orderNumber,
              status: 'success',
              trackingNumber: bestMatch.trackingNumber,
              carrier: carrier,
              pattern: bestMatch.trackingType,
              allAttempts: allAttempts
            });

            setStatus(`✅ Found tracking ${bestMatch.trackingNumber} for order ${order.orderNumber}`);
          } else {
            repairResults.details.push({
              orderNumber: order.orderNumber,
              status: 'no_tracking',
              message: 'No valid tracking number found in email',
              allAttempts: allAttempts
            });
          }

        } catch (error) {
          console.error(`Error processing order ${order.orderNumber}:`, error);
          repairResults.errors++;
          repairResults.details.push({
            orderNumber: order.orderNumber,
            status: 'error',
            message: error.message
          });
        }
      }

      setStatus('✅ Tracking number repair completed!');
      setResults(repairResults);

    } catch (error) {
      console.error('Error running tracking repair:', error);
      setStatus(`❌ Error occurred during repair: ${error.message}`);
      setResults({ 
        error: error.message,
        stack: error.stack,
        name: error.name
      });
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <h3 className="text-lg font-semibold text-blue-800 mb-2">
        🔧 Tracking Number Repair System
      </h3>
      <p className="text-sm text-blue-700 mb-3">
        This system will run the improved regex patterns against all orders without tracking numbers 
        to find and extract missing tracking information from their shipping emails.
      </p>
      
      <div className="mb-3">
        <button
          onClick={runTrackingRepair}
          disabled={repairing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded text-sm font-medium"
        >
          {repairing ? 'Running Repair...' : 'Run Tracking Number Repair'}
        </button>
      </div>

      {progress.total > 0 && (
        <div className="mb-3">
          <div className="text-sm text-gray-700 mb-1">
            Progress: {progress.current} / {progress.total} orders
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
        </div>
      )}

      {status && (
        <div className="text-sm text-gray-700 mb-2">
          <strong>Status:</strong> {status}
        </div>
      )}

      {results && (
        <div className="mt-3 p-3 bg-gray-100 rounded text-sm">
          <h4 className="font-semibold mb-2">Repair Results:</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.totalProcessed || 0}</div>
              <div className="text-xs text-gray-600">Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.trackingNumbersFound || 0}</div>
              <div className="text-xs text-gray-600">Found</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{results.ordersUpdated || 0}</div>
              <div className="text-xs text-gray-600">Updated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{results.errors || 0}</div>
              <div className="text-xs text-gray-600">Errors</div>
            </div>
          </div>
          
          {results.details && results.details.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">View Detailed Results</summary>
              <div className="mt-2 max-h-64 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-xs">
                  {JSON.stringify(results.details, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackingNumberRepair;
