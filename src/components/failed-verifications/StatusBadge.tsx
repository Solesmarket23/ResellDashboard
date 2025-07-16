import React from 'react';
import { VerificationStatus } from '@/types/failed-verification';
import { STATUS_LABELS, STATUS_COLORS, STATUS_COLORS_NEON } from '@/lib/verification-status';
import { useTheme } from '@/lib/contexts/ThemeContext';

interface StatusBadgeProps {
  status: VerificationStatus;
  showTimestamp?: boolean;
  timestamp?: string;
}

export function StatusBadge({ status, showTimestamp, timestamp }: StatusBadgeProps) {
  const { currentTheme } = useTheme();
  const isNeon = currentTheme?.name === 'Neon';
  const statusKey = status || 'needs_review';
  const colors = isNeon ? STATUS_COLORS_NEON[statusKey] : STATUS_COLORS[statusKey];
  
  // Fallback colors if status is not found
  const bgColor = colors?.bg || (isNeon ? 'bg-slate-800/50' : 'bg-gray-100');
  const textColor = colors?.text || (isNeon ? 'text-slate-300' : 'text-gray-800');
  const borderColor = colors?.border || (isNeon ? 'border-slate-600/50' : 'border-gray-300');
  
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bgColor} ${textColor} ${borderColor ? `border ${borderColor}` : ''}`}>
        {STATUS_LABELS[statusKey] || 'Unknown'}
      </span>
      {showTimestamp && timestamp && (
        <span className={`text-xs ${isNeon ? 'text-slate-500' : 'text-gray-500'}`}>
          {new Date(timestamp).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}