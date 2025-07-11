'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface StatusUpdaterProps {
  purchases: any[];
  onStatusUpdate: (updates: any[]) => void;
  className?: string;
}

const StatusUpdater = ({ purchases, onStatusUpdate, className = '' }: StatusUpdaterProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const { currentTheme } = useTheme();

  const updateStatuses = async () => {
    if (isUpdating || purchases.length === 0) return;

    setIsUpdating(true);
    
    try {
      // Extract order numbers from purchases
      const orderNumbers = purchases.map(p => p.orderNumber).filter(Boolean);
      
      console.log(`🔄 Updating status for ${orderNumbers.length} orders...`);
      
      const response = await fetch('/api/gmail/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Status update complete:`, data.summary);
        
        // Apply status updates to purchases
        onStatusUpdate(data.updatedOrders);
        
        setLastUpdate(`Updated ${data.summary.updated}/${data.summary.requested} orders`);
        
        // Clear message after 5 seconds
        setTimeout(() => setLastUpdate(''), 5000);
      } else {
        console.error('❌ Status update failed:', data.error);
        setLastUpdate('Update failed');
        setTimeout(() => setLastUpdate(''), 5000);
      }
    } catch (error) {
      console.error('❌ Status update error:', error);
      setLastUpdate('Update error');
      setTimeout(() => setLastUpdate(''), 5000);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <button
        onClick={updateStatuses}
        disabled={isUpdating || purchases.length === 0}
        className={`flex items-center space-x-2 ${
          currentTheme.name === 'Neon' 
            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/30' 
            : 'bg-yellow-600 hover:bg-yellow-700 text-white'
        } disabled:opacity-50 px-4 py-2 rounded-lg font-medium transition-all duration-200`}
        title="Update order statuses from delivery emails"
      >
        <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
        <span>{isUpdating ? 'Updating...' : 'Update Status'}</span>
      </button>
      
      {lastUpdate && (
        <span className={`text-sm ${
          lastUpdate.includes('failed') || lastUpdate.includes('error') 
            ? 'text-red-400' 
            : 'text-green-400'
        }`}>
          {lastUpdate}
        </span>
      )}
    </div>
  );
};

export default StatusUpdater;