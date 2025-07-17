'use client';

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  Settings,
  ArrowRight,
  Info
} from 'lucide-react';
import UserStockXApiManager from './UserStockXApiManager';
import StockXAuth from './StockXAuth';

interface UserStockXSetupProps {
  userId: string;
  onSetupComplete?: (isComplete: boolean) => void;
}

export default function UserStockXSetup({ userId, onSetupComplete }: UserStockXSetupProps) {
  const [hasApiKeys, setHasApiKeys] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [setupStep, setSetupStep] = useState<'api-keys' | 'auth' | 'complete'>('api-keys');

  useEffect(() => {
    checkSetupStatus();
  }, [userId]);

  const checkSetupStatus = async () => {
    try {
      // Check API key status
      const apiResponse = await fetch(`/api/user/stockx-keys?userId=${userId}&action=status`);
      const apiData = await apiResponse.json();
      
      if (apiData.success && apiData.status.isConfigured) {
        setHasApiKeys(true);
      }

      // Check authentication status
      const authResponse = await fetch('/api/stockx/test');
      const authData = await authResponse.json();
      
      if (authResponse.ok && authData.accessTokenPresent) {
        setIsAuthenticated(true);
      }

      // Determine setup step
      if (apiData.success && apiData.status.isConfigured && authResponse.ok && authData.accessTokenPresent) {
        setSetupStep('complete');
        onSetupComplete?.(true);
      } else if (apiData.success && apiData.status.isConfigured) {
        setSetupStep('auth');
      } else {
        setSetupStep('api-keys');
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
    }
  };

  const handleApiKeysUpdated = (hasKeys: boolean) => {
    setHasApiKeys(hasKeys);
    if (hasKeys) {
      setSetupStep('auth');
    }
  };

  const handleAuthChange = (isAuth: boolean) => {
    setIsAuthenticated(isAuth);
    if (isAuth && hasApiKeys) {
      setSetupStep('complete');
      onSetupComplete?.(true);
    }
  };

  const getSetupProgress = () => {
    const steps = [
      { key: 'api-keys', label: 'API Keys', completed: hasApiKeys },
      { key: 'auth', label: 'Authentication', completed: isAuthenticated }
    ];
    
    const completedSteps = steps.filter(step => step.completed).length;
    return {
      currentStep: setupStep,
      totalSteps: steps.length,
      completedSteps,
      progress: (completedSteps / steps.length) * 100
    };
  };

  const progress = getSetupProgress();

  return (
    <div className="space-y-6">
      {/* Setup Progress Header */}
      <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-6 h-6 text-blue-400" />
          <div>
            <h3 className="text-lg font-semibold text-slate-200">StockX Setup</h3>
            <p className="text-sm text-slate-400">
              Configure your StockX integration for personalized access
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-slate-300 mb-2">
            <span>Setup Progress</span>
            <span>{progress.completedSteps}/{progress.totalSteps} Complete</span>
          </div>
          <div className="w-full bg-slate-700/50 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              hasApiKeys 
                ? 'bg-green-500 text-white' 
                : 'bg-slate-600 text-slate-300'
            }`}>
              {hasApiKeys ? <CheckCircle className="w-4 h-4" /> : '1'}
            </div>
            <span className={`text-sm ${hasApiKeys ? 'text-green-400' : 'text-slate-400'}`}>
              API Keys
            </span>
          </div>

          <ArrowRight className="w-4 h-4 text-slate-500" />

          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              isAuthenticated 
                ? 'bg-green-500 text-white' 
                : 'bg-slate-600 text-slate-300'
            }`}>
              {isAuthenticated ? <CheckCircle className="w-4 h-4" /> : '2'}
            </div>
            <span className={`text-sm ${isAuthenticated ? 'text-green-400' : 'text-slate-400'}`}>
              Authentication
            </span>
          </div>
        </div>
      </div>

      {/* Setup Complete State */}
      {setupStep === 'complete' && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <h4 className="text-green-300 font-semibold text-lg">Setup Complete!</h4>
              <p className="text-green-200">
                Your StockX integration is fully configured and ready to use.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Setup */}
      {setupStep === 'api-keys' && (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-blue-300 font-medium mb-1">Step 1: Configure API Keys</h4>
                <p className="text-blue-200 text-sm">
                  First, you'll need to add your StockX API credentials. This allows you to use your own API access instead of shared credentials.
                </p>
              </div>
            </div>
          </div>
          
          <UserStockXApiManager 
            userId={userId} 
            onKeysUpdated={handleApiKeysUpdated}
          />
        </div>
      )}

      {/* Authentication Setup */}
      {setupStep === 'auth' && (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-blue-300 font-medium mb-1">Step 2: Authenticate with StockX</h4>
                <p className="text-blue-200 text-sm">
                  Now that your API keys are configured, you need to authenticate with your StockX account to access your data.
                </p>
              </div>
            </div>
          </div>
          
          <StockXAuth 
            onAuthChange={handleAuthChange}
            showInstructions={false}
          />
        </div>
      )}

      {/* API Keys Management (when authenticated) */}
      {setupStep === 'complete' && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-slate-400" />
              <div>
                <h4 className="text-slate-300 font-medium">Manage Your API Keys</h4>
                <p className="text-slate-400 text-sm">
                  You can update or remove your API keys at any time.
                </p>
              </div>
            </div>
          </div>
          
          <UserStockXApiManager 
            userId={userId} 
            onKeysUpdated={handleApiKeysUpdated}
          />
        </div>
      )}

      {/* Benefits Information */}
      <div className="bg-slate-900/30 border border-slate-600/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-green-300 font-medium mb-2">Benefits of Personal API Keys</h4>
            <ul className="text-slate-300 text-sm space-y-1">
              <li>• Use your own StockX API access (Level 3+ sellers only)</li>
              <li>• Higher rate limits and better performance</li>
              <li>• Access to your personal sales and inventory data</li>
              <li>• More reliable and consistent API access</li>
              <li>• Your credentials are encrypted and secure</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
} 