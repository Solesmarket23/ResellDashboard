import React from 'react';
import { FailedVerification, VerificationStatus } from '@/types/failed-verification';
import { STATUS_LABELS, NEXT_STATUS_MAP } from '@/lib/verification-status';
import { updateVerificationStatus, sendStockXEmail } from '@/lib/firebase/failed-verifications';
import { Mail, Package, Truck, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface QuickActionsProps {
  verification: FailedVerification;
  testEmail?: string;
  onStatusUpdate?: () => void;
}

const STATUS_ICONS: Record<VerificationStatus, React.ReactNode> = {
  email_sent: <Mail className="w-4 h-4" />,
  label_received: <Package className="w-4 h-4" />,
  shipped_back: <Truck className="w-4 h-4" />,
  delivered_to_stockx: <CheckCircle className="w-4 h-4" />,
  refund_processed: <CheckCircle className="w-4 h-4" />,
  dispute: <AlertCircle className="w-4 h-4" />,
  closed_no_resolution: <AlertCircle className="w-4 h-4" />,
  needs_review: null
};

export function QuickActions({ verification, testEmail, onStatusUpdate }: QuickActionsProps) {
  const [updating, setUpdating] = React.useState<string | null>(null);
  const { currentTheme } = useTheme();
  const isNeon = currentTheme?.name === 'Neon';
  
  const currentStatus = verification?.status || 'needs_review';
  const nextStatuses = NEXT_STATUS_MAP[currentStatus] || [];
  
  const handleStatusUpdate = async (newStatus: VerificationStatus) => {
    if (!verification.id) return;
    
    setUpdating(newStatus);
    try {
      // Special handling for email_sent status
      if (newStatus === 'email_sent' && currentStatus === 'needs_review') {
        if (!testEmail) {
          alert('Please set a test email address first (click the settings icon)');
          return;
        }
        await sendStockXEmail(
          verification.id,
          verification.orderNumber,
          verification.productName,
          testEmail
        );
      } else {
        await updateVerificationStatus(verification.id, newStatus);
      }
      
      onStatusUpdate?.();
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setUpdating(null);
    }
  };
  
  if (nextStatuses.length === 0) return null;
  
  return (
    <div className="flex gap-2">
      {nextStatuses.map((status) => {
        const isUpdating = updating === status;
        return (
          <button
            key={status}
            onClick={() => handleStatusUpdate(status as VerificationStatus)}
            disabled={updating !== null}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all
                       ${isNeon 
                         ? `bg-slate-800/50 border border-slate-600/50 text-slate-300 
                            hover:bg-slate-700/50 hover:text-white hover:border-cyan-500/50
                            disabled:opacity-50 disabled:cursor-not-allowed`
                         : `bg-white border border-gray-300 text-gray-700
                            hover:bg-gray-50 hover:text-gray-900
                            disabled:opacity-50 disabled:cursor-not-allowed`
                       }`}
          >
            {isUpdating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              STATUS_ICONS[status as VerificationStatus]
            )}
            {STATUS_LABELS[status]}
          </button>
        );
      })}
    </div>
  );
}