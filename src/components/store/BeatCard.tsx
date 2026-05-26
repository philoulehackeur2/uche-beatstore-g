'use client';

import { useMemo } from 'react';
import { Music, Play, Heart, Download } from 'lucide-react';
import { MiniWaveform } from '@/components/player/MiniWaveform';
import { MusicArtwork } from '@/components/store/MusicArtwork';
import { getSimilarTracks } from './helpers';
import { TagChips } from './TagChips';
import type { StoreTrack } from './types';

interface Props {
  track: StoreTrack;
  allTracks: StoreTrack[];
  priceLease: number | null;
  priceExclusive: number | null;
  isCurrent: boolean;
  isPlaying: boolean;
  isPreview: boolean;
  onPlay: () => void;
  onPreview: () => void;
  onAddLease: () => void;
  onAddExclusive: () => void;
  onFreeDownload: () => void;
  accentColor: string;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
}

export function BeatCard({
  track, allTracks, priceLease, priceExclusive, isCurrent, isPlaying, isPreview,
  onPlay, onPreview, onAddLease, onAddExclusive, onFreeDownload, accentColor,
  isWishlisted, onToggleWishlist,
}: Props) {
  void onAddExclusive;
  const similar = useMemo(() => getSimilarTracks(track, allTracks, 5), [track, allTracks]);

  return (
    <div
      id={`beat-${track.id}`}
      className={`group rounded-2xl border bg-[#14110d] overflow-hidden transition-all flex flex-col ${isPreview
          ? 'border-[#D4BFA0]/50 shadow-lg shadow-[#D4BFA0]/5'
          : isPlaying
            ? 'shadow-md animate-[beat-pulse_2s_ease-in-out_infinite]'
            : isCurrent
              ? 'border-[#D4BFA0]/30 shadow-md shadow-[#D4BFA0]/5'
              : 'border-[#1f1a13] hover:border-[#2d2620]'
        }`}
      style={
        isPreview ? { borderColor: `${accentColor}80` }
          : isPlaying ? { borderColor: `${accentColor}66`, boxShadow: `0 0 0 1px ${accentColor}33` }
            : isCurrent ? { borderColor: `${accentColor}4D` }
              : {}
      }
    >
      <div className="relative w-full aspect-square">
        <MusicArtwork
          artist={null}
          music={track.title}
          albumArt={track.cover_url ?? null}
          isSong={true}
          isPlaying={isCurrent && isPlaying}
          onTogglePlay={onPlay}
        />

        <div className="relative z-10 w-full h-full bg-[#0a0907] overflow-hidden">
          {track.cover_url ? (
            <img
              loading="lazy"
              src={track.cover_url}
              alt=""
              className="block w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#2A2418] to-[#0a0907] flex items-center justify-center text-[#a08a6a]">
              <Music size={36} />
            </div>
          )}
        </div>

        {track.bpm && (
          <div className="absolute top-2 left-2 z-20 text-[8px] font-mono bg-black/70 text-white px-2 py-0.5 rounded border border-[#1f1a13] backdrop-blur-sm pointer-events-none">
            {track.bpm} BPM
          </div>
        )}
        {track.key && (
          <div
            className="absolute top-2 right-2 z-20 text-[8px] font-mono font-semibold px-2 py-0.5 rounded backdrop-blur-sm pointer-events-none"
            style={{ backgroundColor: `${accentColor}CC`, color: '#0a0907' }}
          >
            {track.key}{track.scale === 'minor' ? 'm' : ''}
          </div>
        )}
        {track.free_download_enabled && (
          <div className="absolute top-2 left-2 z-20 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider bg-[#6DC6A4] text-black pointer-events-none">
            Free
          </div>
        )}

        {!track.free_download_enabled && (priceLease != null || priceExclusive != null) && (
          <div className="absolute bottom-2 right-2 z-30 flex items-center gap-1 pointer-events-none">
            {priceLease != null && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/60 text-[#E8DCC8] border border-white/10 backdrop-blur-sm">
                ${priceLease}
              </span>
            )}
            {priceExclusive != null && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-bold text-black backdrop-blur-sm"
                style={{ backgroundColor: `${accentColor}E6` }}
              >
                Ex
              </span>
            )}
          </div>
        )}

        {isCurrent && (
          <div className="absolute top-8 left-2 z-20 w-1.5 h-1.5 rounded-full bg-[#6DC6A4] shadow-[0_0_6px_#6DC6A4] animate-pulse pointer-events-none" />
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <button onClick={onPreview} className="text-left">
          <p className="text-[14px] font-semibold text-white truncate hover:text-[#D4BFA0] transition-colors"
            style={isPreview || isCurrent ? { color: accentColor } : {}}>
            {track.title}
          </p>
        </button>

        <TagChips tags={track.tags ?? []} max={3} accentGenre />

        <div className="mt-3 px-0.5">
          <MiniWaveform
            trackId={track.id}
            peaksUrl={track.peaks_url}
            height={36}
            isActive={isCurrent}
            onPlay={!isCurrent ? onPlay : undefined}
          />
        </div>

        {track.description && (
          <p className="text-[11px] text-[#a08a6a] mt-2 line-clamp-2 leading-relaxed">{track.description}</p>
        )}

        <div className="mt-auto pt-3">
          {track.free_download_enabled ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFreeDownload(); }}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-[#6DC6A4]/10 border border-[#6DC6A4]/25 hover:bg-[#6DC6A4]/20 text-[#6DC6A4] text-[11px] font-bold uppercase tracking-wider transition-colors"
            >
              <Download size={12} />
              Free Download
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onAddLease(); }}
                disabled={priceLease == null}
                className="flex-1 flex flex-col items-start px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.15] text-left transition-colors disabled:opacity-30"
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a]">Lease</span>
                <span className="text-[13px] font-bold text-[#E8DCC8] tabular-nums">
                  {priceLease != null ? `$${priceLease.toLocaleString()}` : '—'}
                </span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onAddExclusive(); }}
                disabled={priceExclusive == null}
                className="flex-1 flex flex-col items-start px-3 py-2 rounded-md text-left transition-colors disabled:opacity-30 hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-black/70">Excl</span>
                <span className="text-[13px] font-bold text-black tabular-nums">
                  {priceExclusive != null ? `$${priceExclusive.toLocaleString()}` : '—'}
                </span>
              </button>
              {onToggleWishlist && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleWishlist(); }}
                  aria-pressed={!!isWishlisted}
                  className={`w-9 h-9 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                    isWishlisted
                      ? 'bg-[#c8a84b]/15 border-[#c8a84b]/40 text-[#c8a84b]'
                      : 'bg-white/[0.04] border-white/[0.06] text-[#5a5142] hover:bg-white/[0.08] hover:text-[#E8DCC8]'
                  }`}
                  title={isWishlisted ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Heart size={13} fill={isWishlisted ? 'currentColor' : 'none'} />
                </button>
              )}
            </div>
          )}
        </div>

        {similar.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#1a160f]">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-2">Similar</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    document.getElementById(`beat-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1a160f] border border-[#1f1a13] hover:border-[#2d2620] transition-colors group/sim"
                >
                  <Play size={8} className="text-[#5a5142] group-hover/sim:text-[#a08a6a] transition-colors shrink-0" />
                  <p className="text-[10px] text-[#a08a6a] font-medium whitespace-nowrap max-w-[90px] truncate">{s.title}</p>
                  {s.bpm && <span className="text-[9px] font-mono text-[#5a5142] shrink-0">{s.bpm}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
