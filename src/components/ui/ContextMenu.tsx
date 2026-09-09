'use client';

/**
 * Right-click menu.
 *
 * Shared: the cover art canvas and layer list use it, and so does the store
 * editor's section stack. It knows nothing about either — it takes viewport
 * coordinates and a list of items.
 *
 * Rendered in a fixed-position layer at viewport coordinates. Per the project's
 * gotchas: bounding-rect coords are already viewport-relative, so `window.scrollY`
 * must NOT be added here.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export type ContextMenuItem =
  | { kind: 'separator' }
  | {
    kind: 'action';
    label: string;
    shortcut?: string;
    disabled?: boolean;
    danger?: boolean;
    onSelect: () => void;
  };

export function ContextMenu({
  x, y, items, onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  /**
   * Nudge the menu back on screen if it would overflow.
   *
   * Layout effect so the correction happens before paint — a menu that appears
   * half off the edge and then jumps reads as a glitch.
   */
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    // This is the sanctioned use of useLayoutEffect: measure the rendered box
    // and correct its position before the browser paints, so an edge-clamped
    // menu never visibly jumps. The lint rule below targets effects that
    // cascade into further renders; this one settles in the same frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({
      x: Math.min(x, window.innerWidth - box.width - 8),
      y: Math.min(y, window.innerHeight - box.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Capture phase: close before the click can land on whatever is underneath.
    const onDown = () => onClose();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Layer actions"
      style={{ left: position.x, top: position.y }}
      className="fixed z-[1001] min-w-48 border border-white/20 bg-[#0D0D0A] py-1 shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      // The menu owns its own clicks; the capture-phase closer above would
      // otherwise dismiss it before an item could fire.
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item, index) => (
        item.kind === 'separator' ? (
          // A separator carries no identity of its own, so its index is its key.
          <span key={`sep-${index}`} role="separator" className="my-1 block h-px bg-white/10" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            className={cn(
              'flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-[12px] transition-colors disabled:opacity-30',
              item.danger ? 'text-white/90 hover:bg-[#A95235]/20' : 'text-white/60 hover:bg-white/[0.10] hover:text-white/90',
              'disabled:hover:bg-transparent',
            )}
          >
            <span>{item.label}</span>
            {item.shortcut ? (
              <span className="shrink-0 font-mono text-[10px] text-white/40">{item.shortcut}</span>
            ) : null}
          </button>
        )
      ))}
    </div>
  );
}
