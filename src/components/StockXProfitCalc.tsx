'use client';

import React, { useState } from 'react';
import { Calculator, DollarSign, Percent, TrendingUp } from 'lucide-react';

const StockXProfitCalc = () => {
  const [purchasePrice, setPurchasePrice] = useState(200);
  const [sellPrice, setSellPrice] = useState(350);
  const [fees] = useState(12.5); // StockX fee percentage

  const calculateProfit = () => {
    const feeAmount = (sellPrice * fees) / 100;
    const profit = sellPrice - purchasePrice - feeAmount;
    const margin = purchasePrice > 0 ? (profit / purchasePrice) * 100 : 0;
    
    return {
      profit,
      margin,
      feeAmount,
      netAmount: sellPrice - feeAmount
    };
  };

  const calc = calculateProfit();

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Enhanced Profit Calculator</h1>
          <p className="text-gray-400">Calculate profits with real-time StockX data</p>
        </div>
        <Calculator className="w-8 h-8 text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <h3 className="text-xl font-bold text-white mb-4">Calculator</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Purchase Price</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Sell Price</label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2 rounded-lg bg-slate-700/60 text-white border border-slate-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">StockX Fee ({fees}%)</label>
              <input
                type="number"
                value={fees}
                disabled
                className="w-full px-4 py-2 rounded-lg bg-slate-600/30 text-gray-400 border border-slate-500/50"
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-xl p-6 border border-cyan-500/30">
          <h3 className="text-xl font-bold text-white mb-4">Results</h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Fee Amount</span>
                <span className="text-white font-semibold">${calc.feeAmount.toFixed(2)}</span>
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Net Amount</span>
                <span className="text-white font-semibold">${calc.netAmount.toFixed(2)}</span>
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Profit</span>
                <span className={`font-bold text-xl ${calc.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${calc.profit.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Profit Margin</span>
                <span className={`font-bold text-xl ${calc.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calc.margin.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockXProfitCalc; 