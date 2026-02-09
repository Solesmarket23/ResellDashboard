export const dynamic = 'force-dynamic';

export default function StockXConnectedPage() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="rounded-2xl border border-cyan-500/30 bg-slate-800/50 p-8 max-w-md">
        <div className="text-4xl mb-4">✓</div>
        <h1 className="text-xl font-semibold text-white mb-2">StockX connected</h1>
        <p className="text-slate-400 text-sm">
          You can close this window and return to the app. Tap Refresh on the Repricing tab to load your listings.
        </p>
      </div>
    </div>
  );
}
