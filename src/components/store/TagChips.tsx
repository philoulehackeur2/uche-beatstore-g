'use client';

import type { TrackTag } from './types';

interface Props {
  tags: TrackTag[];
  max?: number;
  accentGenre?: boolean;
}

export function TagChips({ tags, max = 3, accentGenre = false }: Props) {
  const display = tags
    .filter((t) => t.category === 'genre' || t.category === 'mood')
    .slice(0, max + 1);
  if (display.length === 0) return null;
  const visible = display.slice(0, max);
  const overflow = display.length - max;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {visible.map((t) => {
        const isGenre = t.category === 'genre';
        return (
          <span
            key={t.tag}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a] border ${
              isGenre && accentGenre
                ? 'bg-[#D4BFA0]/10 border-[#D4BFA0]/20'
                : 'bg-[#1f1a13] border-[#1f1a13]'
            }`}
          >
            {t.tag}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a] bg-[#1a160f]">
          +{overflow}
        </span>
      )}
    </div>
  );
}
