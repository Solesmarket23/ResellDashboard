export const STATUS_LABELS: Record<string, string> = {
  needs_review: 'Needs Review',
  email_sent: 'Email Sent',
  label_received: 'Label Received',
  shipped_back: 'Shipped Back',
  delivered_to_stockx: 'Delivered to StockX',
  refund_processed: 'Refund Processed',
  dispute: 'Under Dispute',
  closed_no_resolution: 'Closed - No Resolution'
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  needs_review: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
  email_sent: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  label_received: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  shipped_back: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  delivered_to_stockx: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  refund_processed: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  dispute: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  closed_no_resolution: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' }
};

export const STATUS_COLORS_NEON: Record<string, { bg: string; text: string; border?: string }> = {
  needs_review: { bg: 'bg-slate-800/50', text: 'text-slate-300', border: 'border-slate-600/50' },
  email_sent: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-500/30' },
  label_received: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  shipped_back: { bg: 'bg-orange-900/30', text: 'text-orange-400', border: 'border-orange-500/30' },
  delivered_to_stockx: { bg: 'bg-purple-900/30', text: 'text-purple-400', border: 'border-purple-500/30' },
  refund_processed: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  dispute: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-500/30' },
  closed_no_resolution: { bg: 'bg-slate-800/50', text: 'text-slate-400', border: 'border-slate-600/50' }
};

export const NEXT_STATUS_MAP: Record<string, string[]> = {
  needs_review: ['email_sent'],
  email_sent: ['label_received', 'dispute'],
  label_received: ['shipped_back', 'dispute'],
  shipped_back: ['delivered_to_stockx', 'dispute'],
  delivered_to_stockx: ['refund_processed', 'dispute'],
  refund_processed: [],
  dispute: ['refund_processed', 'closed_no_resolution'],
  closed_no_resolution: []
};