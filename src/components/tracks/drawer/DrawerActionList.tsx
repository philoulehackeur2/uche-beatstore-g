'use client';

import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface DrawerAction {
  icon: LucideIcon;
  label: string;
  /** Tailwind color class applied to the icon + label. */
  color: string;
  /** Optional direct handler — when omitted, the parent's onAction(label)
   *  is invoked instead. Lets simple actions wire inline (e.g. opening
   *  a file picker) while complex ones go through the parent's
   *  state-aware dispatcher. */
  action?: () => void;
}

interface Props {
  actions: DrawerAction[];
  /** Used as fallback when a row doesn't carry its own `action`. */
  onAction: (label: string) => void;
  /** Mid-flight deletion disables every row to avoid double-clicks. */
  disabled?: boolean;
}

/**
 * Desktop: full labelled list.
 * Mobile (<sm): primary 5 actions as icon-only pills + a "…" overflow
 * button that reveals the rest in a floating menu.
 */
export function DrawerActionList({ actions, onAction, disabled }: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const PRIMARY_COUNT = 5;
  const primary = actions.slice(0, PRIMARY_COUNT);
  const overflow = actions.slice(PRIMARY_COUNT);

  return (
    <>
      {/* ── Mobile: icon strip + overflow ─────────────────────────── */}
      <div className="sm:hidden px-4 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {primary.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={`mob-${i}`}
                onClick={action.action ?? (() => onAction(action.label))}
                disabled={disabled}
                title={action.label}
                className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-[#14110d] border border-[#1f1a13] hover:border-[#2d2620] hover:bg-[#18140f] transition-all ${action.color} disabled:opacity-40`}
              >
                <Icon size={15} />
                <span className="text-[8px] font-mono uppercase tracking-wider text-[#5a5142] leading-none">
                  {action.label.split(' ')[0]}
                </span>
              </button>
            );
          })}

          {overflow.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOverflowOpen((o) => !o)}
                title="More actions"
                className="flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-[#14110d] border border-[#1f1a13] hover:border-[#2d2620] hover:bg-[#18140f] transition-all text-[#5a5142]"
              >
                <MoreHorizontal size={15} />
                <span className="text-[8px] font-mono uppercase tracking-wider leading-none">More</span>
              </button>
              {overflowOpen && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setOverflowOpen(false)} />
                  <div className="absolute bottom-full mb-2 right-0 z-60 w-44 bg-[#14110d] border border-[#1f1a13] rounded-xl shadow-xl overflow-hidden">
                    {overflow.map((action, i) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={`ov-${i}`}
                          onClick={() => { setOverflowOpen(false); (action.action ?? (() => onAction(action.label)))(); }}
                          disabled={disabled}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-[11px] font-medium hover:bg-[#1a160f] transition-colors ${action.color}`}
                        >
                          <Icon size={13} />
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: full labelled list ────────────────────────────── */}
      <div className="hidden sm:block p-6 grid grid-cols-1 gap-1">
        {actions.map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={`${action.label}-${i}`}
              onClick={action.action ?? (() => onAction(action.label))}
              disabled={disabled}
              className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-[#E8DCC8] hover:bg-[#1a160f] transition-all group relative overflow-hidden"
            >
              <div className={`w-8 h-8 rounded-lg bg-[#0a0907] border border-[#1f1a13] flex items-center justify-center ${action.color} opacity-80 group-hover:opacity-100 group-hover:border-[#D4BFA0]/30 transition-all`}>
                <Icon size={16} />
              </div>
              <span className={`${action.color} group-hover:text-white transition-colors`}>{action.label}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            </button>
          );
        })}
      </div>
    </>
  );
}
