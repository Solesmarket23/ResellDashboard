'use client';

import React, { useState } from 'react';
import { LineChart, TrendingUp, TrendingDown, BarChart3, Activity } from 'lucide-react';

const StockXTrends = () => {
  const [trends] = useState([
    { category: 'Jordan', change: 15.2, volume: 1250 },
    { category: 'Yeezy', change: -8.3, volume: 890 },
    { category: 'Dunk', change: 22.1, volume: 650 },
    { category: 'Off-White', change: 5.7, volume: 320 }
  ]);

  const getTrendColor = (change: number) => {
    return change > 0 ? 'text-green-400' : 'text-red-400';
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Market Trends</h1>
          <p className="text-gray-400">Analyze market performance and trends</p>
        </div>
        <LineChart className="w-8 h-8 text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Market Cap</p>
              <p className="text-2xl font-bold text-white">$2.4B</p>
            </div>
            <BarChart3 className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Daily Volume</p>
              <p className="text-2xl font-bold text-white">3,210</p>
            </div>
            <Activity className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Top Gainer</p>
              <p className="text-2xl font-bold text-green-400">Dunk +22%</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Category Performance</h3>
        <div className="space-y-4">
          {trends.map((trend, index) => (
            <div key={index} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-white">{trend.category}</h4>
                  <p className="text-sm text-gray-400">Volume: {trend.volume} sales</p>
                </div>
                <div className="text-right">
                  <p className={`text-xl font-bold ${getTrendColor(trend.change)}`}>
                    {trend.change > 0 ? '+' : ''}{trend.change}%
                  </p>
                  {trend.change > 0 ? 
                    <TrendingUp className="w-5 h-5 text-green-400 ml-auto" /> : 
                    <TrendingDown className="w-5 h-5 text-red-400 ml-auto" />
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StockXTrends; 