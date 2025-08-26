import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning';

interface NeonNotificationProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
  duration?: number;
}

const NeonNotification: React.FC<NeonNotificationProps> = ({ 
  message, 
  type, 
  onClose, 
  duration = 5000 
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for animation to complete
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-6 h-6" />;
      case 'error':
        return <XCircle className="w-6 h-6" />;
      case 'warning':
        return <AlertCircle className="w-6 h-6" />;
    }
  };

  const getColorClasses = () => {
    switch (type) {
      case 'success':
        return 'from-green-400 to-emerald-600 shadow-green-500/50';
      case 'error':
        return 'from-red-400 to-pink-600 shadow-red-500/50';
      case 'warning':
        return 'from-yellow-400 to-orange-600 shadow-yellow-500/50';
    }
  };

  const getNeonGlow = () => {
    switch (type) {
      case 'success':
        return 'drop-shadow-[0_0_35px_rgba(74,222,128,0.8)] animate-pulse-glow-green';
      case 'error':
        return 'drop-shadow-[0_0_35px_rgba(248,113,113,0.8)] animate-pulse-glow-red';
      case 'warning':
        return 'drop-shadow-[0_0_35px_rgba(250,204,21,0.8)] animate-pulse-glow-yellow';
    }
  };

  return (
    <div
      className={`
        fixed top-20 right-4 z-50
        transform transition-all duration-300 ease-out
        ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <div
        className={`
          relative overflow-hidden
          bg-gradient-to-r ${getColorClasses()}
          p-[2px] rounded-lg
          shadow-2xl shadow-black/50
          ${getNeonGlow()}
        `}
      >
        <div className="bg-black/90 backdrop-blur-sm rounded-[6px] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`text-white ${getNeonGlow()}`}>
              {getIcon()}
            </div>
            <p className="text-white font-medium text-lg tracking-wide">
              {message}
            </p>
            <button
              onClick={() => {
                setIsVisible(false);
                setTimeout(onClose, 300);
              }}
              className="ml-4 text-white/70 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Animated neon border effect */}
          <div className="absolute inset-0 rounded-lg pointer-events-none">
            <div className={`absolute inset-0 bg-gradient-to-r ${getColorClasses()} opacity-20 animate-pulse`} />
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-1 bg-black/50">
          <div
            className={`h-full bg-gradient-to-r ${getColorClasses()} animate-progress`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      </div>
    </div>
  );
};

export default NeonNotification;