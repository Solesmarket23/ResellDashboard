'use client';

import { useMemo, useState } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';

type TraceResponse = {
  success: boolean;
  error?: string;
  userId?: string;
  orderNumber?: string;
  purchases?: any[];
  trace?: Array<{ step: string; ok: boolean; details: any }>;
  recommendations?: string[];
};

export default function OrderStatusTracePage() {
  const { currentTheme } = useTheme();
  const [orderNumber, setOrderNumber] = useState('');
  const [deep, setDeep] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<TraceResponse | null>(null);

  const canRun = useMemo(() => orderNumber.trim().length > 0 && !isLoading, [orderNumber, isLoading]);

  const run = async () => {
    const order = orderNumber.trim();
    if (!order) return;

    setIsLoading(true);
    setData(null);
    try {
      const params = new URLSearchParams({ orderNumber: order });
      if (deep) params.set('deep', '1');

      const res = await fetch(`/api/debug/order-status-trace?${params.toString()}`, { method: 'GET' });
      const json = (await res.json()) as TraceResponse;
      setData(json);
    } catch (e: any) {
      setData({ success: false, error: e?.message || String(e) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${currentTheme.colors.background} p-6`}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className={`${currentTheme.colors.card} rounded-lg p-6`}>
          <h1 className={`text-2xl font-bold ${currentTheme.colors.textPrimary}`}>Order Status “Why” Debugger</h1>
          <p className={`${currentTheme.colors.textSecondary} mt-2`}>
            Enter a purchase order number (e.g. <span className="font-mono">01-XXXX</span>) to see why it is (or isn’t)
            marked as Shipped/Delivered.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className={`block text-sm ${currentTheme.colors.textSecondary} mb-1`}>Order number</label>
              <input
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="01-3KF7CE560J"
                className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end gap-3">
              <button
                onClick={run}
                disabled={!canRun}
                className={`${
                  currentTheme.name === 'Neon'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600'
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white px-5 py-2 rounded-md font-medium transition-all disabled:opacity-50`}
              >
                {isLoading ? 'Running…' : 'Explain status'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              id="deep"
              type="checkbox"
              checked={deep}
              onChange={(e) => setDeep(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="deep" className={`${currentTheme.colors.textSecondary} text-sm`}>
              Deep check: search Gmail for this order number and show what was parsed (slower)
            </label>
          </div>
        </div>

        {data && (
          <div className={`${currentTheme.colors.card} rounded-lg p-6 space-y-6`}>
            {!data.success ? (
              <div>
                <h2 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Error</h2>
                <div className="mt-2 rounded bg-black/40 p-3 font-mono text-sm text-red-300">
                  {data.error || 'Unknown error'}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className={`text-lg font-semibold ${currentTheme.colors.textPrimary}`}>Result</h2>
                  <div className={`${currentTheme.colors.textSecondary} mt-1 text-sm`}>
                    Order: <span className="font-mono">{data.orderNumber}</span>
                  </div>
                  {Array.isArray(data.purchases) && (
                    <div className={`${currentTheme.colors.textSecondary} mt-1 text-sm`}>
                      Purchases matched: <span className="font-mono">{data.purchases.length}</span>
                    </div>
                  )}
                </div>

                {Array.isArray(data.recommendations) && data.recommendations.length > 0 && (
                  <div>
                    <h3 className={`text-md font-semibold ${currentTheme.colors.textPrimary}`}>Recommendations</h3>
                    <ul className={`mt-2 list-disc list-inside ${currentTheme.colors.textSecondary} space-y-1`}>
                      {data.recommendations.map((r, idx) => (
                        <li key={idx}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(data.trace) && data.trace.length > 0 && (
                  <div>
                    <h3 className={`text-md font-semibold ${currentTheme.colors.textPrimary}`}>Trace</h3>
                    <div className="mt-3 space-y-3">
                      {data.trace.map((t, idx) => (
                        <div key={idx} className="rounded border border-white/10 bg-black/30 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-mono text-sm text-white/90">{t.step}</div>
                            <div
                              className={`text-xs font-semibold ${
                                t.ok ? 'text-green-300' : 'text-yellow-300'
                              }`}
                            >
                              {t.ok ? 'OK' : 'CHECK'}
                            </div>
                          </div>
                          <pre className="mt-3 overflow-auto rounded bg-black/40 p-3 text-xs text-white/80">
                            {JSON.stringify(t.details, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

