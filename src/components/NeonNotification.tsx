import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X, Copy, Check } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState(duration);
  const [progressKey, setProgressKey] = useState(0);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    // Trigger "enter" animation on mount / when becoming visible.
    if (!shouldShow) {
      setPresent(false);
      return;
    }

    const raf = requestAnimationFrame(() => setPresent(true));
    setRemainingMs(duration);
    setPaused(false);
    setProgressKey((k) => k + 1);
    startedAtRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPresent(false);
      window.setTimeout(onClose, EXIT_MS);
    }, duration);

    return () => {
      cancelAnimationFrame(raf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [duration, onClose, shouldShow]);

  useEffect(() => {
    if (!present || !shouldShow) return;
    if (paused) {
      // Pause: compute remaining time and clear timer.
      const elapsed = Date.now() - startedAtRef.current;
      setRemainingMs((prev) => Math.max(0, prev - elapsed));
      startedAtRef.current = Date.now();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      return;
    }

    // Resume: restart timer with remaining time.
    startedAtRef.current = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setPresent(false);
      window.setTimeout(onClose, EXIT_MS);
    }, remainingMs);
    setProgressKey((k) => k + 1);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [EXIT_MS, onClose, paused, present, remainingMs, shouldShow]);

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
      default:
        // Safety fallback to prevent runtime crashes if a new type is introduced elsewhere.
        return {
          accent: 'bg-slate-500/90',
          icon: 'text-slate-200',
          progress: 'bg-slate-400/80',
        };
    }
  };

  const tone = getTone();

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback for older browsers / denied permissions
      try {
        const el = document.createElement('textarea');
        el.value = message;
        el.setAttribute('readonly', 'true');
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div
      className={`
        fixed top-6 right-4 z-50
        transform-gpu transition-all ease-out
        ${present ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}
      `}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
    >
      <div
        className="relative w-[min(440px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/10 bg-gray-950/90 shadow-xl shadow-black/40 backdrop-blur"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className={`absolute left-0 top-0 h-full w-1 ${tone.accent}`} />

        <div className="flex items-start gap-3 px-4 py-3">
          <div className={`mt-0.5 ${tone.icon}`}>{getIcon()}</div>

          <p className="flex-1 text-sm font-medium text-gray-100 leading-5 whitespace-pre-wrap break-words select-text">
            {message}
          </p>

          <button
            type="button"
            onClick={copyMessage}
            className="ml-2 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label={copied ? 'Copied' : 'Copy notification text'}
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>

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
            key={progressKey}
            className={`h-full ${tone.progress} animate-progress`}
            style={{
              animationDuration: `${remainingMs}ms`,
              animationPlayState: paused ? 'paused' : 'running',
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default NeonNotification;