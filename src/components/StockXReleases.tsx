'use client';

import React, { useState } from 'react';
import { Calendar, Clock, Star, DollarSign } from 'lucide-react';

const StockXReleases = () => {
  const [releases] = useState([
    {
      id: '1',
      name: 'Air Jordan 4 "Black Cat"',
      brand: 'Jordan',
      releaseDate: '2024-07-15',
      retailPrice: 210,
      estimatedResell: 350,
      hype: 'High'
    },
    {
      id: '2',
      name: 'Yeezy Boost 350 V2 "Bone"',
      brand: 'Yeezy',
      releaseDate: '2024-07-22',
      retailPrice: 230,
      estimatedResell: 280,
      hype: 'Medium'
    }
  ]);

  const getHypeColor = (hype: string) => {
    switch (hype) {
      case 'High': return 'text-red-400 bg-red-500/20';
      case 'Medium': return 'text-yellow-400 bg-yellow-500/20';
      case 'Low': return 'text-green-400 bg-green-500/20';
      default: return 'text-gray-400 bg-gray-500/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Release Calendar</h1>
          <p className="text-gray-400">Track upcoming releases and resell potential</p>
        </div>
        <Calendar className="w-8 h-8 text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">This Week</p>
              <p className="text-2xl font-bold text-white">3</p>
            </div>
            <Clock className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">High Hype</p>
              <p className="text-2xl font-bold text-white">5</p>
            </div>
            <Star className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Avg Profit</p>
              <p className="text-2xl font-bold text-green-400">$120</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Upcoming Releases</h3>
        <div className="space-y-4">
          {releases.map(release => (
            <div key={release.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-white">{release.name}</h4>
                  <p className="text-sm text-gray-400">{release.brand} • {release.releaseDate}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-400">Retail</p>
                    <p className="font-bold text-white">${release.retailPrice}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-400">Est. Resell</p>
                    <p className="font-bold text-green-400">${release.estimatedResell}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getHypeColor(release.hype)}`}>
                    {release.hype}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StockXReleases; 