import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'warning';

interface NeonNotificationProps {
  isVisible?: boolean;
  message: string;
  type: NotificationType;
  onClose: () => void;
  duration?: number;
}

const NeonNotification: React.FC<NeonNotificationProps> = ({ 
  isVisible: controlledVisible,
  message, 
  type, 
  onClose, 
  duration = 5000 
}) => {
  const EXIT_MS = 220;
  const shouldShow = controlledVisible ?? true;
  const [present, setPresent] = useState(false);

  useEffect(() => {
    // Trigger "enter" animation on mount / when becoming visible.
    if (!shouldShow) {
      setPresent(false);
      return;
    }

    const raf = requestAnimationFrame(() => setPresent(true));

    const timer = window.setTimeout(() => {
      setPresent(false);
      window.setTimeout(onClose, EXIT_MS);
    }, duration);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [duration, onClose, shouldShow]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getTone = () => {
    switch (type) {
      case 'success':
        return {
          accent: 'bg-emerald-500/90',
          icon: 'text-emerald-300',
          progress: 'bg-emerald-400/80',
        };
      case 'error':
        return {
          accent: 'bg-rose-500/90',
          icon: 'text-rose-300',
          progress: 'bg-rose-400/80',
        };
      case 'warning':
        return {
          accent: 'bg-amber-500/90',
          icon: 'text-amber-300',
          progress: 'bg-amber-400/80',
        };
    }
  };

  const tone = getTone();

  return (
    <div
      className={`
        fixed top-6 right-4 z-50
        transform-gpu transition-all ease-out
        ${present ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}
      `}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
    >
      <div className="relative w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-gray-950/90 shadow-xl shadow-black/40 backdrop-blur">
        <div className={`absolute left-0 top-0 h-full w-1 ${tone.accent}`} />

        <div className="flex items-start gap-3 px-4 py-3">
          <div className={`mt-0.5 ${tone.icon}`}>{getIcon()}</div>

          <p className="flex-1 text-sm font-medium text-gray-100 leading-5">
            {message}
          </p>

          <button
            onClick={() => {
              setPresent(false);
              window.setTimeout(onClose, EXIT_MS);
            }}
            className="ml-2 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-white/10">
          <div
            className={`h-full ${tone.progress} animate-progress`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      </div>
    </div>
  );
};

export default NeonNotification;