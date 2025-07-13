'use client';

import { useState } from 'react';

export default function Debug3KF7CE560J() {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testSpecificOrder = async () => {
    setLoading(true);
    try {
      // Test multiple search queries for this specific order
      const queries = [
        'from:noreply@stockx.com "01-3KF7CE560J"',
        'from:noreply@stockx.com "3KF7CE560J"',
        'from:noreply@stockx.com "Xpress Ship Order Delivered" "01-3KF7CE560J"',
        'from:noreply@stockx.com "Denim Tears The Cotton Wreath Sweatshirt Grey"',
        'from:noreply@stockx.com "🎉"',
        'from:noreply@stockx.com delivered'
      ];
      
      const response = await fetch('/api/gmail/debug-01-3KF7CE560J', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries, orderNumber: '01-3KF7CE560J' })
      });
      
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error('Error:', error);
      setResults({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Order 01-3KF7CE560J</h1>
      
      <button
        onClick={testSpecificOrder}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Gmail Search'}
      </button>
      
      {results && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold mb-2">Results:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}