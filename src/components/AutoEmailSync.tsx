'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Clock, CheckCircle, Mail, ChevronDown } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import { db } from '../lib/firebase/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AutoEmailSyncProps {
  isGmailConnected: boolean;
  onNewPurchases?: (count: number) => void;
  purchases?: any[];
  onStatusUpdate?: (updates: any[]) => void;
  onAutoStatusChange?: (enabled: boolean, lastUpdate?: Date | null) => void;
}

const AutoEmailSync: React.FC<AutoEmailSyncProps> = ({ 
  isGmailConnected, 
  onNewPurchases,
  purchases = [],
  onStatusUpdate,
  onAutoStatusChange
}) => {
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  
  console.log('🔄 AutoEmailSync component loaded', { isGmailConnected });
  const [isEnabled, setIsEnabled] = useState(false);
  const [isStatusEnabled, setIsStatusEnabled] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<Date | null>(null);
  const [nextSync, setNextSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [syncInterval, setSyncInterval] = useState(15); // minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to get user ID (Firebase or site password)
  const getUserId = (): string | null => {
    if (user?.uid) {
      return user.uid;
    }
    // Check for site password authentication
    if (typeof window !== 'undefined') {
      const siteUserId = localStorage.getItem('siteUserId');
      return siteUserId;
    }
    return null;
  };

  // Load settings from Firebase or localStorage on component mount
  useEffect(() => {
    const loadSettings = async () => {
      const userId = getUserId();
      if (!userId) {
      console.warn('No user ID available, skipping settings load');
      return;
    }
      
      const isSitePasswordUser = !user?.uid && typeof window !== 'undefined' && localStorage.getItem('siteUserId');
      
      if (isSitePasswordUser) {
        // Load from localStorage for site password users
        try {
          const settingsKey = `autoMonitoring_${userId}`;
          const savedSettings = localStorage.getItem(settingsKey);
          if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            if (settings.isEnabled !== undefined) setIsEnabled(settings.isEnabled);
            if (settings.isStatusEnabled !== undefined) setIsStatusEnabled(settings.isStatusEnabled);
            if (settings.syncInterval !== undefined) setSyncInterval(settings.syncInterval);
            if (settings.lastSync) setLastSync(new Date(settings.lastSync));
            if (settings.lastStatusUpdate) setLastStatusUpdate(new Date(settings.lastStatusUpdate));
            console.log('Auto monitoring settings loaded from localStorage', settings);
          }
        } catch (error) {
          console.error('Error loading auto monitoring settings from localStorage:', error);
        }
        return;
      }
      
      // Load from Firebase for Firebase users
      try {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const data = userDoc.data();
          const autoMonitoring = data.autoMonitoring || {};
          
          // Load saved preferences
          if (autoMonitoring.isEnabled !== undefined) {
            setIsEnabled(autoMonitoring.isEnabled);
          }
          if (autoMonitoring.isStatusEnabled !== undefined) {
            setIsStatusEnabled(autoMonitoring.isStatusEnabled);
          }
          if (autoMonitoring.syncInterval !== undefined) {
            setSyncInterval(autoMonitoring.syncInterval);
          }
          if (autoMonitoring.lastSync) {
            setLastSync(new Date(autoMonitoring.lastSync));
          }
          if (autoMonitoring.lastStatusUpdate) {
            setLastStatusUpdate(new Date(autoMonitoring.lastStatusUpdate));
          }
          
          console.log('Auto monitoring settings loaded from Firebase', autoMonitoring);
        }
      } catch (error: any) {
        console.error('Error loading auto monitoring settings:', error);
        console.error('Error details:', {
          code: error?.code,
          message: error?.message,
          userId: userId
        });
      }
    };
    
    loadSettings();
  }, [user]);

  // Save settings to Firebase or localStorage when they change
  const saveSettings = useRef(
    async (settings: {
      isEnabled: boolean;
      isStatusEnabled: boolean;
      syncInterval: number;
      lastSync: Date | null;
      lastStatusUpdate: Date | null;
    }, immediate = false) => {
      const userId = getUserId();
      if (!userId) {
        console.warn('No user ID available, skipping save');
        return;
      }

      const isSitePasswordUser = !user?.uid && typeof window !== 'undefined' && localStorage.getItem('siteUserId');
      
      const saveToStorage = async () => {
        try {
          if (isSitePasswordUser) {
            // Save to localStorage for site password users
            const settingsKey = `autoMonitoring_${userId}`;
            localStorage.setItem(settingsKey, JSON.stringify({
              isEnabled: settings.isEnabled,
              isStatusEnabled: settings.isStatusEnabled,
              syncInterval: settings.syncInterval,
              lastSync: settings.lastSync ? settings.lastSync.toISOString() : null,
              lastStatusUpdate: settings.lastStatusUpdate ? settings.lastStatusUpdate.toISOString() : null,
            }));
            console.log('Auto monitoring settings saved to localStorage', settings);
          } else {
            // Save to Firebase for Firebase users
            const userRef = doc(db, 'users', userId);
          await setDoc(userRef, {
            autoMonitoring: {
              isEnabled: settings.isEnabled,
              isStatusEnabled: settings.isStatusEnabled,
              syncInterval: settings.syncInterval,
              lastSync: settings.lastSync ? settings.lastSync.toISOString() : null,
              lastStatusUpdate: settings.lastStatusUpdate ? settings.lastStatusUpdate.toISOString() : null,
            }
          }, { merge: true });
          console.log('Auto monitoring settings saved to Firebase', settings);
          }
        } catch (error: any) {
          console.error('Error saving auto monitoring settings:', error);
        }
      };

      if (immediate) {
        await saveToStorage();
      } else {
        // Debounce saves
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(saveToStorage, 1000);
      }
    }
  ).current;

  const syncPurchases = async () => {
    if (!isGmailConnected) {
      console.log('Gmail not connected, skipping sync');
      return;
    }

    console.log('Starting manual sync...');
    setIsSyncing(true);

    try {
      const response = await fetch('/api/gmail/purchases', {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Sync failed');
      }

      const data = await response.json();
      console.log('Sync response:', data);

      // Update last sync time
      const now = new Date();
      setLastSync(now);
      saveSettings({
        isEnabled,
        isStatusEnabled,
        syncInterval,
        lastSync: now,
        lastStatusUpdate
      }, true);

      if (onNewPurchases && data.purchases) {
        onNewPurchases(data.purchases.length);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateDeliveryStatuses = async () => {
    if (!purchases || purchases.length === 0) {
      console.log('No purchases to update');
      return;
    }

    const userId = getUserId();
    if (!userId) {
      console.error('No user ID available for status update');
      return;
    }

    console.log('Starting status update...');
    setIsUpdatingStatus(true);

    try {
      const isSitePasswordUser = !user?.uid && typeof window !== 'undefined' && localStorage.getItem('siteUserId');
      
      const response = await fetch('/api/deliveries/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userId,
          purchases,
          fromLocalStorage: isSitePasswordUser
        }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Status update failed');
      }

      const data = await response.json();
      console.log('Status update response:', data);

      // Update last status update time
      const now = new Date();
      setLastStatusUpdate(now);
      saveSettings({
        isEnabled,
        isStatusEnabled,
        syncInterval,
        lastSync,
        lastStatusUpdate: now
      }, true);

      if (onStatusUpdate && data.updates) {
        onStatusUpdate(data.updates);
      }

      // Notify parent component
      if (onAutoStatusChange) {
        onAutoStatusChange(isStatusEnabled, now);
      }
    } catch (error) {
      console.error('Status update error:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Setup auto-sync
  useEffect(() => {
    if (!isEnabled || !isGmailConnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (nextSyncTimeoutRef.current) {
        clearTimeout(nextSyncTimeoutRef.current);
        nextSyncTimeoutRef.current = null;
      }
      setNextSync(null);
      return;
    }

    // Initial sync
    syncPurchases();

    // Calculate next sync time
    const calculateNextSync = () => {
      const next = new Date();
      next.setMinutes(next.getMinutes() + syncInterval);
      setNextSync(next);
    };

    calculateNextSync();

    // Setup interval
    intervalRef.current = setInterval(() => {
      syncPurchases();
      calculateNextSync();
    }, syncInterval * 60 * 1000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (nextSyncTimeoutRef.current) {
        clearTimeout(nextSyncTimeoutRef.current);
      }
    };
  }, [isEnabled, isGmailConnected, syncInterval]);

  // Setup auto status updates
  useEffect(() => {
    if (!isStatusEnabled || !isGmailConnected || purchases.length === 0) {
      return;
    }

    // Initial status update
    updateDeliveryStatuses();

    // Setup interval (every 30 minutes)
    const statusInterval = setInterval(() => {
      updateDeliveryStatuses();
    }, 30 * 60 * 1000);

    return () => clearInterval(statusInterval);
  }, [isStatusEnabled, isGmailConnected, purchases.length]);

  const handleToggle = () => {
    const newValue = !isEnabled;
    setIsEnabled(newValue);
    saveSettings({
      isEnabled: newValue,
      isStatusEnabled,
      syncInterval,
      lastSync,
      lastStatusUpdate
    }, true); // Save immediately on toggle
  };

  const handleStatusToggle = () => {
    const newValue = !isStatusEnabled;
    setIsStatusEnabled(newValue);
    saveSettings({
      isEnabled,
      isStatusEnabled: newValue,
      syncInterval,
      lastSync,
      lastStatusUpdate
    }, true); // Save immediately on toggle
    
    if (onAutoStatusChange) {
      onAutoStatusChange(newValue, lastStatusUpdate);
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setSyncInterval(newInterval);
    saveSettings({
      isEnabled,
      isStatusEnabled,
      syncInterval: newInterval,
      lastSync,
      lastStatusUpdate
    }, true); // Save immediately
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

  return (
    <div className={`rounded-xl overflow-hidden border transition-all duration-300 ${
      currentTheme.name === 'Neon' 
        ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border-white/10 shadow-lg' 
        : 'bg-white border-gray-200 shadow-lg'
    }`}>
      {/* Compact Header - Always Visible */}
      <div 
        className={`px-4 py-3 cursor-pointer transition-all duration-200 ${
          currentTheme.name === 'Neon'
            ? 'hover:bg-white/5'
            : 'hover:bg-gray-50'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Compact Icon */}
            <div className={`p-1.5 rounded-lg ${
              (isEnabled || isStatusEnabled)
                ? currentTheme.name === 'Neon'
                  ? 'bg-cyan-500/20 ring-2 ring-cyan-500/30'
                  : 'bg-blue-100 ring-2 ring-blue-200'
                : currentTheme.name === 'Neon'
                  ? 'bg-white/5 ring-1 ring-white/20'
                  : 'bg-gray-100 ring-1 ring-gray-200'
            }`}>
              <RefreshCw className={`w-4 h-4 ${(isSyncing || isUpdatingStatus) ? 'animate-spin' : ''} ${
                (isEnabled || isStatusEnabled)
                  ? currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
                  : currentTheme.colors.textSecondary
              }`} />
            </div>

            {/* Title */}
            <div>
              <h3 className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                Auto Monitoring
              </h3>
              {!isExpanded && (
                <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                  {(isEnabled || isStatusEnabled) 
                    ? `Email: ${isEnabled ? 'On' : 'Off'} • Status: ${isStatusEnabled ? 'On' : 'Off'}` 
                    : 'Click to configure'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Status Badge */}
            <div className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all duration-300 ${
              (isEnabled || isStatusEnabled)
                ? currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 ring-2 ring-green-500/30'
                  : 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 ring-2 ring-green-200'
                : currentTheme.name === 'Neon'
                  ? 'bg-white/5 text-gray-400 ring-1 ring-white/20'
                  : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
            }`}>
              {(isEnabled || isStatusEnabled) ? '● Active' : '○ Inactive'}
            </div>

            {/* Expand Icon */}
            <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${
              currentTheme.colors.textSecondary
            } ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className={`border-t ${
          currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
        }`}>
          <div className="p-4">
            {!isGmailConnected ? (
              <div className={`text-center py-6 ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border border-white/10'
                  : 'bg-gray-50 border border-gray-200'
              } rounded-lg`}>
                <Mail className={`w-10 h-10 mx-auto mb-2 ${currentTheme.colors.textSecondary}`} />
                <p className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
                  Gmail Connection Required
                </p>
                <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                  Connect Gmail above to enable automatic monitoring
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Auto Email Sync */}
                <div className={`p-3 rounded-lg border transition-all duration-300 ${
                  isEnabled
                    ? currentTheme.name === 'Neon'
                      ? 'bg-cyan-500/5 border-cyan-500/30 ring-1 ring-cyan-500/20'
                      : 'bg-blue-50 border-blue-200 ring-1 ring-blue-100'
                    : currentTheme.name === 'Neon'
                      ? 'bg-white/5 border-white/10'
                      : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Mail className={`w-4 h-4 ${isEnabled ? (currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600') : currentTheme.colors.textSecondary}`} />
                      <span className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                        Auto Email Sync
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggle();
                      }}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ${
                        isEnabled 
                          ? currentTheme.name === 'Neon'
                            ? 'bg-gradient-to-r from-cyan-500 to-blue-500'
                            : 'bg-gradient-to-r from-blue-500 to-blue-600'
                          : currentTheme.name === 'Neon'
                            ? 'bg-gray-700'
                            : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-300 ${
                          isEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6`}>
                    {isEnabled ? `Syncing every ${syncInterval} minutes` : 'Automatically fetch new purchase emails'}
                  </p>
                  {isEnabled && lastSync && (
                    <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6 mt-1`}>
                      Last: {lastSync.toLocaleTimeString()}
                    </p>
                  )}
                </div>

                {/* Auto Status Updates */}
                <div className={`p-3 rounded-lg border transition-all duration-300 ${
                  isStatusEnabled
                    ? currentTheme.name === 'Neon'
                      ? 'bg-yellow-500/5 border-yellow-500/30 ring-1 ring-yellow-500/20'
                      : 'bg-yellow-50 border-yellow-200 ring-1 ring-yellow-100'
                    : currentTheme.name === 'Neon'
                      ? 'bg-white/5 border-white/10'
                      : 'bg-gray-50 border-gray-200'
                } ${purchases.length === 0 ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-4 h-4 ${isStatusEnabled ? (currentTheme.name === 'Neon' ? 'text-yellow-400' : 'text-yellow-600') : currentTheme.colors.textSecondary}`} />
                      <span className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                        Auto Status Updates
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusToggle();
                      }}
                      disabled={purchases.length === 0}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all duration-300 ${
                        purchases.length === 0 ? 'cursor-not-allowed opacity-50' : ''
                      } ${
                        isStatusEnabled 
                          ? currentTheme.name === 'Neon'
                            ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                            : 'bg-gradient-to-r from-yellow-500 to-yellow-600'
                          : currentTheme.name === 'Neon'
                            ? 'bg-gray-700'
                            : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-300 ${
                          isStatusEnabled ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6`}>
                    {isStatusEnabled ? 'Tracking delivery status every 30 minutes' : 'Track delivery status changes automatically'}
                  </p>
                  {isStatusEnabled && lastStatusUpdate && (
                    <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6 mt-1`}>
                      Last: {lastStatusUpdate.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoEmailSync;
