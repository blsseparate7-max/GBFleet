import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

// Global dispatcher function that can be called from ANY component or utility without prop drilling
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success', duration: number = 3500) {
  const event = new CustomEvent('gbfleet_toast_notify', {
    detail: {
      id: 'toast_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      message,
      type,
      duration
    }
  });
  window.dispatchEvent(event);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ToastMessage>;
      if (customEvent.detail) {
        const newToast = customEvent.detail;
        setToasts((prev) => [...prev, newToast]);

        const duration = newToast.duration || 3500;
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
        }, duration);
      }
    };

    window.addEventListener('gbfleet_toast_notify', handleToastEvent);
    return () => {
      window.removeEventListener('gbfleet_toast_notify', handleToastEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl border text-sm font-semibold transition-all duration-300 transform translate-y-0 opacity-100 backdrop-blur-md animate-in fade-in slide-in-from-top-4",
            toast.type === 'success' && "bg-emerald-900/95 text-white border-emerald-700 shadow-emerald-950/20",
            toast.type === 'error' && "bg-rose-900/95 text-white border-rose-700 shadow-rose-950/20",
            toast.type === 'info' && "bg-slate-900/95 text-white border-slate-700 shadow-slate-950/20"
          )}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-300" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-300" />}
          </div>

          <div className="flex-1 min-w-0 pr-2">
            <p className="leading-snug">{toast.message}</p>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="shrink-0 text-white/70 hover:text-white transition-colors p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
