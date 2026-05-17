'use client';

import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
}

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
  duration: number; // ms; 0 = sticky until manually dismissed
  actions?: ToastAction[];
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 10);
    const duration = t.duration ?? (t.kind === 'error' ? 6000 : 3500);
    set((s) => ({ toasts: [...s.toasts, { id, duration, ...t }] }));
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Imperative helpers — usable anywhere (event handlers, async functions,
 * outside React). Don't subscribe components that don't need to re-render.
 */
export const toast = {
  info:    (title: string, description?: string) => useToastStore.getState().push({ kind: 'info',    title, description }),
  success: (title: string, description?: string) => useToastStore.getState().push({ kind: 'success', title, description }),
  error:   (title: string, description?: string) => useToastStore.getState().push({ kind: 'error',   title, description }),
  warning: (title: string, description?: string) => useToastStore.getState().push({ kind: 'warning', title, description }),
  custom:  (t: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => useToastStore.getState().push(t),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

/**
 * Promise-based confirm — drop-in replacement for native `confirm()`.
 * Renders a sticky toast with Confirm + Cancel buttons.
 */
export function confirmToast(
  title: string,
  description?: string,
  opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean; timeoutMs?: number },
): Promise<boolean> {
  return new Promise((resolve) => {
    const confirmLabel = opts?.confirmLabel ?? 'Confirm';
    const cancelLabel = opts?.cancelLabel ?? 'Cancel';
    const timeoutMs = opts?.timeoutMs ?? 0; // sticky by default
    let settled = false;
    let id = '';
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      useToastStore.getState().dismiss(id);
      resolve(ok);
    };
    id = useToastStore.getState().push({
      kind: 'warning',
      title,
      description,
      duration: timeoutMs,
      actions: [
        { label: cancelLabel, onClick: () => finish(false), variant: 'ghost' },
        { label: confirmLabel, onClick: () => finish(true), variant: opts?.danger ? 'danger' : 'primary' },
      ],
    });
  });
}
