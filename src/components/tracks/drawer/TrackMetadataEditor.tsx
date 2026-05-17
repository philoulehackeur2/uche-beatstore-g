'use client';

import { Track, TrackStatus, TrackType } from '@/lib/types';
import { StarRating } from '@/components/tracks/StarRating';

const TYPE_OPTIONS: { value: TrackType; label: string }[] = [
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'song',         label: 'Song' },
  { value: 'remix',        label: 'Remix' },
];

const STATUS_OPTIONS: { value: TrackStatus; label: string; color: string }[] = [
  { value: 'finished',   label: 'Finished',   color: 'bg-[#0a1f0a] text-[#8ecf9f] border-[#1f3a1f]' },
  { value: 'needs_work', label: 'Needs work', color: 'bg-[#1f1a0a] text-[#c8a84b] border-[#3a2f1f]' },
  { value: 'archived',   label: 'Archived',   color: 'bg-[#16130e] text-[#6a5d4a] border-[#1f1a13]' },
];

interface Props {
  track: Track;
  /** Caller patches the track. Drives optimistic + PATCH + rollback. */
  onPatch: (patch: Record<string, unknown>) => void;
  /** Rating mutates through its own /api/tracks/[id]/rate endpoint; the
   *  drawer wires the result through the optimistic overlay so it sticks
   *  past the drawer close. */
  onRatingChange: (newRating: number) => void;
}

/**
 * Type / Status / Rating editor — extracted from TrackDetailsDrawer.
 *
 * Owns nothing stateful: it's a thin set of controls that emit changes
 * through `onPatch` / `onRatingChange`. The drawer keeps the patchTrack
 * helper (which manages optimistic overlay + PATCH + rollback) since
 * that helper is shared with notes editing and other drawer surfaces.
 */
export function TrackMetadataEditor({ track, onPatch, onRatingChange }: Props) {
  return (
    <div className="p-8 border-b border-[#1f1a13] space-y-5">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#4a4338]">Track Metadata</h3>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-[#4a4338] uppercase tracking-widest">Type</span>
        <select
          // `value` (not `defaultValue`) so the select reflects optimistic
          // updates when the parent's track prop changes after PATCH.
          value={track.type}
          onChange={(e) => onPatch({ type: e.target.value })}
          className="bg-[#0a0907] border border-[#1f1a13] rounded px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-[#E8D8B8] focus:outline-none focus:border-[#D4BFA0]"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#0a0907]">{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-[#4a4338] uppercase tracking-widest">Status</span>
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = (track.status || 'needs_work') === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onPatch({ status: opt.value })}
                className={`px-2 py-1 rounded text-[9px] font-mono uppercase tracking-widest border transition-colors ${
                  active ? opt.color : 'bg-transparent text-[#4a4338] border-[#1f1a13] hover:border-[#2d2620] hover:text-[#6a5d4a]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold text-[#4a4338] uppercase tracking-widest">Rating</span>
        <StarRating
          trackId={track.id}
          initialRating={track.rating || 0}
          onChange={onRatingChange}
        />
      </div>
    </div>
  );
}
