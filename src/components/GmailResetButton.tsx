import React, { useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';

const GmailResetButton: React.FC = () => {
  const { currentTheme } = useTheme();
  const [isResetting, setIsResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleReset = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    try {
      setIsResetting(true);
      
      // Reset Gmail connection
      const response = await fetch('/api/gmail/reset', { method: 'POST' });
      
      if (response.ok) {
        // Reload the page to clear all state
        window.location.reload();
      } else {
        throw new Error('Reset failed');
      }
    } catch (error) {
      console.error('Error resetting Gmail:', error);
      alert('Failed to reset Gmail connection. Please try again.');
    } finally {
      setIsResetting(false);
      setShowConfirm(false);
    }
  };

  const isNeonTheme = currentTheme?.name === 'Neon';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handleReset}
        disabled={isResetting}
        className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          isNeonTheme
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
            : 'bg-red-100 hover:bg-red-200 text-red-700 border border-red-300'
        } ${isResetting ? 'opacity-50 cursor-not-allowed' : ''}`}
        title={showConfirm ? 'Click again to confirm reset' : 'Reset Gmail connection'}
      >
        {isResetting ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : showConfirm ? (
          <AlertTriangle className="w-4 h-4" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        <span>
          {isResetting 
            ? 'Resetting...' 
            : showConfirm 
            ? 'Confirm Reset' 
            : 'Reset Gmail'
          }
        </span>
      </button>
    </div>
  );
};

export default GmailResetButton;
