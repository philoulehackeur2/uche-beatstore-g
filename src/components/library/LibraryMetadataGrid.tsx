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

interface CellDef {
  label: string;
  value: string;
  accent?: string;
  fill?: number | null;
  fillColor?: string;
  large?: boolean;
}

export function LibraryMetadataGrid({ track }: Props) {
  const isMinor = track.scale === 'minor';

  const cells: CellDef[] = [
    {
      label: 'BPM',
      value: fmtBpm(track.bpm),
      accent: 'text-[#E8D8B8]',
      large: true,
    },
    {
      label: 'Key',
      value: fmtKey(track.key, track.scale),
      accent: isMinor ? 'text-[#9d95e8]' : 'text-[#c8a47a]',
      large: true,
    },
    {
      label: 'Duration',
      value: fmtDuration(track.duration_seconds),
      accent: 'text-[#E8DCC8]',
    },
    {
      label: 'Loudness',
      value: fmtLUFS(track.loudness),
      accent: 'text-[#a08a6a]',
    },
    {
      label: 'Energy',
      value: fmtPct(track.energy),
      fill: track.energy,
      fillColor: '#e87a5a',
      accent: 'text-[#e87a5a]',
    },
    {
      label: 'Danceability',
      value: fmtPct(track.danceability),
      fill: track.danceability,
      fillColor: '#D4BFA0',
      accent: 'text-[#D4BFA0]',
    },
    {
      label: 'Valence',
      value: fmtPct(track.valence),
      fill: track.valence,
      fillColor: '#9d95e8',
      accent: 'text-[#9d95e8]',
    },
    {
      label: 'Acoustic',
      value: fmtPct(track.acousticness),
      fill: track.acousticness,
      fillColor: '#8ecf9f',
      accent: 'text-[#8ecf9f]',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={`relative overflow-hidden bg-[#0e0c08] border border-[#1a160f] rounded-xl px-4 py-4 ${
            cell.large ? 'md:col-span-1' : ''
          }`}
        >
          {/* Fill bar for percentage cells */}
          {cell.fill != null && (
            <div
              className="absolute bottom-0 left-0 h-[3px] rounded-full opacity-60 transition-all duration-700"
              style={{
                width: `${Math.round(cell.fill * 100)}%`,
                backgroundColor: cell.fillColor,
              }}
            />
          )}

          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a5142] mb-2">
            {cell.label}
          </p>
          <p className={`font-mono font-bold leading-none ${cell.accent ?? 'text-[#E8DCC8]'} ${
            cell.large ? 'text-[22px]' : 'text-[16px]'
          }`}>
            {cell.value}
          </p>

          {/* Key scale badge */}
          {cell.label === 'Key' && track.key && (
            <span className={`mt-2 inline-block text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
              isMinor
                ? 'text-[#9d95e8] bg-[#1a1833]/60 border border-[#534AB7]/25'
                : 'text-[#c8a47a] bg-[#1f1a10]/60 border border-[#3d3020]/30'
            }`}>
              {isMinor ? 'Minor' : 'Major'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
