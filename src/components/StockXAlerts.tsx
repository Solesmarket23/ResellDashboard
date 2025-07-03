'use client';

import React, { useState } from 'react';
import { Bell, Plus, Trash2, Mail, Smartphone, Check } from 'lucide-react';

const StockXAlerts = () => {
  const [alerts] = useState([
    {
      id: '1',
      name: 'Air Jordan 1 "Chicago"',
      type: 'Price Drop',
      condition: 'Below $2200',
      method: 'Email',
      active: true,
      triggered: false
    },
    {
      id: '2',
      name: 'Yeezy 350 V2 "Zebra"',
      type: 'Price Rise',
      condition: 'Above $350',
      method: 'SMS',
      active: true,
      triggered: true
    }
  ]);

  const getStatusColor = (triggered: boolean) => {
    return triggered ? 'text-green-400' : 'text-yellow-400';
  };

  const getMethodIcon = (method: string) => {
    return method === 'Email' ? <Mail className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />;
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Alert System</h1>
          <p className="text-gray-400">Set up automated alerts for price changes and inventory</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg">
          <Plus className="w-4 h-4" />
          New Alert
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Active Alerts</p>
              <p className="text-2xl font-bold text-white">12</p>
            </div>
            <Bell className="w-8 h-8 text-emerald-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Triggered Today</p>
              <p className="text-2xl font-bold text-white">3</p>
            </div>
            <Check className="w-8 h-8 text-green-400" />
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">This Week</p>
              <p className="text-2xl font-bold text-white">15</p>
            </div>
            <Bell className="w-8 h-8 text-yellow-400" />
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Your Alerts</h3>
        <div className="space-y-4">
          {alerts.map(alert => (
            <div key={alert.id} className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-semibold text-white">{alert.name}</h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      alert.triggered ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {alert.triggered ? 'Triggered' : 'Active'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{alert.type} • {alert.condition}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {getMethodIcon(alert.method)}
                    <span className="text-sm text-gray-400">{alert.method}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-blue-400 hover:bg-blue-500/20 rounded">
                    <Bell className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-red-400 hover:bg-red-500/20 rounded">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
        <h3 className="text-xl font-bold text-white mb-4">Create New Alert</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Product name"
            className="px-4 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
          />
          <select className="px-4 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50">
            <option>Price Drop</option>
            <option>Price Rise</option>
            <option>Back in Stock</option>
            <option>New Size Available</option>
          </select>
          <input
            type="text"
            placeholder="Condition (e.g., Below $200)"
            className="px-4 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
          />
          <button className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white rounded-lg">
            Create Alert
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockXAlerts; 