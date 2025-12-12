'use client';

import { useMemo, useRef, useState } from 'react';

interface RepricingTestResult {
  success: boolean;
  results?: Array<{
    listingId: string;
    productName?: string;
    currentPrice: number;
    newPrice: number;
    lowestAsk?: number;
    action: string;
    reason?: string;
    error?: string;
  }>;
  summary?: {
    total: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  error?: string;
}

export default function TestRepricing() {
  const [testMode, setTestMode] = useState<'single' | 'strategy'>('single');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepricingTestResult | null>(null);

  type LogLevel = 'info' | 'warn' | 'error';
  type LogEntry = { ts: string; level: LogLevel; message: string; data?: any };
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const appendLog = (level: LogLevel, message: string, data?: any) => {
    const entry: LogEntry = { ts: new Date().toISOString(), level, message, data };
    setLogs(prev => [...prev, entry]);
    // let React render before scrolling
    setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  };
  const clearLogs = () => setLogs([]);
  const logsText = useMemo(() => {
    return logs
      .map(l => {
        const base = `[${l.ts}] ${l.level.toUpperCase()}: ${l.message}`;
        if (l.data === undefined) return base;
        try {
          return `${base}\n${JSON.stringify(l.data, null, 2)}`;
        } catch {
          return `${base}\n${String(l.data)}`;
        }
      })
      .join('\n\n');
  }, [logs]);

  // Single listing test
  const [pasteBlock, setPasteBlock] = useState('');
  const [listingId, setListingId] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [currentPrice, setCurrentPrice] = useState('100');
  const [lowestAsk, setLowestAsk] = useState('95');
  const [flexLowestAsk, setFlexLowestAsk] = useState('');
  
  // Strategy settings
  const [strategyType, setStrategyType] = useState<'beat_lowest' | 'match_lowest' | 'percentage_below' | 'reset_then_beat_lowest'>('beat_lowest');
  const [strategyValue, setStrategyValue] = useState('1');
  const RESET_PRICE = 999;
  const TWO_STEP_BEAT_BY = 1;
  const [allowTwoStep, setAllowTwoStep] = useState(false);
  const [minPrice, setMinPrice] = useState('80');
  const [maxPrice, setMaxPrice] = useState('150');
  const [dryRun, setDryRun] = useState(true);

  const clampStrategyValue = (raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return '1';
    if (strategyType === 'percentage_below') {
      return String(Math.max(0, Math.min(100, n)));
    }
    // dollar undercut amount must be positive
    return String(Math.max(1, n));
  };

  const parseAndFillIds = (text: string) => {
    const t = text.trim();
    if (!t) return;

    const pick = (key: string) => {
      const re = new RegExp(`${key}\\s*:\\s*([a-zA-Z0-9-_/.:]+)`, 'i');
      const m = t.match(re);
      return m?.[1]?.trim();
    };

    const listing = pick('listingId');
    const product = pick('productId');
    const variant = pick('variantId');
    const marketUrl = pick('marketDataUrl');

    // If marketDataUrl exists, extract IDs from it as a fallback.
    let extractedProduct = product;
    let extractedVariant = variant;
    if (marketUrl) {
      const m = marketUrl.match(/\/products\/([^/]+)\/variants\/([^/]+)\/market-data/i);
      if (m?.[1] && !extractedProduct) extractedProduct = m[1];
      if (m?.[2] && !extractedVariant) extractedVariant = m[2];
    }

    // If the paste is just 3 UUID-ish tokens, accept that too.
    if (!listing && !extractedProduct && !extractedVariant) {
      const tokens = t.split(/\s+/).filter(Boolean);
      if (tokens.length >= 3) {
        setListingId(tokens[0]);
        setProductId(tokens[1]);
        setVariantId(tokens[2]);
        appendLog('info', 'Parsed IDs from tokens', { listingId: tokens[0], productId: tokens[1], variantId: tokens[2] });
        return;
      }
    }

    if (listing) setListingId(listing);
    if (extractedProduct) setProductId(extractedProduct);
    if (extractedVariant) setVariantId(extractedVariant);

    appendLog('info', 'Parsed IDs from pasted block', {
      listingId: listing || '(not found)',
      productId: extractedProduct || '(not found)',
      variantId: extractedVariant || '(not found)',
      marketDataUrl: marketUrl || '(none)'
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasteBlock(text);
      parseAndFillIds(text);
    } catch (error) {
      appendLog('error', 'Failed to read clipboard (browser permission)', error);
      alert('Clipboard read failed. Paste into the box manually instead.');
    }
  };

  const fetchSnapshot = async () => {
    if (!listingId) {
      alert('Please enter Listing ID first');
      return;
    }
    try {
      appendLog('info', 'Fetching listing snapshot via /api/stockx/listings (dashboard endpoint)...', { listingId });
      const startedAt = performance.now();
      const res = await fetch(`/api/stockx/listings?listingId=${encodeURIComponent(listingId.trim())}&includeMarket=1&t=${Date.now()}`);
      const elapsedMs = Math.round(performance.now() - startedAt);
      const json = await res.json().catch(() => null);
      appendLog('info', `Snapshot response (${res.status}) in ${elapsedMs}ms`, {
        success: json?.success,
        count: Array.isArray(json?.listings) ? json.listings.length : undefined
      });

      if (!res.ok || !json?.success || !Array.isArray(json?.listings)) {
        alert(json?.error || `Listings fetch failed (${res.status})`);
        return;
      }

      const match = json.listings[0];
      if (!match) {
        alert(`Listing not found in /api/stockx/listings response: ${listingId.trim()}`);
        return;
      }

      if (match.currentPrice != null) setCurrentPrice(String(match.currentPrice));
      if (match.lowestAsk != null) setLowestAsk(String(match.lowestAsk));
      if (match.flexLowestAsk != null) setFlexLowestAsk(String(match.flexLowestAsk));
      if (match.productId) setProductId(String(match.productId));
      if (match.variantId) setVariantId(String(match.variantId));
      appendLog('info', 'Filled fields from matched listing', {
        listingId: match.listingId,
        productId: match.productId,
        variantId: match.variantId,
        currentPrice: match.currentPrice,
        lowestAsk: match.lowestAsk,
        flexLowestAsk: match.flexLowestAsk
      });
    } catch (e) {
      appendLog('error', 'Snapshot request failed', e);
      alert('Snapshot request failed. See logs.');
    }
  };

  const testSingleListing = async () => {
    if (!listingId || !productId || !variantId) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const startedAt = performance.now();
      const testData = {
        listings: [{
          listingId: listingId.trim(),
          productId: productId.trim(),
          variantId: variantId.trim(),
          currentPrice: parseFloat(currentPrice),
          lowestAsk: parseFloat(lowestAsk),
          pricingStrategy: {
            type: strategyType,
            value: parseFloat(clampStrategyValue(strategyValue)),
            resetPrice: strategyType === 'reset_then_beat_lowest' ? RESET_PRICE : undefined,
            beatBy: strategyType === 'reset_then_beat_lowest' ? TWO_STEP_BEAT_BY : undefined
          },
          minPrice: parseFloat(minPrice),
          maxPrice: parseFloat(maxPrice)
        }],
        strategy: {
          type: 'competitive',
          settings: {
            minProfitMargin: 5,
            maxPriceReduction: 20,
            competitiveBuffer: 1,
            aggressiveness: 'moderate'
          }
        },
        dryRun: dryRun,
        useIndividualStrategies: true,
        allowTwoStep: allowTwoStep
      };

      appendLog('info', 'Sending request to /api/stockx/repricing', testData);

      const response = await fetch('/api/stockx/repricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      const elapsedMs = Math.round(performance.now() - startedAt);
      appendLog('info', `Response received (${response.status}) in ${elapsedMs}ms`, {
        status: response.status,
        ok: response.ok
      });

      const data = await response.json();
      appendLog('info', 'Parsed JSON response', data);

      // Add a concise per-listing summary to logs
      const first = Array.isArray(data?.results) ? data.results[0] : null;
      if (first) {
        appendLog('info', 'Repricing summary', {
          listingId: first.listingId,
          action: first.action,
          from: first.currentPrice,
          to: first.newPrice,
          reason: first.reason,
          operationId: first.operationId,
          operationStatus: first.operationStatus,
          twoStep: first.twoStep
        });
      }
      setResult(data);
    } catch (error) {
      appendLog('error', 'Request failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error
      });
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  const quickFillExample = () => {
    setListingId('test-listing-123');
    setProductId('1b48c647-e0b3-4ebf-a202-6f12a2ccd86d');
    setVariantId('acb10ad1-07a2-4453-8963-86e66ac0ee64');
    setCurrentPrice('100');
    setLowestAsk('95');
    setFlexLowestAsk('');
    setStrategyType('beat_lowest');
    setStrategyValue('1');
    // Reset price is hardcoded; nothing to reset here.
    setAllowTwoStep(false);
    setMinPrice('80');
    setMaxPrice('150');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto pb-20">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            🔄 Repricing Engine Tester
          </h1>
          <p className="text-gray-400">
            Test repricing strategies and see calculated prices before going live
          </p>
        </div>

        {/* Quick Actions */}
        <div className="bg-purple-900/30 border border-purple-600 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div className="flex-1">
              <h3 className="text-purple-400 font-semibold mb-2">Quick Test:</h3>
              <button
                onClick={quickFillExample}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
              >
                Fill Example Data
              </button>
            </div>
          </div>
        </div>

        {/* Dry Run Toggle */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-white font-bold text-lg mb-1">Dry Run Mode</h3>
              <p className="text-gray-400 text-sm">
                {dryRun 
                  ? '✅ Safe mode - No actual price changes will occur' 
                  : '⚠️ LIVE mode - Prices will be updated on StockX!'}
              </p>
            </div>
            <button
              onClick={() => setDryRun(!dryRun)}
              className={`px-6 py-3 rounded-lg font-bold transition-all ${
                dryRun 
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {dryRun ? 'DRY RUN' : 'LIVE'}
            </button>
          </div>
        </div>

        {/* Paste IDs */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-white font-bold text-lg">📋 Paste IDs (from dashboard copy button)</h3>
            <button
              onClick={pasteFromClipboard}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              Paste from Clipboard
            </button>
          </div>
          <p className="text-gray-400 text-sm mb-3">
            Paste the single block you copied (product/listing/variant IDs). We’ll auto-fill the fields below.
          </p>
          <textarea
            value={pasteBlock}
            onChange={(e) => setPasteBlock(e.target.value)}
            onBlur={() => parseAndFillIds(pasteBlock)}
            placeholder={`productName: ...\nlistingId: ...\nproductId: ...\nvariantId: ...\nmarketDataUrl: ...`}
            className="w-full h-28 px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none font-mono text-xs"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => parseAndFillIds(pasteBlock)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors"
            >
              Parse & Fill
            </button>
            <button
              onClick={() => { setPasteBlock(''); }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Listing Details */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-white font-bold text-lg">📦 Listing Details</h3>
            <button
              onClick={fetchSnapshot}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              disabled={loading}
              title="Fetch current listing price + market fields from /api/stockx/listings (same as dashboard)"
            >
              Fetch from StockX
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-white font-semibold mb-2">
                Listing ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                placeholder="e.g., 279771c7-5fe9-4049-b959-7c7c9806be97"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Product ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                placeholder="Product UUID"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Variant ID <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
                placeholder="Variant UUID"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Current Price
              </label>
              <input
                type="number"
                value={currentPrice}
                onChange={(e) => setCurrentPrice(e.target.value)}
                placeholder="100"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Lowest Ask (standard)
              </label>
              <input
                type="number"
                value={lowestAsk}
                onChange={(e) => setLowestAsk(e.target.value)}
                placeholder="95"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Flex Lowest Ask
              </label>
              <input
                type="text"
                value={flexLowestAsk || ''}
                readOnly
                placeholder="(fetch from StockX)"
                className="w-full px-4 py-3 bg-gray-900/60 text-white rounded-lg border border-gray-700 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Pricing Strategy */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <h3 className="text-white font-bold text-lg mb-4">🎯 Pricing Strategy</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white font-semibold mb-2">
                Strategy Type
              </label>
              <select
                value={strategyType}
                onChange={(e) => setStrategyType(e.target.value as any)}
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              >
                <option value="beat_lowest">Beat Lowest Ask</option>
                <option value="match_lowest">Match Lowest Ask</option>
                <option value="percentage_below">Percentage Below Market</option>
                <option value="reset_then_beat_lowest">Two-step: $999 then Beat Lowest</option>
              </select>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                {strategyType === 'percentage_below' ? 'Percentage (%)' : 'Amount ($)'}
              </label>
              {strategyType === 'reset_then_beat_lowest' ? (
                <div className="w-full px-4 py-3 bg-gray-900/50 text-gray-300 rounded-lg border border-gray-600">
                  ${TWO_STEP_BEAT_BY}
                </div>
              ) : (
                <input
                  type="number"
                  value={strategyValue}
                  onChange={(e) => setStrategyValue(clampStrategyValue(e.target.value))}
                  placeholder={strategyType === 'percentage_below' ? '5' : '1'}
                  className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                  min={strategyType === 'percentage_below' ? 0 : 1}
                  max={strategyType === 'percentage_below' ? 100 : undefined}
                />
              )}
            </div>

            {strategyType === 'reset_then_beat_lowest' && (
              <>
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Reset Price (step 1)
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-900/50 text-gray-300 rounded-lg border border-gray-600">
                    ${RESET_PRICE}
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setAllowTwoStep(v => !v)}
                    className={`w-full px-4 py-3 rounded-lg font-bold transition-all ${
                      allowTwoStep
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                    }`}
                    title="Required to execute two-step strategy (live or dry-run)."
                  >
                    {allowTwoStep ? 'Two-step ENABLED' : 'Enable Two-step'}
                  </button>
                </div>
              </>
            )}

            <div>
              <label className="block text-white font-semibold mb-2">
                Min Price (Safety)
              </label>
              <input
                type="number"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="80"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Max Price (Safety)
              </label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="150"
                className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Strategy Preview */}
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-600 rounded-lg">
            <p className="text-blue-300 text-sm font-mono">
              {strategyType === 'beat_lowest' && 
                `New Price = $${lowestAsk} - $${clampStrategyValue(strategyValue)} = $${(parseFloat(lowestAsk) - parseFloat(clampStrategyValue(strategyValue))).toFixed(2)}`}
              {strategyType === 'match_lowest' && 
                `New Price = $${lowestAsk}`}
              {strategyType === 'percentage_below' && 
                `New Price = $${lowestAsk} × (1 - ${clampStrategyValue(strategyValue)}%) = $${(parseFloat(lowestAsk) * (1 - parseFloat(clampStrategyValue(strategyValue))/100)).toFixed(2)}`}
              {strategyType === 'reset_then_beat_lowest' &&
                `Two-step: set $${RESET_PRICE} then set $${lowestAsk} - $${TWO_STEP_BEAT_BY} = $${(parseFloat(lowestAsk) - TWO_STEP_BEAT_BY).toFixed(2)}`}
            </p>
          </div>
        </div>

        {/* Test Button */}
        <button
          onClick={testSingleListing}
          disabled={loading}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${
            loading
              ? 'bg-gray-600 cursor-not-allowed text-gray-400'
              : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white'
          }`}
        >
          {loading ? '🔄 Testing Repricing Logic...' : '🚀 Test Repricing'}
        </button>

        {/* Logs */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-white font-bold text-xl">🧾 Logs</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(logsText)}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
                disabled={logs.length === 0}
                title={logs.length === 0 ? 'No logs to copy' : 'Copy logs'}
              >
                Copy
              </button>
              <button
                onClick={clearLogs}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
                disabled={logs.length === 0}
                title={logs.length === 0 ? 'No logs to clear' : 'Clear logs'}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-h-[320px] overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-400 text-sm">No logs yet. Click “Test Repricing” to generate logs.</p>
            ) : (
              <pre className="text-xs text-gray-200 whitespace-pre-wrap break-words">
                {logsText}
              </pre>
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* Success/Error Banner */}
            <div className={`rounded-lg p-6 ${
              result.success 
                ? 'bg-green-900/30 border border-green-600' 
                : 'bg-red-900/30 border border-red-600'
            }`}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{result.success ? '✅' : '❌'}</span>
                <div>
                  <h3 className={`font-bold text-xl ${
                    result.success ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {result.success ? 'Repricing Test Complete!' : 'Test Failed'}
                  </h3>
                  {result.error && (
                    <p className="text-gray-300 mt-1">{result.error}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            {result.summary && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-white font-bold text-xl mb-4">📊 Summary</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">{result.summary.total}</div>
                    <div className="text-gray-400 text-sm">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{result.summary.updated}</div>
                    <div className="text-gray-400 text-sm">Updated</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400">{result.summary.skipped}</div>
                    <div className="text-gray-400 text-sm">Skipped</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-400">{result.summary.errors}</div>
                    <div className="text-gray-400 text-sm">Errors</div>
                  </div>
                </div>
              </div>
            )}

            {/* Detailed Results */}
            {result.results && result.results.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-white font-bold text-xl mb-4">🔍 Detailed Results</h3>
                {result.results.map((item, index) => (
                  <div key={index} className="mb-6 last:mb-0 p-4 bg-gray-900 rounded-lg border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white font-semibold">
                        {item.productName || item.listingId}
                      </h4>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        item.action === 'updated' ? 'bg-green-600 text-white' :
                        item.action === 'skipped' ? 'bg-yellow-600 text-white' :
                        item.action === 'would update' ? 'bg-blue-600 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                        {item.action}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <div className="text-gray-400 text-sm">Current Price</div>
                        <div className="text-white font-bold text-lg">${item.currentPrice}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm">New Price</div>
                        <div className="text-green-400 font-bold text-lg">${item.newPrice}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-sm">Difference</div>
                        <div className={`font-bold text-lg ${
                          item.newPrice < item.currentPrice ? 'text-red-400' : 'text-green-400'
                        }`}>
                          {item.newPrice < item.currentPrice ? '-' : '+'}
                          ${Math.abs(item.newPrice - item.currentPrice).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {item.lowestAsk && (
                      <div className="text-gray-400 text-sm mb-2">
                        Market Lowest Ask: <span className="text-white">${item.lowestAsk}</span>
                      </div>
                    )}

                    {item.reason && (
                      <div className="text-gray-300 text-sm bg-gray-800 p-3 rounded">
                        💡 {item.reason}
                      </div>
                    )}

                    {item.error && (
                      <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded border border-red-600 mt-2">
                        ❌ {item.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!result && (
          <div className="mt-8 bg-gray-800/50 rounded-lg p-6 border border-gray-700">
            <h3 className="text-white font-bold mb-3">📖 How to Use:</h3>
            <ol className="text-gray-300 space-y-2 list-decimal list-inside">
              <li>Click "Fill Example Data" to populate test values</li>
              <li>Or enter your own listing details and current market price</li>
              <li>Choose a pricing strategy (Beat/Match/Percentage)</li>
              <li>Set safety boundaries (min/max prices)</li>
              <li>Keep "Dry Run" enabled for testing (no actual changes)</li>
              <li>Click "Test Repricing" to see the calculated new price</li>
            </ol>
            <div className="mt-4 p-4 bg-purple-900/20 border border-purple-600 rounded-lg">
              <p className="text-purple-300 text-sm">
                💡 <strong>Tip:</strong> Get real listing IDs, product IDs, and variant IDs from your 
                repricing dashboard at <code className="bg-black/30 px-2 py-1 rounded">/dashboard?section=stockx-repricing</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

