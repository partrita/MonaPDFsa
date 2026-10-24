import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

// Success messages are short. Errors need more time to read.
const AUTO_DISMISS_MS: Record<ToastType, number> = {
  success: 4500,
  error: 8000,
};

export type ToastType = 'success' | 'error';

interface ToastProps {
  type: ToastType;
  message: string;
  /** Extra line for a result path or other detail. */
  detail?: string;
  onClose: () => void;
}

/**
 * Floating notification in the bottom right corner.
 * It closes on the X button or after the auto-dismiss delay.
 * Hovering or focusing the toast keeps it open.
 */
export const Toast = ({ type, message, detail, onClose }: ToastProps) => {
  const [paused, setPaused] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (paused) return;
    // A new message or type restarts the countdown.
    const timer = window.setTimeout(() => onCloseRef.current(), AUTO_DISMISS_MS[type]);
    return () => window.clearTimeout(timer);
  }, [paused, type, message]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="fixed bottom-5 right-5 z-50 max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow-2xl flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 select-none"
    >
      {type === 'success' ? (
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 text-xs">
        <p className="font-semibold whitespace-pre-line text-gray-900 dark:text-gray-100">
          {message}
        </p>
        {detail && (
          <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 mt-1 break-all">
            저장 경로: {detail}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="알림 닫기"
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
