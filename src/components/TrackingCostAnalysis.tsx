'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, CheckCircle, AlertCircle, Lightbulb } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { hybridTrackingService } from '../lib/tracking/hybridTrackingService';

const TrackingCostAnalysis: React.FC = () => {
  const { currentTheme } = useTheme();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCostAnalysis();
  }, []);

  const loadCostAnalysis = () => {
    const costAnalysis = hybridTrackingService.getCostAnalysis();
    setAnalysis(costAnalysis);
    setLoading(false);
  };

  const getCostColor = (cost: number) => {
    if (cost === 0) return 'text-green-600';
    if (cost < 100) return 'text-yellow-600';
    if (cost < 500) return 'text-orange-600';
    return 'text-red-600';
  };

  const getSavingsColor = (savings: number) => {
    if (savings > 0) return 'text-green-600';
    if (savings < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
        <div className="flex items-center justify-center">
          <div className={`w-6 h-6 border-2 border-transparent border-t-current rounded-full animate-spin ${currentTheme.colors.accent}`}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${currentTheme.colors.cardBackground} rounded-lg p-6 border ${currentTheme.colors.border}`}>
      <div className="flex items-center gap-2 mb-6">
        <DollarSign className="w-6 h-6 text-green-600" />
        <h3 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>
          Tracking Cost Analysis
        </h3>
      </div>

      {/* Current Usage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
              Monthly Requests
            </span>
          </div>
          <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
            {analysis?.currentUsage.totalRequests || 0}
          </p>
          <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
            {analysis?.currentUsage.freeTierRemaining || 0} free requests remaining
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
              High-Value Shipments
            </span>
          </div>
          <p className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>
            {analysis?.currentUsage.highValueShipments || 0}
          </p>
          <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
            Premium tracking recommended
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
              Current Cost
            </span>
          </div>
          <p className={`text-2xl font-bold ${getCostColor(analysis?.costBreakdown.currentCost || 0)}`}>
            ${analysis?.costBreakdown.currentCost || 0}/month
          </p>
          <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
            AfterShip free tier
          </p>
        </div>
      </div>

      {/* Cost Projections */}
      <div className="mb-6">
        <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-4`}>
          Cost Projections
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                Full Premium Cost
              </span>
            </div>
            <p className={`text-xl font-bold ${getCostColor(analysis?.costBreakdown.projectedMonthlyCost || 0)}`}>
              ${analysis?.costBreakdown.projectedMonthlyCost || 0}/month
            </p>
            <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
              If all requests used FedEx Advanced
            </p>
          </div>

          <div className={`p-4 rounded-lg border ${currentTheme.colors.border}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span className={`text-sm font-medium ${currentTheme.colors.textSecondary}`}>
                Hybrid Savings
              </span>
            </div>
            <p className={`text-xl font-bold ${getSavingsColor(analysis?.costBreakdown.savings || 0)}`}>
              ${Math.abs(analysis?.costBreakdown.savings || 0)}/month
            </p>
            <p className={`text-xs ${currentTheme.colors.textSecondary}`}>
              {analysis?.costBreakdown.savings > 0 ? 'Savings with hybrid approach' : 'Additional cost with hybrid approach'}
            </p>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mb-6">
        <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-4`}>
          Recommendations
        </h4>
        
        <div className="space-y-3">
          {analysis?.recommendations.map((recommendation: string, index: number) => (
            <div key={index} className={`p-3 rounded-lg border-l-4 ${
              recommendation.startsWith('✅') ? 'border-green-500 bg-green-50' :
              recommendation.startsWith('💡') ? 'border-blue-500 bg-blue-50' :
              recommendation.startsWith('🚀') ? 'border-purple-500 bg-purple-50' :
              recommendation.startsWith('⭐') ? 'border-yellow-500 bg-yellow-50' :
              'border-gray-500 bg-gray-50'
            }`}>
              <div className="flex items-start gap-2">
                {recommendation.startsWith('✅') && <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />}
                {recommendation.startsWith('💡') && <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5" />}
                {recommendation.startsWith('🚀') && <TrendingUp className="w-4 h-4 text-purple-600 mt-0.5" />}
                {recommendation.startsWith('⭐') && <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />}
                <p className={`text-sm ${currentTheme.colors.textPrimary}`}>
                  {recommendation}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FedEx Advanced Pricing Reference */}
      <div className={`p-4 rounded-lg border ${currentTheme.colors.border} bg-gray-50`}>
        <h4 className={`text-md font-medium ${currentTheme.colors.textPrimary} mb-3`}>
          FedEx Advanced Integrated Visibility Pricing
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className={`font-medium ${currentTheme.colors.textPrimary} mb-2`}>Monthly Tiers:</p>
            <ul className={`space-y-1 ${currentTheme.colors.textSecondary}`}>
              <li>1-7,500: $199/month</li>
              <li>7,501-30,000: $599/month</li>
              <li>30,001-50,000: $999/month</li>
              <li>50,001-75,000: $1,499/month</li>
              <li>75,000+: $0.02 per track</li>
            </ul>
          </div>
          
          <div>
            <p className={`font-medium ${currentTheme.colors.textPrimary} mb-2`}>Features:</p>
            <ul className={`space-y-1 ${currentTheme.colors.textSecondary}`}>
              <li>• Real-time webhooks</li>
              <li>• Picture proof of delivery</li>
              <li>• GPS coordinates</li>
              <li>• Exception notifications</li>
              <li>• Branded tracking pages</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mt-6">
        <button
          onClick={loadCostAnalysis}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
        >
          Refresh Analysis
        </button>
        <button
          onClick={() => window.open('/api/tracking/webhooks', '_blank')}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
        >
          Setup Webhooks
        </button>
      </div>
    </div>
  );
};

export default TrackingCostAnalysis;
