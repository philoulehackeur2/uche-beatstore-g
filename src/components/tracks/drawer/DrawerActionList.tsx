'use client';

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
 * Renders the drawer's bottom action list (Replace audio, Split stems,
 * Add to project, Export, Delete, etc). Extracted from
 * TrackDetailsDrawer to keep the parent file focused on state +
 * dispatch logic.
 */
export function DrawerActionList({ actions, onAction, disabled }: Props) {
  return (
    <div className="p-6 grid grid-cols-1 gap-1">
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
            {/* Sweeping shimmer on hover. Decorative; absolute-positioned
                inside the relative button so it doesn't affect layout. */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
          </button>
        );
      })}
    </div>
  );
}
