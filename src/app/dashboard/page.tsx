'use client';

import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from '../../components/Dashboard';
import Purchases from '../../components/Purchases';
import Sales from '../../components/Sales';
import FailedVerifications from '../../components/FailedVerifications';
import ProfitCalculator from '../../components/ProfitCalculator';
import AudioPreview from '../../components/AudioPreview';
import MarketAlerts from '../../components/MarketAlerts';
import Plans from '../../components/Plans';
import Profile from '../../components/Profile';
import FAQ from '../../components/FAQ';
import FeatureRequests from '../../components/FeatureRequests';
import { useTheme } from '../../lib/contexts/ThemeContext';

export default function DashboardPage() {
  const [activeItem, setActiveItem] = useState('dashboard');
  const { currentTheme } = useTheme();
  
  // Dynamic theme detection for consistent background
  const isNeon = currentTheme.name === 'Neon';

  const handleItemClick = (item: string) => {
    setActiveItem(item);
  };

  const renderContent = () => {
    switch (activeItem) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Inventory</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Inventory management coming soon...</p>
          </div>
        );
      case 'purchases':
        return <Purchases />;
      case 'sales':
        return <Sales />;
      case 'failed-verifications':
        return <FailedVerifications />;
      case 'profit-calculator':
        return <ProfitCalculator />;
      case 'profile':
        return <Profile />;
      case 'price-tracker':
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Price Tracker</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Track sneaker prices across multiple platforms in real-time. Set alerts for price drops and monitor market trends. Coming soon...</p>
          </div>
        );
      case 'flip-finder':
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Flip Finder</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>AI-powered tool to identify profitable flip opportunities. Analyze market data, predict trends, and discover undervalued sneakers. Coming soon...</p>
          </div>
        );
      case 'market-alerts':
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <MarketAlerts />
          </div>
        );
      case 'loss-tracker':
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>Loss Tracker</h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>Monitor and analyze your losses to improve future decisions. Track patterns, identify risk factors, and learn from unsuccessful flips. Coming soon...</p>
          </div>
        );
      case 'audio-preview':
        return (
          <div className={`flex-1 ${currentTheme.colors.background}`}>
            <AudioPreview />
          </div>
        );
      case 'plans':
        return <Plans />;
      case 'feature-requests':
        return <FeatureRequests />;
      case 'faq':
        return <FAQ />;
      default:
        return (
          <div className={`flex-1 p-8 ${currentTheme.colors.background}`}>
            <h1 className={`text-3xl font-bold ${
              isNeon ? 'text-white' : 'text-gray-900'
            }`}>
              {activeItem.charAt(0).toUpperCase() + activeItem.slice(1).replace('-', ' ')}
            </h1>
            <p className={`mt-4 ${
              isNeon ? 'text-slate-400' : 'text-gray-600'
            }`}>This section is coming soon...</p>
          </div>
        );
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden ${currentTheme.colors.background}`}>
      <Sidebar activeItem={activeItem} onItemClick={handleItemClick} />
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
} 