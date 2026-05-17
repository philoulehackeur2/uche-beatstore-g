import type { Track } from '@/lib/types';
import { fmtBpm, fmtKey, fmtLUFS, fmtDuration, fmtPct } from '@/lib/audio/format';

interface Props {
  track: Track;
}

/**
 * 8-cell read-only analysis grid for the library detail page.
 *
 * Extracted from `library/[id]/page.tsx`. Pure presentation — no
 * mutation, no state. The detail page is the deep-dive view so we show
 * the full feature set here (Energy / Danceability / Valence /
 * Acousticness) even though the drawer's grid was pared back to
 * BPM + Scale.
 */
export function LibraryMetadataGrid({ track }: Props) {
  const cells: { label: string; value: string }[] = [
    { label: 'BPM', value: fmtBpm(track.bpm) },
    { label: 'Key', value: fmtKey(track.key, track.scale) },
    { label: 'Loudness', value: fmtLUFS(track.loudness) },
    { label: 'Duration', value: fmtDuration(track.duration_seconds) },
    { label: 'Energy', value: fmtPct(track.energy) },
    { label: 'Danceability', value: fmtPct(track.danceability) },
    { label: 'Valence', value: fmtPct(track.valence) },
    { label: 'Acousticness', value: fmtPct(track.acousticness) },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
      {cells.map((m) => (
        <div key={m.label} className="bg-[#0e0c08] border border-[#1a160f] rounded-lg px-4 py-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1">{m.label}</p>
          <p className="text-[13px] font-mono text-[#E8DCC8]">{m.value}</p>
        </div>
      ))}
    </div>
  );
}
