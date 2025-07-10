'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Clock, CheckCircle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface AutoEmailSyncProps {
  isGmailConnected: boolean;
  onNewPurchases?: (count: number) => void;
}

const AutoEmailSync: React.FC<AutoEmailSyncProps> = ({ 
  isGmailConnected, 
  onNewPurchases 
}) => {
  const { currentTheme } = useTheme();
  
  console.log('🔄 AutoEmailSync component loaded', { isGmailConnected });
  const [isEnabled, setIsEnabled] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [nextSync, setNextSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncInterval, setSyncInterval] = useState(15); // minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear intervals on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (nextSyncTimeoutRef.current) clearTimeout(nextSyncTimeoutRef.current);
    };
  }, []);

  // Auto-sync logic
  useEffect(() => {
    if (isEnabled && isGmailConnected) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  }, [isEnabled, isGmailConnected, syncInterval]);

  const startAutoSync = () => {
    console.log(`🔄 Starting auto-sync every ${syncInterval} minutes`);
    
    // Clear existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    // Set up recurring sync
    intervalRef.current = setInterval(() => {
      performSync();
    }, syncInterval * 60 * 1000);

    // Update next sync time
    updateNextSyncTime();
  };

  const stopAutoSync = () => {
    console.log('⏹️ Stopping auto-sync');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (nextSyncTimeoutRef.current) {
      clearTimeout(nextSyncTimeoutRef.current);
      nextSyncTimeoutRef.current = null;
    }
    setNextSync(null);
  };

  const updateNextSyncTime = () => {
    const next = new Date(Date.now() + syncInterval * 60 * 1000);
    setNextSync(next);
    
    // Clear existing timeout
    if (nextSyncTimeoutRef.current) clearTimeout(nextSyncTimeoutRef.current);
    
    // Set timeout to update the countdown
    nextSyncTimeoutRef.current = setTimeout(() => {
      updateNextSyncTime();
    }, 60000); // Update every minute
  };

  const performSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    console.log('🔄 AUTO-SYNC: Performing automatic sync...');
    
    try {
      const response = await fetch('/api/gmail/purchases?limit=25', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const newCount = data.purchases?.length || 0;
        
        console.log(`✅ AUTO-SYNC: Found ${newCount} purchases`);
        setLastSync(new Date());
        onNewPurchases?.(newCount);
        
        // Show brief notification if new purchases found
        if (newCount > 0) {
          // You could add a toast notification here
          console.log(`🎉 AUTO-SYNC: ${newCount} new purchases detected`);
        }
      } else {
        console.error('❌ AUTO-SYNC: Sync failed with status:', response.status);
      }
    } catch (error) {
      console.error('❌ AUTO-SYNC: Sync error:', error);
    } finally {
      setIsSyncing(false);
      updateNextSyncTime();
    }
  };

  const handleToggle = () => {
    setIsEnabled(!isEnabled);
  };

  const handleIntervalChange = (newInterval: number) => {
    setSyncInterval(newInterval);
  };

  const formatTimeUntilNext = () => {
    if (!nextSync) return '';
    
    const now = new Date();
    const diffMs = nextSync.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);
    
    if (diffMins <= 0) return 'Syncing soon...';
    if (diffMins === 1) return '1 minute';
    return `${diffMins} minutes`;
  };

  // Always show the component, but disable it when Gmail not connected

  return (
    <div className={`p-4 rounded-lg border ${
      currentTheme.name === 'Neon' 
        ? 'bg-white/5 border-white/10' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''} ${
            currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
          }`} />
          <span className={`font-medium text-sm ${currentTheme.colors.textPrimary}`}>
            🔄 Auto Email Sync
          </span>
        </div>
        
        <button
          onClick={handleToggle}
          disabled={!isGmailConnected}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            !isGmailConnected
              ? currentTheme.name === 'Neon'
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 opacity-50'
                : 'bg-red-100 text-red-600 opacity-50'
              : isEnabled 
                ? currentTheme.name === 'Neon'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-green-100 text-green-800'
                : currentTheme.name === 'Neon'
                  ? 'bg-white/10 text-gray-300 border border-white/20'
                  : 'bg-gray-100 text-gray-600'
          }`}
        >
          {!isGmailConnected ? 'Gmail Required' : isEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {!isGmailConnected && (
        <div className={`text-xs ${currentTheme.colors.textSecondary} mt-2`}>
          Connect Gmail above to enable automatic email syncing
        </div>
      )}

      {isEnabled && isGmailConnected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={`text-xs ${currentTheme.colors.textSecondary}`}>
              Sync every:
            </span>
            <select
              value={syncInterval}
              onChange={(e) => handleIntervalChange(Number(e.target.value))}
              className={`text-xs px-2 py-1 rounded border ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/10 border-white/20 text-gray-300'
                  : 'bg-white border-gray-300'
              }`}
            >
              <option value={5}>5 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </select>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            {lastSync && (
              <div className={`flex items-center space-x-1 ${currentTheme.colors.textSecondary}`}>
                <CheckCircle className="w-3 h-3" />
                <span>Last: {lastSync.toLocaleTimeString()}</span>
              </div>
            )}
            
            {nextSync && !isSyncing && (
              <div className={`flex items-center space-x-1 ${currentTheme.colors.textSecondary}`}>
                <Clock className="w-3 h-3" />
                <span>Next: {formatTimeUntilNext()}</span>
              </div>
            )}
            
            {isSyncing && (
              <div className={`flex items-center space-x-1 ${
                currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
              }`}>
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoEmailSync;