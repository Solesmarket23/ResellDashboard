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

export default function DashboardPage() {
  const [activeItem, setActiveItem] = useState('dashboard');

  const handleItemClick = (item: string) => {
    setActiveItem(item);
  };

  const renderContent = () => {
    switch (activeItem) {
      case 'dashboard':
        return <Dashboard />;
      case 'inventory':
        return (
          <div className="flex-1 bg-gray-50 p-8">
            <h1 className="text-3xl font-bold text-gray-900">Inventory</h1>
            <p className="text-gray-600 mt-4">Inventory management coming soon...</p>
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
          <div className="flex-1 bg-gray-50 p-8">
            <h1 className="text-3xl font-bold text-gray-900">Price Tracker</h1>
            <p className="text-gray-600 mt-4">Track sneaker prices across multiple platforms in real-time. Set alerts for price drops and monitor market trends. Coming soon...</p>
          </div>
        );
      case 'flip-finder':
        return (
          <div className="flex-1 bg-gray-50 p-8">
            <h1 className="text-3xl font-bold text-gray-900">Flip Finder</h1>
            <p className="text-gray-600 mt-4">AI-powered tool to identify profitable flip opportunities. Analyze market data, predict trends, and discover undervalued sneakers. Coming soon...</p>
          </div>
        );
      case 'market-alerts':
        return (
          <div className="flex-1 bg-gray-50 p-8">
            <MarketAlerts />
          </div>
        );
      case 'loss-tracker':
        return (
          <div className="flex-1 bg-gray-50 p-8">
            <h1 className="text-3xl font-bold text-gray-900">Loss Tracker</h1>
            <p className="text-gray-600 mt-4">Monitor and analyze your losses to improve future decisions. Track patterns, identify risk factors, and learn from unsuccessful flips. Coming soon...</p>
          </div>
        );
      case 'audio-preview':
        return (
          <div className="flex-1 bg-gray-50">
            <AudioPreview />
          </div>
        );
      case 'plans':
        return <Plans />;
      default:
        return (
          <div className="flex-1 bg-gray-50 p-8">
            <h1 className="text-3xl font-bold text-gray-900">
              {activeItem.charAt(0).toUpperCase() + activeItem.slice(1).replace('-', ' ')}
            </h1>
            <p className="text-gray-600 mt-4">This section is coming soon...</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeItem={activeItem} onItemClick={handleItemClick} />
      {renderContent()}
    </div>
  );
} 