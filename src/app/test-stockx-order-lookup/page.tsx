'use client';

import { useState } from 'react';

type LookupResult = {
  success: boolean;
  orderNumber?: string;
  status?: string | null;
  paidOut?: boolean;
  payout?: number | null;
  payoutDate?: string | null;
  salePrice?: number | null;
  fees?: number | null;
  currency?: string;
  productName?: string | null;
  trackingNumber?: string | null;
  shippingUrl?: string | null;
  raw?: unknown;
  error?: string;
  authRequired?: boolean;
  message?: string;
};

export default function TestStockXOrderLookupPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [includeRaw, setIncludeRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);

  const runLookup = async () => {
    const trimmed = orderNumber.trim();
    if (!trimmed) return;

    setLoading(true);
    setResult(null);

    try {
      const params = new URLSearchParams({ orderNumber: trimmed });
      if (includeRaw) params.set('raw', '1');
      const res = await fetch(`/api/stockx/order-lookup?${params.toString()}`);
      const data: LookupResult = await res.json();

      if (!res.ok) {
        setResult({ ...data, success: false });
        return;
      }

      setResult(data);
    } catch (e) {
      setResult({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <a
            href="https://solesmarket.com/dashboard"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            ← Dashboard
          </a>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          StockX order lookup
        </h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Plug in a StockX order number to see payout status, payout amount, and
          shipping/tracking URL (JSON). Requires StockX auth.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[200px]">
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Order number
            </span>
            <input
              type="text"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runLookup()}
              placeholder="e.g. 06-XXXXX"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white placeholder-gray-500"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={includeRaw}
              onChange={(e) => setIncludeRaw(e.target.checked)}
            />
            Include raw API response
          </label>
          <button
            type="button"
            onClick={runLookup}
            disabled={loading || !orderNumber.trim()}
            className="rounded bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Looking up…' : 'Look up'}
          </button>
        </div>

        {result?.authRequired && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/30 p-4 text-amber-800 dark:text-amber-200">
            <p className="font-medium">StockX sign-in required</p>
            <p className="text-sm mt-1">{result.message}</p>
            <a
              href="/api/stockx/auth?returnTo=/test-stockx-order-lookup"
              className="inline-block mt-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
            >
              Sign in with StockX →
            </a>
          </div>
        )}

        {result && !result.authRequired && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span
                className={
                  result.success
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : 'text-red-600 dark:text-red-400 font-medium'
                }
              >
                {result.success ? 'Success' : 'Error'}
              </span>
              {result.success && result.paidOut != null && (
                <span
                  className={
                    result.paidOut
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }
                >
                  {result.paidOut ? 'Paid out' : 'Not paid out'}
                </span>
              )}
            </div>
            <div className="p-4 space-y-2 text-sm">
              {result.success && (
                <>
                  {result.orderNumber && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Order:</span>{' '}
                      {result.orderNumber}
                    </p>
                  )}
                  {result.status != null && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Status:</span>{' '}
                      {result.status}
                    </p>
                  )}
                  {result.payout != null && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Payout:</span>{' '}
                      {result.currency || 'USD'} {Number(result.payout).toFixed(2)}
                    </p>
                  )}
                  {result.payoutDate && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Payout date:</span>{' '}
                      {result.payoutDate}
                    </p>
                  )}
                  {result.shippingUrl && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Shipping URL:</span>{' '}
                      <a
                        href={result.shippingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                      >
                        {result.shippingUrl}
                      </a>
                    </p>
                  )}
                  {result.trackingNumber && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Tracking #:</span>{' '}
                      {result.trackingNumber}
                    </p>
                  )}
                  {result.productName && (
                    <p>
                      <span className="text-gray-500 dark:text-gray-400">Product:</span>{' '}
                      {result.productName}
                    </p>
                  )}
                </>
              )}
              {result.error && (
                <p className="text-red-600 dark:text-red-400">{result.error}</p>
              )}
            </div>
            <pre className="p-4 bg-gray-100 dark:bg-gray-900 text-xs overflow-auto max-h-96 border-t border-gray-200 dark:border-gray-700">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <p className="text-gray-500 dark:text-gray-400 text-xs">
          API: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">GET /api/stockx/order-lookup?orderNumber=06-XXXXX</code>
          {' '}(add <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">raw=1</code> for full StockX response).
        </p>
      </div>
    </div>
  );
}
