'use client';

import { useState } from 'react';

export default function DebugSalesPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkRemainingSales = async () => {
    setLoading(true);
    try {
      const siteUserId = localStorage.getItem('siteUserId');
      const userId = siteUserId;
      
      if (!userId) {
        alert('No user ID found');
        return;
      }

      console.log('🔍 Checking remaining sales for user:', userId);
      
      const response = await fetch(`/api/sales/debug-remaining?userId=${encodeURIComponent(userId)}`);
      const data = await response.json();
      
      console.log('🔍 Debug result:', data);
      setResult(data);
      
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error checking sales: ' + error);
    } finally {
      setLoading(false);
    }
  };

  const forceClearAllSales = async () => {
    if (!confirm('Are you sure you want to FORCE CLEAR ALL SALES? This cannot be undone!')) {
      return;
    }

    setLoading(true);
    try {
      const siteUserId = localStorage.getItem('siteUserId');
      const userId = siteUserId;
      
      if (!userId) {
        alert('No user ID found');
        return;
      }

      console.log('🔥 Force clearing all sales for user:', userId);
      
      const response = await fetch('/api/sales/force-clear-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      
      console.log('🔥 Force clear result:', data);
      alert(`Force clear completed: ${data.message}`);
      
      // Refresh the remaining sales
      await checkRemainingSales();
      
    } catch (error) {
      console.error('❌ Error:', error);
      alert('Error force clearing sales: ' + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Debug Remaining Sales</h1>
      
      <div className="space-x-4">
        <button 
          onClick={checkRemainingSales}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Check Remaining Sales'}
        </button>
        
        <button 
          onClick={forceClearAllSales}
          disabled={loading}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Force Clearing...' : '🔥 FORCE CLEAR ALL SALES'}
        </button>
      </div>

      {result && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Results:</h2>
          <div className="bg-gray-100 p-4 rounded">
            <p><strong>Total Sales:</strong> {result.totalSales}</p>
            <p><strong>Success:</strong> {result.success ? 'Yes' : 'No'}</p>
            
            {result.sales && result.sales.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Sales Details:</h3>
                <div className="space-y-2">
                  {result.sales.map((sale: any, index: number) => (
                    <div key={sale.id} className="bg-white p-3 rounded border">
                      <p><strong>Sale {index + 1}:</strong></p>
                      <p>ID: {sale.id}</p>
                      <p>Product: {sale.product}</p>
                      <p>Order Number: {sale.orderNumber}</p>
                      <p>User ID: {sale.userId}</p>
                      <p>User ID Type: {sale.userIdType}</p>
                      <p>User ID Length: {sale.userIdLength}</p>
                      <p>User ID Match: {sale.userIdMatch ? 'Yes' : 'No'}</p>
                      <p>User ID Strict Match: {sale.userIdStrictMatch ? 'Yes' : 'No'}</p>
                      <p>User ID Trimmed Match: {sale.userIdTrimmedMatch ? 'Yes' : 'No'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
