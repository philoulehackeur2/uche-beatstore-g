'use client';

import { X } from 'lucide-react';

const CHROMATIC_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

const STATUS_LABELS: Record<string, string> = {
  finished: 'Finished',
  needs_work: 'Needs work',
  archived: 'Archived',
};

export interface LibraryFilters {
  bpmMin: number | null;
  bpmMax: number | null;
  keys: Set<string>;
  scale: 'all' | 'major' | 'minor';
  statuses: Set<string>;
  rating: number | null;
}

export const DEFAULT_FILTERS: LibraryFilters = {
  bpmMin: null,
  bpmMax: null,
  keys: new Set(),
  scale: 'all',
  statuses: new Set(),
  rating: null,
};

export function hasActiveFilters(f: LibraryFilters): boolean {
  return (
    f.bpmMin != null ||
    f.bpmMax != null ||
    f.keys.size > 0 ||
    f.scale !== 'all' ||
    f.statuses.size > 0 ||
    f.rating != null
  );
}

function activeFilterCount(f: LibraryFilters): number {
  return [
    f.bpmMin != null || f.bpmMax != null,
    f.keys.size > 0,
    f.scale !== 'all',
    f.statuses.size > 0,
    f.rating != null,
  ].filter(Boolean).length;
}

interface FilterBarProps {
  filters: LibraryFilters;
  onChange: (f: LibraryFilters) => void;
}

export { activeFilterCount };

export function FilterBar({ filters, onChange }: FilterBarProps) {
  const set = (partial: Partial<LibraryFilters>) => onChange({ ...filters, ...partial });

  const toggleKey = (k: string) => {
    const next = new Set(filters.keys);
    if (next.has(k)) next.delete(k); else next.add(k);
    set({ keys: next });
  };

  const toggleStatus = (s: string) => {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s); else next.add(s);
    set({ statuses: next });
  };

  return (
    <div className="border border-white/15 p-5 mb-6 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* BPM range */}
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/40 mb-3">BPM range</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              placeholder="Min"
              min={0}
              max={999}
              value={filters.bpmMin ?? ''}
              onChange={(e) => set({ bpmMin: e.target.value ? Number(e.target.value) : null })}
              className="w-full bg-transparent border border-white/15 px-3 py-2 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-white/40 tabular-nums"
            />
            <span className="text-white/30 text-[10px] shrink-0">–</span>
            <input
              type="number"
              placeholder="Max"
              min={0}
              max={999}
              value={filters.bpmMax ?? ''}
              onChange={(e) => set({ bpmMax: e.target.value ? Number(e.target.value) : null })}
              className="w-full bg-transparent border border-white/15 px-3 py-2 text-[11px] text-white placeholder-white/30 focus:outline-none focus:border-white/40 tabular-nums"
            />
          </div>
        </div>

        {/* Scale */}
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/40 mb-3">Scale</p>
          <div className="flex gap-2">
            {(['all', 'major', 'minor'] as const).map((s) => (
              <button
                key={s}
                onClick={() => set({ scale: s })}
                className={`px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                  filters.scale === s
                    ? 'bg-white text-black'
                    : 'border border-white/15 text-white/50 hover:text-white hover:border-white/30'
                }`}
              >
                {s === 'all' ? 'Any' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/40 mb-3">Status</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <button
                key={val}
                onClick={() => toggleStatus(val)}
                className={`px-3 py-2 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors ${
                  filters.statuses.has(val)
                    ? 'bg-white text-black'
                    : 'border border-white/15 text-white/50 hover:text-white hover:border-white/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Min rating */}
        <div>
          <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/40 mb-3">Min rating</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => set({ rating: filters.rating === star ? null : star })}
                className={`w-8 h-8 flex items-center justify-center text-[14px] transition-colors border ${
                  filters.rating != null && star <= filters.rating
                    ? 'text-white border-white/40'
                    : 'text-white/20 border-white/10 hover:text-white/50'
                }`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Key picker — chromatic in circle-of-fifths order */}
      <div>
        <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/40 mb-3">Key</p>
        <div className="flex gap-2 flex-wrap">
          {CHROMATIC_KEYS.map((k) => {
            const active = filters.keys.has(k);
            return (
              <button
                key={k}
                onClick={() => toggleKey(k)}
                className={`w-10 h-10 text-[11px] font-medium transition-all ${
                  active
                    ? 'bg-white text-black'
                    : 'border border-white/15 text-white/50 hover:text-white hover:border-white/30'
                }`}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters(filters) && (
        <div className="flex items-center gap-3 flex-wrap pt-4 border-t border-white/10">
          <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-white/30">Active:</span>
          {(filters.bpmMin != null || filters.bpmMax != null) && (
            <Chip
              label={`BPM ${filters.bpmMin ?? '?'} – ${filters.bpmMax ?? '?'}`}
              onRemove={() => set({ bpmMin: null, bpmMax: null })}
            />
          )}
          {filters.scale !== 'all' && (
            <Chip label={filters.scale} onRemove={() => set({ scale: 'all' })} />
          )}
          {Array.from(filters.keys).map((k) => (
            <Chip key={k} label={k} onRemove={() => toggleKey(k)} />
          ))}
          {Array.from(filters.statuses).map((s) => (
            <Chip key={s} label={STATUS_LABELS[s] ?? s} onRemove={() => toggleStatus(s)} />
          ))}
          {filters.rating != null && (
            <Chip label={`★ ≥ ${filters.rating}`} onRemove={() => set({ rating: null })} />
          )}
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS, keys: new Set(), statuses: new Set() })}
            className="text-[9px] font-medium uppercase tracking-[0.15em] text-white/40 hover:text-white ml-1 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 border border-white/20 pl-3 pr-2 py-1.5 text-[10px] uppercase tracking-[0.1em] text-white">
      {label}
      <button onClick={onRemove} className="text-white/40 hover:text-white transition-colors leading-none">
        <X size={10} />
      </button>
    </span>
  );
}
