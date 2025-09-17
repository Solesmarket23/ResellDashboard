'use client';

import React from 'react';
import Deliveries from '../../components/Deliveries';

const DeliveriesPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8">
        <Deliveries />
      </div>
    </div>
  );
};

export default DeliveriesPage;

