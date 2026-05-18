'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional inline group separator before this item. */
  separator?: boolean;
  /** Optional muted hint shown after the label. */
  hint?: string;
}

interface Props<T extends string = string> {
  value: T;
  onChange: (v: T) => void;
  options: DropdownOption<T>[];
  /** Static label shown before the value (e.g. "Sort:"). */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Width of the menu in pixels — defaults to matching the trigger. */
  menuWidth?: number;
  /** Right-align the popout. Default left. */
  align?: 'left' | 'right';
  'aria-label'?: string;
}

/**
 * Custom dropdown replacing native `<select>`.
 *
 * Why hand-rolled: native selects look broken in dark themes and don't
 * expose styling for the option list. Radix would solve it but we'd
 * need 3 new deps (`@radix-ui/react-dropdown-menu` + framer-motion +
 * tailwind-animate). For this size of project the custom impl is
 * smaller, no deps, and the visual language is consistent across the
 * app.
 *
 * Behavior:
 *  - Click trigger → menu appears in a portal anchored to the trigger
 *  - Click outside / Escape → close
 *  - Click an option → fire onChange + close
 *  - Arrow keys / Enter / Tab — open-from-keyboard navigation
 *  - Portal escapes any parent z-index / overflow trap (same trick the
 *    queue popup uses).
 */
export function Dropdown<T extends string = string>({
  value,
  onChange,
  options,
  label,
  placeholder = 'Select',
  disabled,
  className,
  menuWidth,
  align = 'left',
  'aria-label': ariaLabel,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? placeholder;

  // Recompute position whenever opened. Anchored to the trigger's
  // bounding rect. The menu is `position: fixed` — viewport-relative —
  // so we use the rect coordinates directly. Adding window.scrollY
  // (the old bug) shifted the menu down by the scroll offset, making
  // it drift away from its trigger on any scrolled page.
  //
  // We also flip up when there's more room above than below, so on
  // a sticky toolbar near the bottom of the viewport the menu opens
  // upward instead of getting clipped.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 240;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    setCoords({
      top: openUp ? r.top - menuHeight - 4 : r.bottom + 4,
      left: align === 'right' ? r.right - (menuWidth ?? r.width) : r.left,
      width: menuWidth ?? r.width,
    });
  }, [align, menuWidth]);

  useEffect(() => {
    if (!open) return;
    reposition();
    // Highlight current value on open so arrow keys feel correct.
    setHighlight(options.findIndex((o) => o.value === value));
  }, [open, options, value, reposition]);

  // Close on outside click + Escape, scroll/resize keeps position fresh.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(options.length - 1, h + 1)); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
      else if (e.key === 'Enter')     {
        e.preventDefault();
        if (highlight >= 0 && highlight < options.length) {
          onChange(options[highlight].value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, options, highlight, onChange, reposition]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center justify-between gap-2 px-3 py-2 rounded-md',
          'bg-[#14110d] border border-[#1a160f] text-[11px] text-[#E8DCC8]',
          'hover:border-[#2d2620] transition-colors',
          'focus:outline-none focus:border-[#D4BFA0]/40 focus:ring-1 focus:ring-[#D4BFA0]/20',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open && 'border-[#2d2620]',
          className,
        )}
      >
        {label && <span className="text-[#6a5d4a] font-mono uppercase tracking-wider text-[10px]">{label}</span>}
        <span className="flex-1 text-left truncate">{display}</span>
        <ChevronDown size={11} className={cn('text-[#6a5d4a] transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {/* Portal so the menu escapes any stacking-context trap created by
          parent backdrop-blur / fixed / sticky elements (this is the same
          trick the queue popup uses elsewhere). */}
      {open && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className={cn(
            'fixed z-[200] py-1 rounded-lg overflow-hidden',
            'bg-[#0a0907]/95 backdrop-blur-xl border border-white/[0.08]',
            'shadow-[0_4px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.03)_inset]',
            'animate-in fade-in zoom-in-95 duration-100',
          )}
          style={{ top: coords.top, left: coords.left, width: coords.width, minWidth: 160 }}
        >
          {options.map((opt, i) => (
            <div key={opt.value}>
              {opt.separator && <div className="my-1 h-px bg-white/[0.06] mx-2" />}
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { onChange(opt.value); setOpen(false); triggerRef.current?.focus(); }}
                className={cn(
                  'w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-[#E8DCC8]',
                  'transition-colors',
                  highlight === i ? 'bg-white/[0.04]' : '',
                )}
              >
                <span className="w-3.5 flex items-center justify-center">
                  {opt.value === value && <Check size={11} className="text-[#E8D8B8]" />}
                </span>
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.hint && <span className="text-[10px] text-[#5a5142] font-mono">{opt.hint}</span>}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
