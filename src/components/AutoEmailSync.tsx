'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Clock, CheckCircle, Mail } from 'lucide-react';
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
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [lastStatusUpdate, setLastStatusUpdate] = useState<Date | null>(null);
  const [nextSync, setNextSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [syncInterval, setSyncInterval] = useState(15); // minutes
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load settings from Firebase on component mount
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.uid) {
      console.warn('No user ID available, skipping settings load');
      return;
    }
      
      try {
        const userRef = doc(db, 'users', user.uid);
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
          userId: user?.uid
        });
      }
    };
    
    loadSettings();
  }, [user]);

  // Save settings to Firebase when they change
  const saveSettings = useRef(
    async (settings: {
      isEnabled: boolean;
      isStatusEnabled: boolean;
      syncInterval: number;
      lastSync: Date | null;
      lastStatusUpdate: Date | null;
    }, immediate = false) => {
      if (!user?.uid) {
        console.warn('No user ID available, skipping save');
        return;
      }
      
      const doSave = async () => {
        try {
          const userRef = doc(db, 'users', user.uid);
          await setDoc(userRef, {
            autoMonitoring: {
              isEnabled: settings.isEnabled,
              isStatusEnabled: settings.isStatusEnabled,
              syncInterval: settings.syncInterval,
              lastSync: settings.lastSync?.toISOString() || null,
              lastStatusUpdate: settings.lastStatusUpdate?.toISOString() || null,
              updatedAt: new Date().toISOString()
            }
          }, { merge: true });
          console.log('Auto monitoring settings saved to Firebase', {
            settings,
            userId: user.uid
          });
        } catch (error: any) {
          console.error('Error saving auto monitoring settings:', error);
          console.error('Error details:', {
            code: error?.code,
            message: error?.message,
            userId: user?.uid
          });
        }
      };
      
      if (immediate) {
        // Save immediately for critical actions
        await doSave();
      } else {
        // Clear existing save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // Debounce saves to avoid too many writes
        saveTimeoutRef.current = setTimeout(doSave, 500); // 500ms debounce
      }
    }
  ).current;

  // Track if component is mounted
  const isMountedRef = useRef(true);
  
  // Save current state on unmount
  const currentStateRef = useRef({
    isEnabled,
    isStatusEnabled,
    syncInterval,
    lastSync,
    lastStatusUpdate
  });

  // Update ref when state changes and save to Firebase
  useEffect(() => {
    currentStateRef.current = {
      isEnabled,
      isStatusEnabled,
      syncInterval,
      lastSync,
      lastStatusUpdate
    };
    
    // Only save if user is authenticated and component is mounted
    if (user?.uid && isMountedRef.current) {
      // Skip saving on initial mount (when loading from Firebase)
      const isInitialMount = lastSync === null && lastStatusUpdate === null;
      if (!isInitialMount) {
        saveSettings(currentStateRef.current);
      }
    }
  }, [isEnabled, isStatusEnabled, syncInterval, lastSync, lastStatusUpdate, user, saveSettings]);

  // Clear intervals and timeouts on unmount, and save final state
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (nextSyncTimeoutRef.current) clearTimeout(nextSyncTimeoutRef.current);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        // Save immediately on unmount
        if (user?.uid) {
          console.log('Saving settings on unmount...');
          const userRef = doc(db, 'users', user.uid);
          setDoc(userRef, {
            autoMonitoring: {
              isEnabled: currentStateRef.current.isEnabled,
              isStatusEnabled: currentStateRef.current.isStatusEnabled,
              syncInterval: currentStateRef.current.syncInterval,
              lastSync: currentStateRef.current.lastSync?.toISOString() || null,
              lastStatusUpdate: currentStateRef.current.lastStatusUpdate?.toISOString() || null,
              updatedAt: new Date().toISOString()
            }
          }, { merge: true }).catch(error => console.error('Error saving on unmount:', error));
        }
      }
    };
  }, [user]);

  // Auto-sync logic
  useEffect(() => {
    if ((isEnabled || isStatusEnabled) && isGmailConnected) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  }, [isEnabled, isStatusEnabled, isGmailConnected, syncInterval]);

  const startAutoSync = () => {
    console.log(`🔄 Starting auto-sync every ${syncInterval} minutes`);
    
    // Clear existing interval
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    // Set up recurring sync
    intervalRef.current = setInterval(() => {
      performAutomatedTasks();
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

  const performAutomatedTasks = async () => {
    const tasks = [];
    
    // Add email sync task if enabled
    if (isEnabled) {
      tasks.push(performSync());
    }
    
    // Add status update task if enabled
    if (isStatusEnabled && purchases.length > 0) {
      tasks.push(performStatusUpdate());
    }
    
    // Run tasks in parallel
    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
      updateNextSyncTime();
    }
  };

  const performSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    console.log('🔄 AUTO-SYNC: Performing automatic email sync...');
    
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
        const syncTime = new Date();
        setLastSync(syncTime);
        onNewPurchases?.(newCount);
        saveSettings({
          isEnabled,
          isStatusEnabled,
          syncInterval,
          lastSync: syncTime,
          lastStatusUpdate
        });
        
        // Show brief notification if new purchases found
        if (newCount > 0) {
          console.log(`🎉 AUTO-SYNC: ${newCount} new purchases detected`);
        }
      } else {
        console.error('❌ AUTO-SYNC: Email sync failed with status:', response.status);
      }
    } catch (error) {
      console.error('❌ AUTO-SYNC: Email sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const performStatusUpdate = async () => {
    if (isUpdatingStatus || purchases.length === 0) return;
    
    setIsUpdatingStatus(true);
    console.log('🔄 AUTO-STATUS: Performing automatic status update...');
    
    try {
      const orderNumbers = purchases.map(p => p.orderNumber).filter(Boolean);
      
      const response = await fetch('/api/gmail/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderNumbers })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.updatedOrders.length > 0) {
          console.log(`✅ AUTO-STATUS: Updated ${data.updatedOrders.length} order statuses`);
          const updateTime = new Date();
          setLastStatusUpdate(updateTime);
          onStatusUpdate?.(data.updatedOrders);
          onAutoStatusChange?.(isStatusEnabled, updateTime);
          saveSettings({
            isEnabled,
            isStatusEnabled,
            syncInterval,
            lastSync,
            lastStatusUpdate: updateTime
          });
          
          console.log(`🎉 AUTO-STATUS: ${data.updatedOrders.length} status updates applied`);
        } else {
          console.log(`ℹ️ AUTO-STATUS: No status updates needed`);
          const updateTime = new Date();
          setLastStatusUpdate(updateTime);
          onAutoStatusChange?.(isStatusEnabled, updateTime);
          saveSettings({
            isEnabled,
            isStatusEnabled,
            syncInterval,
            lastSync,
            lastStatusUpdate: updateTime
          });
        }
      } else {
        console.error('❌ AUTO-STATUS: Status update failed with status:', response.status);
      }
    } catch (error) {
      console.error('❌ AUTO-STATUS: Status update error:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleToggle = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    saveSettings({
      isEnabled: newEnabled,
      isStatusEnabled,
      syncInterval,
      lastSync,
      lastStatusUpdate
    }, true); // Save immediately
  };

  const handleStatusToggle = () => {
    const newStatusEnabled = !isStatusEnabled;
    setIsStatusEnabled(newStatusEnabled);
    onAutoStatusChange?.(newStatusEnabled, lastStatusUpdate);
    saveSettings({
      isEnabled,
      isStatusEnabled: newStatusEnabled,
      syncInterval,
      lastSync,
      lastStatusUpdate
    }, true); // Save immediately
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

  // Always show the component, but disable it when Gmail not connected

  return (
    <div className={`rounded-xl overflow-hidden border transition-all duration-300 ${
      currentTheme.name === 'Neon' 
        ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border-white/10 shadow-xl' 
        : 'bg-white border-gray-200 shadow-lg'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b ${
        currentTheme.name === 'Neon'
          ? 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-white/10'
          : 'bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              currentTheme.name === 'Neon'
                ? 'bg-cyan-500/20 ring-2 ring-cyan-500/30'
                : 'bg-blue-100 ring-2 ring-blue-200'
            }`}>
              <RefreshCw className={`w-5 h-5 ${(isSyncing || isUpdatingStatus) ? 'animate-spin' : ''} ${
                currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'
              }`} />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${currentTheme.colors.textPrimary}`}>
                Auto Monitoring
              </h3>
              <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
                {isGmailConnected ? 'Automated email sync & status tracking' : 'Connect Gmail to enable'}
              </p>
            </div>
          </div>
          
          {/* Active/Inactive Badge */}
          <div className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${
            (isEnabled || isStatusEnabled)
              ? currentTheme.name === 'Neon'
                ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 ring-2 ring-green-500/30 shadow-lg shadow-green-500/20'
                : 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 ring-2 ring-green-200'
              : currentTheme.name === 'Neon'
                ? 'bg-white/5 text-gray-400 ring-1 ring-white/20'
                : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
          }`}>
            {(isEnabled || isStatusEnabled) ? '● Active' : '○ Inactive'}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {!isGmailConnected ? (
          <div className={`text-center py-8 ${
            currentTheme.name === 'Neon'
              ? 'bg-white/5 border border-white/10'
              : 'bg-gray-50 border border-gray-200'
          } rounded-lg`}>
            <Mail className={`w-12 h-12 mx-auto mb-3 ${currentTheme.colors.textSecondary}`} />
            <p className={`text-sm font-medium ${currentTheme.colors.textPrimary} mb-1`}>
              Gmail Connection Required
            </p>
            <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
              Connect Gmail above to enable automatic monitoring
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Controls Grid */}
            <div className="grid grid-cols-1 gap-4">
              {/* Auto Email Sync */}
              <div className={`p-4 rounded-lg border transition-all duration-300 ${
                isEnabled
                  ? currentTheme.name === 'Neon'
                    ? 'bg-cyan-500/5 border-cyan-500/30 ring-2 ring-cyan-500/20'
                    : 'bg-blue-50 border-blue-200 ring-2 ring-blue-100'
                  : currentTheme.name === 'Neon'
                    ? 'bg-white/5 border-white/10 hover:border-white/20'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Mail className={`w-4 h-4 ${isEnabled ? (currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600') : currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                      Auto Email Sync
                    </span>
                  </div>
                  <button
                    onClick={handleToggle}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
                      isEnabled 
                        ? currentTheme.name === 'Neon'
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/50'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-lg shadow-blue-500/50'
                        : currentTheme.name === 'Neon'
                          ? 'bg-gray-700'
                          : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                        isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6`}>
                  Automatically fetch new purchase emails
                </p>
              </div>

              {/* Auto Status Updates */}
              <div className={`p-4 rounded-lg border transition-all duration-300 ${
                isStatusEnabled
                  ? currentTheme.name === 'Neon'
                    ? 'bg-yellow-500/5 border-yellow-500/30 ring-2 ring-yellow-500/20'
                    : 'bg-yellow-50 border-yellow-200 ring-2 ring-yellow-100'
                  : currentTheme.name === 'Neon'
                    ? 'bg-white/5 border-white/10 hover:border-white/20'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
              } ${purchases.length === 0 ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Clock className={`w-4 h-4 ${isStatusEnabled ? (currentTheme.name === 'Neon' ? 'text-yellow-400' : 'text-yellow-600') : currentTheme.colors.textSecondary}`} />
                    <span className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>
                      Auto Status Updates
                    </span>
                  </div>
                  <button
                    onClick={handleStatusToggle}
                    disabled={purchases.length === 0}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 ${
                      purchases.length === 0
                        ? 'opacity-50 cursor-not-allowed bg-gray-400'
                        : isStatusEnabled 
                          ? currentTheme.name === 'Neon'
                            ? 'bg-gradient-to-r from-yellow-500 to-orange-500 shadow-lg shadow-yellow-500/50'
                            : 'bg-gradient-to-r from-yellow-500 to-yellow-600 shadow-lg shadow-yellow-500/50'
                          : currentTheme.name === 'Neon'
                            ? 'bg-gray-700'
                            : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
                        isStatusEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className={`text-xs ${currentTheme.colors.textSecondary} ml-6`}>
                  Track delivery status changes automatically
                </p>
              </div>
            </div>

            {/* Interval Selector */}
            {(isEnabled || isStatusEnabled) && (
              <div className={`p-4 rounded-lg border ${
                currentTheme.name === 'Neon'
                  ? 'bg-white/5 border-white/10'
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <label className={`block text-xs font-semibold mb-2 ${currentTheme.colors.textPrimary}`}>
                  Check every:
                </label>
                <select
                  value={syncInterval}
                  onChange={(e) => handleIntervalChange(Number(e.target.value))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                    currentTheme.name === 'Neon'
                      ? 'bg-gray-900 border-white/20 text-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/50'
                      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50'
                  } focus:outline-none`}
                >
                  <option value={5}>⚡ Every 5 minutes</option>
                  <option value={15}>🔄 Every 15 minutes</option>
                  <option value={30}>⏱️ Every 30 minutes</option>
                  <option value={60}>⏰ Every hour</option>
                </select>
              </div>
            )}

            {/* Status Display */}
            {(isEnabled || isStatusEnabled) && (
              <div className={`grid grid-cols-1 gap-3 p-4 rounded-lg border ${
                currentTheme.name === 'Neon'
                  ? 'bg-gradient-to-br from-gray-900/50 to-gray-900/30 border-white/10'
                  : 'bg-gradient-to-br from-gray-50 to-white border-gray-200'
              }`}>
                {/* Email Sync Status */}
                {isEnabled && (
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${currentTheme.colors.textSecondary}`}>
                      Email Sync:
                    </span>
                    <div className="flex items-center gap-2">
                      {isSyncing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                          <span className="text-xs font-semibold text-blue-500">Syncing...</span>
                        </>
                      ) : lastSync ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className={`text-xs font-semibold ${currentTheme.colors.textPrimary}`}>
                            {lastSync.toLocaleTimeString()}
                          </span>
                        </>
                      ) : (
                        <span className={`text-xs font-medium ${currentTheme.colors.textSecondary}`}>
                          Not run yet
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Status Check */}
                {isStatusEnabled && (
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium ${currentTheme.colors.textSecondary}`}>
                      Status Check:
                    </span>
                    <div className="flex items-center gap-2">
                      {isUpdatingStatus ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-yellow-500" />
                          <span className="text-xs font-semibold text-yellow-500">Checking...</span>
                        </>
                      ) : lastStatusUpdate ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className={`text-xs font-semibold ${currentTheme.colors.textPrimary}`}>
                            {lastStatusUpdate.toLocaleTimeString()}
                          </span>
                        </>
                      ) : (
                        <span className={`text-xs font-medium ${currentTheme.colors.textSecondary}`}>
                          Not run yet
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Next Check */}
                <div className={`flex items-center justify-between pt-3 border-t ${
                  currentTheme.name === 'Neon' ? 'border-white/10' : 'border-gray-200'
                }`}>
                  <span className={`text-xs font-medium ${currentTheme.colors.textSecondary}`}>
                    Next check:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Clock className={`w-3.5 h-3.5 ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`} />
                    <span className={`text-xs font-semibold ${currentTheme.name === 'Neon' ? 'text-cyan-400' : 'text-blue-600'}`}>
                      {getTimeUntilNextSync()}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoEmailSync;