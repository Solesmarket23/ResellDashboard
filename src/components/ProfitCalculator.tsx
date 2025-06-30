'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { Calculator, DollarSign, TrendingUp, Info, Zap } from 'lucide-react';

const ProfitCalculator = () => {
  const { currentTheme } = useTheme();
  const isPremium = currentTheme.name === 'Premium';
  const isLight = currentTheme.name === 'Light';
  const isRevolutionary = currentTheme.name === 'Premium'; // Revolutionary Creative = Premium theme
  
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [platformFees, setPlatformFees] = useState('10');

  const [results, setResults] = useState({
    grossProfit: 0,
    netProfit: 0,
    totalFees: 0,
    roi: 0
  });

  useEffect(() => {
    const purchase = parseFloat(purchasePrice) || 0;
    const sell = parseFloat(sellPrice) || 0;
    const platform = parseFloat(platformFees) || 0;

    const platformFeeAmount = (sell * platform) / 100;
    const totalFeesAmount = platformFeeAmount;
    
    const grossProfitAmount = sell - purchase;
    const netProfitAmount = sell - purchase - totalFeesAmount;
    const roiAmount = purchase > 0 ? (netProfitAmount / purchase) * 100 : 0;

    setResults({
      grossProfit: grossProfitAmount,
      netProfit: netProfitAmount,
      totalFees: totalFeesAmount,
      roi: roiAmount
    });
  }, [purchasePrice, sellPrice, platformFees]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className={`flex-1 p-8 ${
      isRevolutionary
        ? 'ml-80 bg-slate-900'
        : isPremium 
          ? 'ml-80 bg-slate-900' 
          : isLight 
            ? 'ml-80 bg-gray-50' 
            : 'ml-80 bg-gray-900'
    }`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className={`text-3xl font-bold flex items-center ${
            isPremium 
              ? 'text-premium-gradient' 
              : isLight 
                ? 'text-gray-900' 
                : 'text-white'
          }`}>
            <Calculator className={`w-8 h-8 mr-3 ${
              isPremium 
                ? 'text-purple-400' 
                : isLight 
                  ? 'text-blue-600' 
                  : 'text-blue-400'
            }`} />
            Profit Calculator
          </h1>
          <p className={`mt-2 ${
            isPremium 
              ? 'text-slate-300' 
              : isLight 
                ? 'text-gray-600' 
                : 'text-gray-300'
          }`}>
            Calculate your sneaker flip profits with all fees included
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={`rounded-lg p-6 shadow-sm border ${
          isPremium
            ? 'dark-premium-card'
            : isLight
              ? 'bg-white border-gray-200'
              : 'bg-gray-800 border-gray-700'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 ${
            isPremium 
              ? 'text-white' 
              : isLight 
                ? 'text-gray-900' 
                : 'text-white'
          }`}>
            Input Details
          </h3>
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                Purchase Price
              </label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className={`w-full px-4 py-3 border rounded-lg text-lg focus:ring-2 focus:border-transparent ${
                  isPremium
                    ? 'input-premium'
                    : isLight
                      ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                Sale Price
              </label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.00"
                className={`w-full px-4 py-3 border rounded-lg text-lg focus:ring-2 focus:border-transparent ${
                  isPremium
                    ? 'input-premium'
                    : isLight
                      ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-2 ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                Platform Fees (%)
              </label>
              <input
                type="number"
                value={platformFees}
                onChange={(e) => setPlatformFees(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                  isPremium
                    ? 'input-premium'
                    : isLight
                      ? 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                      : 'bg-gray-700 border-gray-600 text-white focus:ring-blue-500 focus:border-blue-500'
                }`}
              />
            </div>
          </div>
        </div>

        <div className={`rounded-lg p-6 shadow-sm border ${
          isPremium
            ? 'dark-premium-card'
            : isLight
              ? 'bg-white border-gray-200'
              : 'bg-gray-800 border-gray-700'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 ${
            isPremium 
              ? 'text-white' 
              : isLight 
                ? 'text-gray-900' 
                : 'text-white'
          }`}>
            Profit Analysis
          </h3>
          <div className="space-y-4">
            <div className={`flex justify-between items-center p-3 rounded-lg ${
              isPremium
                ? 'bg-slate-800'
                : isLight
                  ? 'bg-gray-50'
                  : 'bg-gray-700'
            }`}>
              <span className={`text-sm font-medium ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                Gross Profit
              </span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(results.grossProfit)}
              </span>
            </div>
            
            <div className={`flex justify-between items-center p-3 rounded-lg border-2 ${
              isPremium
                ? 'bg-slate-800 border-purple-500'
                : isLight
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-700 border-blue-500'
            }`}>
              <span className={`text-sm font-semibold ${
                isPremium 
                  ? 'text-purple-300' 
                  : isLight 
                    ? 'text-blue-900' 
                    : 'text-blue-300'
              }`}>
                Net Profit
              </span>
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(results.netProfit)}
              </span>
            </div>
            
            <div className={`flex justify-between items-center p-3 rounded-lg ${
              isPremium
                ? 'bg-slate-800'
                : isLight
                  ? 'bg-gray-50'
                  : 'bg-gray-700'
            }`}>
              <span className={`text-sm font-medium ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                Total Fees
              </span>
              <span className="text-lg font-semibold text-red-600">
                -{formatCurrency(results.totalFees)}
              </span>
            </div>
            
            <div className={`flex justify-between items-center p-3 rounded-lg ${
              isPremium
                ? 'bg-slate-800'
                : isLight
                  ? 'bg-gray-50'
                  : 'bg-gray-700'
            }`}>
              <span className={`text-sm font-medium ${
                isPremium 
                  ? 'text-slate-300' 
                  : isLight 
                    ? 'text-gray-700' 
                    : 'text-gray-300'
              }`}>
                ROI
              </span>
              <span className="text-lg font-semibold text-green-600">
                {results.roi.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitCalculator;
