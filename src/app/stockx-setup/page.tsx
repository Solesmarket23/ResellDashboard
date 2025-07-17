'use client';

import React, { useState, useEffect } from 'react';
import UserStockXSetup from '@/components/UserStockXSetup';

export default function StockXSetupPage() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    // Get user ID from cookie or generate a test one
    const getUserId = () => {
      const cookies = document.cookie;
      const siteUserIdMatch = cookies.match(/site-user-id=([^;]+)/);
      if (siteUserIdMatch) {
        return decodeURIComponent(siteUserIdMatch[1]);
      }
      // Generate a test user ID for demonstration
      return 'test-user-' + Math.random().toString(36).substring(2, 15);
    };

    setUserId(getUserId());
  }, []);

  const handleSetupComplete = (isComplete: boolean) => {
    console.log('StockX setup complete:', isComplete);
    if (isComplete) {
      alert('StockX setup is complete! You can now use StockX features with your own API credentials.');
    }
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">StockX API Setup</h1>
          <p className="text-slate-400">
            Configure your own StockX API credentials for personalized access to StockX features.
          </p>
          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <p className="text-blue-200 text-sm">
              <strong>User ID:</strong> {userId}
            </p>
          </div>
        </div>

        <UserStockXSetup 
          userId={userId}
          onSetupComplete={handleSetupComplete}
        />

        <div className="mt-8 p-6 bg-slate-800/50 border border-slate-600/50 rounded-lg">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">How It Works</h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-blue-300 font-medium mb-2">For Level 3+ StockX Sellers</h4>
              <ul className="text-slate-300 text-sm space-y-1">
                <li>• Contact StockX to request API access</li>
                <li>• Receive your personal API credentials</li>
                <li>• Enter them in the setup above</li>
                <li>• Use your own API access with higher limits</li>
              </ul>
            </div>
            <div>
              <h4 className="text-green-300 font-medium mb-2">For Other Users</h4>
              <ul className="text-slate-300 text-sm space-y-1">
                <li>• System will use shared API credentials</li>
                <li>• Limited by shared rate limits</li>
                <li>• Basic StockX features available</li>
                <li>• Upgrade to Level 3+ for better access</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 