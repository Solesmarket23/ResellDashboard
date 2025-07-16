'use client';

import React, { useEffect, useRef } from 'react';
import { X, Clock, CheckCircle, Mail, Package, Truck, AlertTriangle } from 'lucide-react';
import { FailedVerification, VerificationStatus } from '@/types/failed-verification';
import { STATUS_LABELS } from '@/lib/verification-status';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface StatusHistoryModalProps {
  verification: FailedVerification;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_ICONS: Record<VerificationStatus, React.ReactNode> = {
  needs_review: <AlertTriangle className="w-5 h-5" />,
  email_sent: <Mail className="w-5 h-5" />,
  label_received: <Package className="w-5 h-5" />,
  shipped_back: <Truck className="w-5 h-5" />,
  delivered_to_stockx: <CheckCircle className="w-5 h-5" />,
  refund_processed: <CheckCircle className="w-5 h-5" />,
  dispute: <AlertTriangle className="w-5 h-5" />,
  closed_no_resolution: <X className="w-5 h-5" />
};

const STATUS_COLORS_NEON: Record<VerificationStatus, string> = {
  needs_review: 'text-slate-400',
  email_sent: 'text-blue-400',
  label_received: 'text-yellow-400',
  shipped_back: 'text-orange-400',
  delivered_to_stockx: 'text-purple-400',
  refund_processed: 'text-emerald-400',
  dispute: 'text-red-400',
  closed_no_resolution: 'text-gray-400'
};

export function StatusHistoryModal({ verification, isOpen, onClose }: StatusHistoryModalProps) {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme?.name === 'Neon';
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);
  
  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };
  
  if (!isOpen) return null;
  
  // Build timeline data
  const timelineEvents: Array<{
    status: VerificationStatus;
    timestamp: string;
    label: string;
    note: string;
  }> = [];
  
  // Add created event
  timelineEvents.push({
    status: 'needs_review',
    timestamp: verification.createdAt,
    label: 'Verification Failed',
    note: 'Item failed StockX verification'
  });
  
  // Add status-specific events
  if (verification.emailSentAt) {
    timelineEvents.push({
      status: 'email_sent',
      timestamp: verification.emailSentAt,
      label: 'Return Request Sent',
      note: 'Email sent to StockX support'
    });
  }
  
  if (verification.labelReceivedAt) {
    timelineEvents.push({
      status: 'label_received',
      timestamp: verification.labelReceivedAt,
      label: 'Shipping Label Received',
      note: 'Return shipping label provided by StockX'
    });
  }
  
  if (verification.shippedBackAt) {
    timelineEvents.push({
      status: 'shipped_back',
      timestamp: verification.shippedBackAt,
      label: 'Package Shipped',
      note: verification.returnTrackingNumber ? `Tracking: ${verification.returnTrackingNumber}` : 'Item shipped back to StockX'
    });
  }
  
  if (verification.deliveredAt) {
    timelineEvents.push({
      status: 'delivered_to_stockx',
      timestamp: verification.deliveredAt,
      label: 'Delivered to StockX',
      note: 'Package received by StockX'
    });
  }
  
  if (verification.refundProcessedAt) {
    timelineEvents.push({
      status: 'refund_processed',
      timestamp: verification.refundProcessedAt,
      label: 'Refund Processed',
      note: verification.refundAmount ? `Amount: $${verification.refundAmount.toFixed(2)}` : 'Refund completed'
    });
  }
  
  // Sort by timestamp
  timelineEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const modalClasses = isNeon
    ? 'dark-neon-card border border-cyan-500/30 shadow-2xl shadow-cyan-500/20'
    : 'bg-white shadow-2xl';
    
  const headerBorderClasses = isNeon ? 'border-slate-700/50' : 'border-gray-200';
  const productInfoClasses = isNeon ? 'border-slate-700/50 bg-slate-900/50' : 'border-gray-100 bg-gray-50';
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div 
        ref={modalRef}
        className={`rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden ${modalClasses}`}
      >
        {/* Header */}
        <div className={`px-6 py-4 border-b ${headerBorderClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                Status History
              </h2>
              <p className={`text-sm mt-1 ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                Order: {verification.orderNumber}
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                isNeon
                  ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Product Info */}
        <div className={`px-6 py-4 border-b ${productInfoClasses}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`font-medium ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                {verification.productName}
              </p>
              <p className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                Failure Reason: {verification.failureReason}
              </p>
            </div>
            {verification.expectedRefundAmount && (
              <div className="text-right">
                <p className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                  Expected Refund
                </p>
                <p className={`font-semibold ${isNeon ? 'text-cyan-400' : 'text-gray-900'}`}>
                  ${verification.expectedRefundAmount.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
        
        {/* Timeline */}
        <div className="px-6 py-6 overflow-y-auto max-h-[400px]">
          <div className="space-y-0">
            {timelineEvents.map((event, index) => {
              const Icon = STATUS_ICONS[event.status];
              const isLatest = index === timelineEvents.length - 1;
              const isFirst = index === 0;
              
              return (
                <div key={index} className="relative">
                  {/* Line BEFORE the item (connects from previous item) */}
                  {!isFirst && (
                    <div 
                      className={`absolute left-6 top-0 w-0.5 h-8 ${
                        isNeon ? 'bg-slate-700' : 'bg-gray-200'
                      }`}
                    />
                  )}
                  
                  <div className="relative flex items-start pb-8 last:pb-0">
                    {/* Icon circle */}
                    <div className={`relative z-10 flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full ${
                      isNeon
                        ? isLatest 
                          ? 'bg-slate-900 border-2 border-cyan-500/50'
                          : 'bg-slate-800 border border-slate-700'
                        : isLatest
                          ? 'bg-white border-2 border-blue-500'
                          : 'bg-white border-2 border-gray-300'
                    }`}>
                      {/* Gradient overlay for latest event */}
                      {isLatest && isNeon && (
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 rounded-full" />
                      )}
                      <div className={`relative z-10 ${
                        isNeon 
                          ? STATUS_COLORS_NEON[event.status]
                          : isLatest ? 'text-blue-600' : 'text-gray-600'
                      }`}>
                        {Icon}
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="ml-6 flex-1">
                      <div className={`rounded-lg p-4 ${
                        isNeon
                          ? isLatest
                            ? 'bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 border border-cyan-500/30'
                            : 'bg-slate-800/50 border border-slate-700/50'
                          : isLatest
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-gray-50 border border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className={`font-semibold ${isNeon ? 'text-white' : 'text-gray-900'}`}>
                            {event.label}
                          </h3>
                          <div className="flex items-center gap-1">
                            <Clock className={`w-4 h-4 ${isNeon ? 'text-slate-500' : 'text-gray-400'}`} />
                            <span className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                              {new Date(event.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <p className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                          {event.note}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Line AFTER the item (connects to next item) */}
                  {!isLatest && (
                    <div 
                      className={`absolute left-6 bottom-0 w-0.5 h-8 ${
                        isNeon ? 'bg-slate-700' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Footer */}
        <div className={`px-6 py-4 border-t ${headerBorderClasses}`}>
          <div className="flex items-center justify-between">
            <p className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
              Current Status: <span className={`font-medium ${isNeon ? 'text-cyan-400' : 'text-blue-600'}`}>
                {STATUS_LABELS[verification.status || 'needs_review']}
              </span>
            </p>
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                isNeon
                  ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-600 hover:to-emerald-600 text-white shadow-lg shadow-cyan-500/25'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}