'use client';

import { useToastStore, type Toast } from '@/hooks/useToast';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const ICONS = {
  info:    Info,
  success: CheckCircle2,
  error:   AlertCircle,
  warning: AlertTriangle,
} as const;

const ACCENTS = {
  info:    'border-[#1f1a13] text-[#D4BFA0]',
  success: 'border-emerald-900/40 text-emerald-400',
  error:   'border-red-900/40 text-red-400',
  warning: 'border-amber-900/40 text-amber-400',
} as const;

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="fixed bottom-32 right-6 z-[100] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.kind];
  const accent = ACCENTS[toast.kind];

  return (
    <div
      role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
      className={`pointer-events-auto w-80 bg-[#0a0907] border ${accent} rounded-lg shadow-2xl backdrop-blur-md animate-in slide-in-from-right-4 fade-in duration-200`}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon size={16} className={`shrink-0 mt-0.5 ${accent.split(' ').pop()}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-[#E8DCC8] leading-snug">{toast.title}</p>
          {toast.description && (
            <p className="text-[11px] text-[#a08a6a] mt-1 leading-relaxed whitespace-pre-line">{toast.description}</p>
          )}
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              {toast.actions.map((a, i) => (
                <button
                  key={i}
                  onClick={a.onClick}
                  className={`text-[10px] font-medium uppercase tracking-wider px-3 py-1.5 rounded-md transition-colors ${
                    a.variant === 'danger'
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : a.variant === 'ghost'
                        ? 'text-[#a08a6a] hover:text-[#E8DCC8] hover:bg-[#1a160f]'
                        : 'bg-white text-black hover:bg-[#E8DCC8]'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-[#4a4338] hover:text-[#a08a6a] transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
