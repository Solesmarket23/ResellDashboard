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
  const isNeon = currentTheme.name === 'Neon';
  const colors = isNeon ? STATUS_COLORS_NEON[status] : STATUS_COLORS[status];
  
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} ${colors.border ? `border ${colors.border}` : ''}`}>
        {STATUS_LABELS[status]}
      </span>
      {showTimestamp && timestamp && (
        <span className={`text-xs ${isNeon ? 'text-slate-500' : 'text-gray-500'}`}>
          {new Date(timestamp).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}