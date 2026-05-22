'use client';

import { cn } from '@/lib/utils';
import type { DitherMode, ColorMode } from '@/components/ui/dither-shader';

export interface DitherModeSelectorProps {
  mode: DitherMode;
  colorMode: ColorMode;
  onChange: (mode: DitherMode, colorMode: ColorMode) => void;
}

const DITHER_MODES: { value: DitherMode; label: string }[] = [
  { value: 'bayer', label: 'Bayer' },
  { value: 'halftone', label: 'Halftone' },
  { value: 'noise', label: 'Noise' },
  { value: 'crosshatch', label: 'Cross' },
];

const COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: 'original', label: 'Color' },
  { value: 'grayscale', label: 'Gray' },
  { value: 'duotone', label: 'Duotone' },
];

/**
 * DitherModeSelector — control strip for selecting dither and color modes.
 *
 * Styled to match the Antigravity theme:
 * - 10px font-mono uppercase tracking-[0.2em]
 * - Active: text-[#D4BFA0] border-b border-[#D4BFA0]
 * - Inactive: text-[#6a5d4a] hover:text-[#a08a6a]
 *
 * Fully keyboard accessible with role="radiogroup" and aria-checked.
 */
export function DitherModeSelector({
  mode,
  colorMode,
  onChange,
}: DitherModeSelectorProps) {
  return (
    <div className="flex flex-col gap-2 py-2 px-1">
      {/* Dither mode row */}
      <div
        role="radiogroup"
        aria-label="Dither mode"
        className="flex items-center gap-3"
      >
        {DITHER_MODES.map(({ value, label }) => {
          const isActive = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(value, colorMode)}
              className={cn(
                'text-[10px] font-mono uppercase tracking-[0.2em] pb-0.5 transition-colors',
                isActive
                  ? 'text-[#D4BFA0] border-b border-[#D4BFA0]'
                  : 'text-[#6a5d4a] hover:text-[#a08a6a] border-b border-transparent'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Color mode row */}
      <div
        role="radiogroup"
        aria-label="Color mode"
        className="flex items-center gap-3"
      >
        {COLOR_MODES.map(({ value, label }) => {
          const isActive = colorMode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onChange(mode, value)}
              className={cn(
                'text-[10px] font-mono uppercase tracking-[0.2em] pb-0.5 transition-colors',
                isActive
                  ? 'text-[#D4BFA0] border-b border-[#D4BFA0]'
                  : 'text-[#6a5d4a] hover:text-[#a08a6a] border-b border-transparent'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
