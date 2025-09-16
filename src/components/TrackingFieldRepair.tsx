'use client';

import { useState } from 'react';
import { Wrench, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const TrackingFieldRepair = () => {
  const [repairing, setRepairing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [status, setStatus] = useState('');

  const runRepair = async () => {
    setRepairing(true);
    setStatus('Starting tracking field repair...');
    setResults(null);

    try {
      const response = await fetch('/api/repair-missing-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setResults(data.results);
        setStatus('✅ Tracking field repair completed successfully!');
      } else {
        setStatus(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error running repair:', error);
      setStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <Wrench className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Tracking Field Repair
        </h2>
      </div>

      <div className="mb-4">
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          This tool will repair missing tracking fields in your purchase records. 
          It will look for tracking data in alternative field names and ensure all 
          purchases have the proper tracking, carrier, and shipping status fields.
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={runRepair}
          disabled={repairing}
          className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
            repairing
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {repairing ? (
            <div className="flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin" />
              Running Repair...
            </div>
          ) : (
            'Run Tracking Field Repair'
          )}
        </button>
      </div>

      {status && (
        <div className={`p-4 rounded-lg mb-4 ${
          status.includes('✅') 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
            : status.includes('❌')
            ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'
            : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {status.includes('✅') ? (
              <CheckCircle className="w-5 h-5" />
            ) : status.includes('❌') ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <Loader className="w-5 h-5 animate-spin" />
            )}
            <span className="font-medium">{status}</span>
          </div>
        </div>
      )}

      {results && (
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Repair Results
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{results.totalProcessed || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Total Processed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{results.repaired || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Repaired</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{results.alreadyHadTracking || 0}</div>
              <div className="text-sm text-gray-600 dark:text-gray-300">Already Had Tracking</div>
            </div>
          </div>

          {results.details && results.details.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Detailed Results (First 10)
              </h4>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600">
                      <th className="text-left py-2">Order</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-left py-2">Tracking</th>
                      <th className="text-left py-2">Carrier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.details.slice(0, 10).map((detail: any, index: number) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-600">
                        <td className="py-2 font-mono text-xs">{detail.orderNumber}</td>
                        <td className="py-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            detail.status === 'repaired' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : detail.status === 'already_has_tracking'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                          }`}>
                            {detail.status}
                          </span>
                        </td>
                        <td className="py-2 font-mono text-xs">{detail.tracking || 'N/A'}</td>
                        <td className="py-2 text-xs">{detail.carrier || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrackingFieldRepair;

