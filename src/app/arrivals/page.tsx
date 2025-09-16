'use client';

import React from 'react';
import DeliveryArrivalDashboard from '../../components/DeliveryArrivalDashboard';

const ArrivalsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8">
        <DeliveryArrivalDashboard />
      </div>
    </div>
  );
};

export default ArrivalsPage;
