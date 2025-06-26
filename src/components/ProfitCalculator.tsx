'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { Calculator, DollarSign, TrendingUp, Info, Zap } from 'lucide-react';

const ProfitCalculator = () => {
  const { currentTheme } = useTheme();
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
    <div className={`flex-1 ${currentTheme.colors.background} p-8`}>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <Calculator className="w-8 h-8 mr-3 text-blue-600" />
            Profit Calculator
          </h1>
          <p className="text-gray-600 mt-2">Calculate your sneaker flip profits with all fees included</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Input Details</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Price</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sale Price</label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Platform Fees (%)</label>
              <input
                type="number"
                value={platformFees}
                onChange={(e) => setPlatformFees(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 shadow-sm border border-gray-200`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Profit Analysis</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Gross Profit</span>
              <span className="text-lg font-bold text-green-600">
                {formatCurrency(results.grossProfit)}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border-2 border-blue-200">
              <span className="text-sm font-semibold text-blue-900">Net Profit</span>
              <span className="text-xl font-bold text-green-600">
                {formatCurrency(results.netProfit)}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Total Fees</span>
              <span className="text-lg font-semibold text-red-600">
                -{formatCurrency(results.totalFees)}
              </span>
            </div>
            
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">ROI</span>
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
