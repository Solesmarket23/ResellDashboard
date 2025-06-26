'use client';

import { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Dashboard from '../components/Dashboard';
import Purchases from '../components/Purchases';
import Sales from '../components/Sales';
import FailedVerifications from '../components/FailedVerifications';

export default function Home() {
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
