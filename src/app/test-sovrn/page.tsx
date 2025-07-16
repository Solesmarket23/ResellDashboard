'use client';

import { useState } from 'react';
import { useSovrn } from '@/lib/hooks/useSovrn';

export default function TestSovrnPage() {
  const { isInitialized, convertStockXLink } = useSovrn();
  const [testUrl, setTestUrl] = useState('https://stockx.com/nike-zoom-vomero-5-metallic-gold-womens?size=5.5W');
  const [convertedUrl, setConvertedUrl] = useState('');

  const handleConvert = () => {
    const converted = convertStockXLink(testUrl);
    setConvertedUrl(converted);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Sovrn Affiliate Link Tester</h1>
      
      <div className="bg-gray-100 p-4 rounded mb-6">
        <h2 className="font-semibold mb-2">Status</h2>
        <p>Sovrn Initialized: <span className={isInitialized ? 'text-green-600' : 'text-red-600'}>{isInitialized ? '✅ Yes' : '❌ No'}</span></p>
        <p>API Key: <span className="font-mono">{process.env.NEXT_PUBLIC_SOVRN_API_KEY ? `${process.env.NEXT_PUBLIC_SOVRN_API_KEY.substring(0, 8)}...` : 'NOT FOUND'}</span></p>
      </div>

      <div className="mb-6">
        <label className="block mb-2">Test URL:</label>
        <input
          type="text"
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      <button
        onClick={handleConvert}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 mb-4"
      >
        Convert to Affiliate Link
      </button>

      {convertedUrl && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Converted URL:</h3>
          <div className="bg-gray-100 p-4 rounded break-all">
            <code className="text-sm">{convertedUrl}</code>
          </div>
          
          <div className="mt-4">
            <a
              href={convertedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 text-white px-4 py-2 rounded inline-block hover:bg-green-700"
            >
              Test Converted Link →
            </a>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            <p>Expected format: https://redirect.viglink.com?key=YOUR_KEY&u=ENCODED_URL...</p>
            <p>If you see the original StockX URL, the conversion is not working.</p>
          </div>
        </div>
      )}
    </div>
  );
}