'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  X, ExternalLink, Music, Play, Pause, ChevronRight, ShoppingBag,
} from 'lucide-react';
import { LicenseSelector } from '@/components/store/LicenseSelector';
import { fmtDur, getSimilarTracks } from './helpers';
import { TagChips } from './TagChips';
import type { StoreTrack, LicenseTier } from './types';

interface Props {
  track: StoreTrack;
  allTracks: StoreTrack[];
  licenses: LicenseTier[];
  priceLease: number | null;
  priceExclusive: number | null;
  isCurrent: boolean;
  isPlaying: boolean;
  progress: number;
  onPlay: () => void;
  onAddLease: () => void;
  onAddExclusive: () => void;
  onFreeDownload: () => void;
  onClose: () => void;
  onSelectTrack: (t: StoreTrack) => void;
  accentColor: string;
}

export function BeatPreviewDrawer({
  track, allTracks, licenses, priceLease, priceExclusive, isCurrent, isPlaying, progress,
  onPlay, onAddLease, onAddExclusive, onFreeDownload, onClose, onSelectTrack, accentColor,
}: Props) {
  const defaultLicenseId = priceLease != null ? 'lease' : priceExclusive != null ? 'exclusive' : licenses[0]?.id ?? 'lease';
  const [selectedLicense, setSelectedLicense] = useState<string>(defaultLicenseId);

  useEffect(() => {
    setSelectedLicense(priceLease != null ? 'lease' : priceExclusive != null ? 'exclusive' : licenses[0]?.id ?? 'lease');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const similar = useMemo(() => getSimilarTracks(track, allTracks, 5), [track, allTracks]);

  const bars = useMemo(() => {
    const seed = track.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 36 }, (_, i) => {
      const s = (seed * (i + 1) * 2654435761) >>> 0;
      return Math.max(12, Math.min(88, (s % 70) + 15 + Math.sin(i * 0.5 + seed) * 10));
    });
  }, [track.id]);

  const dur = track.duration_seconds ?? 0;
  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };

  const currentSec = isCurrent ? progress * dur : 0;

  const activeLicenses: LicenseTier[] = licenses.length > 0
    ? [...licenses].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [
      priceLease != null
        ? { id: 'lease', name: 'Lease', price_usd: priceLease, file_types: ['MP3', 'WAV'], is_exclusive: false }
        : null,
      priceExclusive != null
        ? { id: 'exclusive', name: 'Exclusive', price_usd: priceExclusive, file_types: ['MP3', 'WAV', 'STEMS'], is_exclusive: true }
        : null,
    ].filter(Boolean) as LicenseTier[];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-full max-w-[420px] z-50 flex flex-col bg-[#0c0a08] border-l border-[#1f1a13] shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-right duration-300">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1a13] shrink-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5a5142]">Preview</p>
          <div className="flex items-center gap-2">
            <Link
              href={`/store/${track.id}`}
              className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a] hover:text-[#a08a6a] transition-colors flex items-center gap-1"
            >
              Full page
              <ExternalLink size={9} />
            </Link>
            <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4a4338] hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.04] transition-all">
              <X size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 border-b border-[#1f1a13]">
            <div className="flex gap-4">
              <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-[#0a0907] border border-[#1f1a13] shrink-0">
                {track.cover_url ? (
                  <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#3a3328]">
                    <Music size={28} />
                  </div>
                )}
                <button
                  onClick={onPlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 hover:bg-black/60 transition-colors"
                >
                  {isCurrent && isPlaying
                    ? <Pause size={20} fill="currentColor" className="text-white" />
                    : <Play size={20} fill="currentColor" className="text-white ml-0.5" />}
                </button>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p
                  className="text-[15px] font-medium text-[#E8DCC8] leading-tight truncate"
                  style={isCurrent ? { color: accentColor } : {}}
                >
                  {track.title}
                </p>
                <p className="text-[10px] uppercase tracking-widest mt-1 font-bold" style={{ color: accentColor }}>
                  {track.type}
                </p>
                <TagChips tags={track.tags ?? []} max={4} accentGenre />
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-[#1f1a13]">
            <div className="relative h-14 flex items-center gap-[2px]">
              {bars.map((h, i) => {
                const frac = i / bars.length;
                const active = isCurrent && frac < progress;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-full transition-all duration-75"
                    style={{
                      height: `${h}%`,
                      backgroundColor: active ? accentColor : '#1c1a16',
                      opacity: active ? 1 : 0.6,
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[9px] font-mono text-[#5a5142] tabular-nums">{fmt(currentSec)}</span>
              <span className="text-[9px] font-mono text-[#5a5142] tabular-nums">{fmt(dur)}</span>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-[#1f1a13]">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-3">Studio specs</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Tempo', value: track.bpm ? `${track.bpm} BPM` : '—' },
                { label: 'Key', value: track.key ? `${track.key}${track.scale === 'minor' ? 'm' : ''}` : '—' },
                { label: 'Duration', value: fmtDur(track.duration_seconds) },
                { label: 'Type', value: track.type?.toUpperCase() ?? '—' },
                { label: 'Stems', value: track.stems_status === 'done' ? 'Available' : 'Not included' },
                { label: 'WAV', value: track.wav_url ? 'Uploaded' : 'On request' },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 bg-[#0a0907] rounded-lg px-3 py-2.5 border border-[#1a160f]">
                  <span className="text-[8px] font-mono uppercase tracking-wider text-[#4a4338]">{label}</span>
                  <span className={`text-[11px] font-mono font-medium ${label === 'Stems' && track.stems_status === 'done' ? 'text-[#6DC6A4]' : 'text-[#E8DCC8]'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {similar.length > 0 && (
            <div className="px-5 py-4 border-b border-[#1f1a13]">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-3">Similar beats</p>
              <div className="space-y-1.5">
                {similar.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onSelectTrack(s)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#16130e] border border-transparent hover:border-[#1f1a13] transition-all text-left group"
                  >
                    <div className="w-8 h-8 rounded-md overflow-hidden bg-[#0a0907] shrink-0">
                      {s.cover_url
                        ? <img src={s.cover_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[#3a3328]"><Music size={12} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[#E8DCC8] truncate group-hover:text-[#D4BFA0] transition-colors">{s.title}</p>
                      <p className="text-[9px] font-mono text-[#5a5142] uppercase">
                        {s.bpm ? `${s.bpm} BPM` : ''}{s.key ? ` · ${s.key}` : ''}
                      </p>
                    </div>
                    <ChevronRight size={12} className="text-[#3a3328] group-hover:text-[#6a5d4a] shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="px-5 py-4 pb-24">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-3">License</p>
            <LicenseSelector
              tiers={activeLicenses}
              selectedId={selectedLicense}
              onSelect={setSelectedLicense}
              accentColor={accentColor}
              isFreeDownload={track.free_download_enabled ?? false}
              onFreeDownload={onFreeDownload}
            />
          </div>
        </div>

        {!track.free_download_enabled && (
          <div className="shrink-0 border-t border-[#1f1a13] bg-[#0c0a08] px-5 py-4">
            <div className="flex items-center gap-2">
              {priceLease != null && (
                <button
                  onClick={onAddLease}
                  className="flex-1 py-3 rounded-xl text-[#E8DCC8] text-[11px] font-bold uppercase tracking-widest transition-all hover:bg-white/[0.08] active:scale-[0.99] flex flex-col items-center justify-center gap-0.5 border border-white/[0.10] bg-white/[0.04]"
                >
                  <span className="text-[9px] font-mono text-[#6a5d4a] tracking-wider">Lease</span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag size={12} />
                    ${priceLease.toLocaleString()}
                  </span>
                </button>
              )}
              {priceExclusive != null && (
                <button
                  onClick={onAddExclusive}
                  className="flex-1 py-3 rounded-xl text-black text-[11px] font-bold uppercase tracking-widest transition-all hover:opacity-90 active:scale-[0.99] flex flex-col items-center justify-center gap-0.5"
                  style={{ background: `linear-gradient(to right, ${accentColor}, #c5a880)` }}
                >
                  <span className="text-[9px] font-mono text-black/60 tracking-wider">Exclusive</span>
                  <span className="flex items-center gap-1">
                    <ShoppingBag size={12} />
                    ${priceExclusive.toLocaleString()}
                  </span>
                </button>
              )}
              {priceLease == null && priceExclusive == null && (
                <div className="w-full py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] text-center">
                  <p className="text-[11px] text-[#5a5142]">Not available for purchase</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
