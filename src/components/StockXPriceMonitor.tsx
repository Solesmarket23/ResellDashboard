'use client';

import React, { useState } from 'react';
import { Monitor, Plus, Bell, TrendingUp, TrendingDown, Target } from 'lucide-react';

const StockXPriceMonitor = () => {
  const [watchlist] = useState([
    {
      id: '1',
      name: 'Air Jordan 1 High OG "Chicago"',
      currentPrice: 2500,
      targetPrice: 2200,
      change: 12.5,
      alert: true
    }
  ]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Price Monitor</h1>
          <p className="text-gray-400">Track price changes and set alerts</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg">
          <Plus className="w-4 h-4" />
          Add Watch
        </button>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Price Watchlist</h3>
        <div className="space-y-4">
          {watchlist.map(item => (
            <div key={item.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-white">{item.name}</h4>
                  <p className="text-sm text-gray-400">Target: ${item.targetPrice}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">${item.currentPrice}</p>
                    <p className="text-sm text-green-400">+{item.change}%</p>
                  </div>
                  <Bell className="w-5 h-5 text-yellow-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StockXPriceMonitor; 