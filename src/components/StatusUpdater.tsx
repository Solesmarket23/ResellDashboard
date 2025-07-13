'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface StatusUpdaterProps {
  purchases: any[];
  onStatusUpdate: (updates: any[]) => void;
  className?: string;
  isAutoEnabled?: boolean;
  lastAutoUpdate?: Date | null;
}

const StatusUpdater = ({ purchases, onStatusUpdate, className = '', isAutoEnabled = false, lastAutoUpdate }: StatusUpdaterProps) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [isForcing, setIsForcing] = useState(false);
  const [isRobustSearching, setIsRobustSearching] = useState(false);
  const { currentTheme } = useTheme();

  const forceDeliveryStatus = async () => {
    if (isForcing) return;

    setIsForcing(true);
    
    try {
      console.log(`🚀 Forcing delivery status for order 01-3KF7CE560J...`);
      
      const response = await fetch('/api/gmail/force-delivery-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumber: '01-3KF7CE560J' })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Force delivery complete:`, data.summary);
        console.log(`🔍 Forced update:`, data.updatedOrders);
        
        // Apply forced status update
        onStatusUpdate(data.updatedOrders);
        
        setLastUpdate(`Forced delivery status for 01-3KF7CE560J`);
        
        // Clear message after 5 seconds
        setTimeout(() => setLastUpdate(''), 5000);
      } else {
        console.error('❌ Force delivery failed:', data.error);
        setLastUpdate('Force failed');
        setTimeout(() => setLastUpdate(''), 5000);
      }
    } catch (error) {
      console.error('❌ Force delivery error:', error);
      setLastUpdate('Force error');
      setTimeout(() => setLastUpdate(''), 5000);
    } finally {
      setIsForcing(false);
    }
  };

  const robustSearch = async () => {
    if (isRobustSearching || purchases.length === 0) return;

    setIsRobustSearching(true);
    
    try {
      // Extract order numbers from purchases
      const orderNumbers = purchases.map(p => p.orderNumber).filter(Boolean);
      
      console.log(`🔍 Running robust search for ${orderNumbers.length} orders...`);
      
      const response = await fetch('/api/gmail/quick-robust-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Robust search complete:`, data.summary);
        console.log(`🔍 Updated orders:`, data.updatedOrders);
        
        // Apply status updates to purchases
        onStatusUpdate(data.updatedOrders);
        
        setLastUpdate(`Robust search: Updated ${data.summary.updated}/${data.summary.totalOrders} orders`);
        
        // Clear message after 8 seconds
        setTimeout(() => setLastUpdate(''), 8000);
      } else {
        console.error('❌ Robust search failed:', data.error);
        setLastUpdate('Robust search failed');
        setTimeout(() => setLastUpdate(''), 5000);
      }
    } catch (error) {
      console.error('❌ Robust search error:', error);
      setLastUpdate('Robust search error');
      setTimeout(() => setLastUpdate(''), 5000);
    } finally {
      setIsRobustSearching(false);
    }
  };

  const resetStatus = async () => {
    if (isRobustSearching) return;

    setIsRobustSearching(true);
    
    try {
      console.log(`🔄 Restoring original statuses for all orders...`);
      
      // Get all order numbers that need to be restored to "Ordered"
      const orderNumbers = purchases.map(p => p.orderNumber).filter(Boolean);
      
      const response = await fetch('/api/gmail/restore-original-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      const data = await response.json();
      
      if (data.success) {
        console.log(`✅ Original statuses restored:`, data.summary);
        
        // Apply the restore updates (this will set everything back to "Ordered")
        onStatusUpdate(data.updatedOrders);
        
        setLastUpdate(`Restored ${data.summary.updated} orders to original status`);
        setTimeout(() => setLastUpdate(''), 5000);
        
      } else {
        console.error('❌ Restore failed:', data.error);
        setLastUpdate('Restore failed');
        setTimeout(() => setLastUpdate(''), 5000);
      }
    } catch (error) {
      console.error('❌ Restore error:', error);
      setLastUpdate('Restore error');
      setTimeout(() => setLastUpdate(''), 5000);
    } finally {
      setIsRobustSearching(false);
    }
  };

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
        console.log(`🔍 Updated orders:`, data.updatedOrders);
        
        // Apply status updates to purchases
        onStatusUpdate(data.updatedOrders);
        
        setLastUpdate(`Updated ${data.summary.updated}/${data.summary.requested} orders`);
        
        // If no orders were updated, force a page refresh to sync data
        if (data.summary.updated === 0) {
          console.log(`🔄 No status changes detected - forcing page refresh to sync data`);
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        }
        
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
      
      <button
        onClick={resetStatus}
        disabled={isRobustSearching}
        className={`flex items-center space-x-2 ${
          currentTheme.name === 'Neon' 
            ? 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30' 
            : 'bg-orange-600 hover:bg-orange-700 text-white'
        } disabled:opacity-50 px-3 py-2 rounded-lg font-medium transition-all duration-200`}
        title="Reset all incorrect status updates and restore original statuses"
      >
        <span className="text-sm">Reset Status</span>
      </button>
      
      <button
        onClick={forceDeliveryStatus}
        disabled={isForcing}
        className={`flex items-center space-x-2 ${
          currentTheme.name === 'Neon' 
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30' 
            : 'bg-red-600 hover:bg-red-700 text-white'
        } disabled:opacity-50 px-3 py-2 rounded-lg font-medium transition-all duration-200`}
        title="Force delivery status for order 01-3KF7CE560J"
      >
        <span className="text-sm">{isForcing ? 'Forcing...' : 'Force 3KF7CE560J'}</span>
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
      
      {/* Auto-update indicator */}
      {isAutoEnabled && (
        <div className="flex items-center space-x-1 text-xs">
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            currentTheme.name === 'Neon' ? 'bg-yellow-400' : 'bg-yellow-500'
          }`} />
          <span className={currentTheme.colors.textSecondary}>
            Auto-monitoring active
            {lastAutoUpdate && ` (Last: ${lastAutoUpdate.toLocaleTimeString()})`}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatusUpdater;