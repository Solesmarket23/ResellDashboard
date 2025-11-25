'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Clock, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface RepricingConfig {
  strategy: string;
  intervalMinutes: number;
  competitiveBuffer?: number;
  maxReduction?: number;
  minProfitMargin?: number;
  maxDaysListed?: number;
  enabled: boolean;
}

export default function AutoRepricingSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [isEnabled, setIsEnabled] = useState(false);
  const [config, setConfig] = useState<RepricingConfig>({
    strategy: 'competitive',
    intervalMinutes: 5,
    competitiveBuffer: 1,
    maxReduction: 20,
    minProfitMargin: 5,
    enabled: true
  });
  const [lastRepricedAt, setLastRepricedAt] = useState<string | null>(null);

  // Interval presets
  const intervalPresets = [
    { value: 5, label: '5 minutes', description: 'Very aggressive - Maximum responsiveness' },
    { value: 15, label: '15 minutes', description: 'Aggressive - Quick market adaptation' },
    { value: 30, label: '30 minutes', description: 'Moderate - Balanced approach' },
    { value: 60, label: '1 hour', description: 'Conservative - Stable pricing' },
    { value: 120, label: '2 hours', description: 'Very conservative - Minimal changes' },
  ];

  useEffect(() => {
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setIsEnabled(userData.stockxAutoRepricingEnabled || false);
        
        if (userData.stockxAutoRepricingConfig) {
          setConfig(userData.stockxAutoRepricingConfig);
        }
        
        if (userData.lastRepricedAt) {
          setLastRepricedAt(userData.lastRepricedAt);
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!user) return;

    try {
      setSaving(true);
      setMessage(null);

      await updateDoc(doc(db, 'users', user.uid), {
        stockxAutoRepricingEnabled: isEnabled,
        stockxAutoRepricingConfig: config,
        updatedAt: new Date().toISOString()
      });

      setMessage({ type: 'success', text: 'Settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const updateInterval = (minutes: number) => {
    setConfig({ ...config, intervalMinutes: minutes });
  };

  const formatLastRepriced = () => {
    if (!lastRepricedAt) return 'Never';
    
    const date = new Date(lastRepricedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  const getNextRepricingTime = () => {
    if (!lastRepricedAt || !isEnabled) return 'Not scheduled';
    
    const lastDate = new Date(lastRepricedAt);
    const nextDate = new Date(lastDate.getTime() + config.intervalMinutes * 60000);
    const now = new Date();
    
    if (nextDate <= now) return 'Due now';
    
    const diffMs = nextDate.getTime() - now.getTime();
    const diffMins = Math.ceil(diffMs / 60000);
    
    if (diffMins < 60) return `In ${diffMins} minutes`;
    return `In ${Math.ceil(diffMins / 60)} hours`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-cyan-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">Auto-Repricing Settings</h2>
              <p className="text-slate-400 text-sm">Control how often your listings are automatically repriced</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">Auto-Repricing:</span>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-cyan-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Status */}
        {isEnabled && (
          <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-slate-700/50 rounded-lg">
            <div>
              <p className="text-slate-400 text-sm">Last Repriced</p>
              <p className="text-white font-medium">{formatLastRepriced()}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Next Repricing</p>
              <p className="text-cyan-400 font-medium">{getNextRepricingTime()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Interval Selection */}
      {isEnabled && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Repricing Interval</h3>
          <p className="text-slate-400 text-sm mb-6">
            Choose how frequently your listings should be automatically repriced. More frequent intervals respond faster to market changes but may use more API calls.
          </p>

          <div className="space-y-3">
            {intervalPresets.map((preset) => (
              <button
                key={preset.value}
                onClick={() => updateInterval(preset.value)}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  config.intervalMinutes === preset.value
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-700/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className={`w-4 h-4 ${
                        config.intervalMinutes === preset.value ? 'text-cyan-400' : 'text-slate-400'
                      }`} />
                      <span className="font-medium text-white">{preset.label}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{preset.description}</p>
                  </div>
                  {config.intervalMinutes === preset.value && (
                    <CheckCircle className="w-5 h-5 text-cyan-400" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Custom Interval */}
          <div className="mt-4 p-4 bg-slate-700/30 rounded-lg">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Custom Interval (minutes)
            </label>
            <input
              type="number"
              min="5"
              max="1440"
              value={config.intervalMinutes}
              onChange={(e) => updateInterval(parseInt(e.target.value) || 5)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
            <p className="text-xs text-slate-400 mt-2">
              Min: 5 minutes, Max: 24 hours (1440 minutes)
            </p>
          </div>
        </div>
      )}

      {/* Current Strategy Info */}
      {isEnabled && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold text-white mb-4">Current Strategy</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Strategy</p>
              <p className="text-white font-medium capitalize">{config.strategy}</p>
            </div>
            {config.competitiveBuffer && (
              <div>
                <p className="text-slate-400 text-sm">Buffer</p>
                <p className="text-white font-medium">${config.competitiveBuffer}</p>
              </div>
            )}
            {config.maxReduction && (
              <div>
                <p className="text-slate-400 text-sm">Max Reduction</p>
                <p className="text-white font-medium">{config.maxReduction}%</p>
              </div>
            )}
            {config.minProfitMargin && (
              <div>
                <p className="text-slate-400 text-sm">Min Profit</p>
                <p className="text-white font-medium">{config.minProfitMargin}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex items-center justify-between">
        <div>
          {message && (
            <div className={`flex items-center gap-2 ${
              message.type === 'success' ? 'text-green-400' : 'text-red-400'
            }`}>
              {message.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="text-sm">{message.text}</span>
            </div>
          )}
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}

