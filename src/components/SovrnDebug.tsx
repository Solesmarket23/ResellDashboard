'use client';

import React, { useEffect, useState } from 'react';
import { useSovrn } from '@/lib/hooks/useSovrn';
import { getSovrnService } from '@/lib/sovrn/sovrnAffiliate';

export default function SovrnDebug() {
  const { isInitialized, convertStockXLink } = useSovrn();
  const [service, setService] = useState<any>(null);
  
  useEffect(() => {
    const sovrnService = getSovrnService();
    setService(sovrnService);
  }, [isInitialized]);
  
  const testUrl = 'https://stockx.com/test-product';
  const convertedUrl = convertStockXLink(testUrl);
  
  return (
    <div className="fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg max-w-md text-xs font-mono">
      <h3 className="font-bold mb-2">Sovrn Debug</h3>
      <div className="space-y-1">
        <p>Initialized: {isInitialized ? '✅' : '❌'}</p>
        <p>API Key: {process.env.NEXT_PUBLIC_SOVRN_API_KEY ? `${process.env.NEXT_PUBLIC_SOVRN_API_KEY.substring(0, 8)}...` : '❌ NOT SET'}</p>
        <p>Service: {service ? '✅ Active' : '❌ Not created'}</p>
        <p>Test URL: {testUrl}</p>
        <p>Converted: {convertedUrl === testUrl ? '❌ No conversion' : '✅ ' + convertedUrl.substring(0, 50) + '...'}</p>
        <p>ENV: {process.env.NODE_ENV}</p>
      </div>
    </div>
  );
}