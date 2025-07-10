'use client';

import { useTheme } from '../lib/contexts/ThemeContext';

interface SimpleAutoSyncProps {
  isGmailConnected: boolean;
}

const SimpleAutoSync: React.FC<SimpleAutoSyncProps> = ({ isGmailConnected }) => {
  const { currentTheme } = useTheme();
  
  console.log('🔄 SimpleAutoSync component loaded', { isGmailConnected });

  return (
    <div className={`p-4 rounded-lg border ${
      currentTheme.name === 'Neon' 
        ? 'bg-white/5 border-white/10' 
        : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <span className={`font-medium text-sm ${currentTheme.colors.textPrimary}`}>
          🔄 Auto Email Sync (TEST)
        </span>
        <span className={`text-xs px-2 py-1 rounded ${
          isGmailConnected 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-600'
        }`}>
          {isGmailConnected ? 'Gmail Connected' : 'Gmail Required'}
        </span>
      </div>
      <div className={`text-xs mt-2 ${currentTheme.colors.textSecondary}`}>
        {isGmailConnected 
          ? 'Ready for automatic email syncing' 
          : 'Connect Gmail above to enable automatic email syncing'
        }
      </div>
    </div>
  );
};

export default SimpleAutoSync;