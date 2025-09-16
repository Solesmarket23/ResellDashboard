'use client';

import { useState } from 'react';
import { useTheme } from '../lib/contexts/ThemeContext';

interface StatusUpdaterProps {
  purchases: any[];
  onStatusUpdate: (updates: any[]) => void;
  className?: string;
  isAutoEnabled?: boolean;
  lastAutoUpdate?: Date | null;
}

const StatusUpdater = ({ purchases, onStatusUpdate, className = '', isAutoEnabled = false, lastAutoUpdate }: StatusUpdaterProps) => {
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const { currentTheme } = useTheme();


  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {lastUpdate && (
        <span className={`text-sm ${
          lastUpdate.includes('failed') || lastUpdate.includes('error') 
            ? 'text-red-400' 
            : 'text-green-400'
        }`}>
          {lastUpdate}
        </span>
      )}
      
      {/* Auto-update indicator */}
      {isAutoEnabled && (
        <div className="flex items-center space-x-1 text-xs">
          <div className={`w-2 h-2 rounded-full animate-pulse ${
            currentTheme.name === 'Neon' ? 'bg-yellow-400' : 'bg-yellow-500'
          }`} />
          <span className={currentTheme.colors.textSecondary}>
            Auto-monitoring active
            {lastAutoUpdate && ` (Last: ${lastAutoUpdate.toLocaleTimeString()})`}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatusUpdater;