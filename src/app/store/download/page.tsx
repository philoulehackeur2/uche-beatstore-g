'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Download, Music, Loader2, CheckCircle2, ShieldCheck,
  ArrowLeft, Play, Pause, FileAudio, Package,
  AlertTriangle, ExternalLink,
} from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { MiniWaveform } from '@/components/player/MiniWaveform';
import type { Track } from '@/lib/types';

/* ─── Types ────────────────────────────────────────────────── */

interface PurchaseInfo {
  id: string;
  buyer_email: string;
  amount_usd: number;
  created_at: string;
  status: string;
}

interface DeliveryTrack extends Track {
  license_type: 'lease' | 'exclusive';
  file_types: string[];
}

/* ─── Helpers ───────────────────────────────────────────────── */

function fmt(s: number | null) {
  if (!s) return '—';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

/* ─── Page wrapper for Suspense ─────────────────────────────── */

export default function DownloadPortalWrapper() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <DownloadPortal />
    </Suspense>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#0a0907] flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-[#5a5142]" />
    </div>
  );
}

/* ─── Main portal ───────────────────────────────────────────── */

function DownloadPortal() {
  const searchParams = useSearchParams();
  const sessionId = searchParams?.get('session_id');

  const [purchase, setPurchase] = useState<PurchaseInfo | null>(null);
  const [tracks, setTracks] = useState<DeliveryTrack[]>([]);
  const [downloadBase, setDownloadBase] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  const { currentTrack, isPlaying, setTrack, togglePlay, setQueue } = usePlayer();

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID found. Check your purchase confirmation email for the download link.');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/store/delivery?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setPurchase(data.purchase);
        setTracks(data.tracks ?? []);
        setDownloadBase(data.download_base ?? '');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  const handleDownload = async (track: DeliveryTrack) => {
    if (!sessionId) return;
    setDownloading((d) => ({ ...d, [track.id]: true }));
    try {
      const url = `${downloadBase}?session_id=${encodeURIComponent(sessionId)}&track_id=${encodeURIComponent(track.id)}`;
      // Create an anchor click — the server 302s to /api/audio which sets
      // Content-Disposition: attachment so the browser saves the file.
      const a = document.createElement('a');
      a.href = url;
      a.download = track.title || 'track';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // Small delay so the "Downloading…" state is visible
      setTimeout(() => setDownloading((d) => ({ ...d, [track.id]: false })), 2000);
    }
  };

  const handlePlay = (track: DeliveryTrack) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    setQueue(tracks as Track[]);
    setTrack(track as Track);
  };

  /* ── Loading ── */
  if (loading) return <LoadingScreen />;

  /* ── Error / not found ── */
  if (error || !purchase) {
    return (
      <div className="min-h-screen bg-[#0a0907] text-[#E8DCC8] flex flex-col items-center justify-center gap-6 px-4 text-center">
        <AlertTriangle size={36} className="text-amber-500" />
        <div>
          <h1 className="text-[18px] font-bold text-white mb-2">Download not available</h1>
          <p className="text-[13px] text-[#6a5d4a] max-w-md leading-relaxed">
            {error ?? 'This download link is invalid or has expired.'}
          </p>
        </div>
        <Link
          href="/store"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#14110d] border border-[#1f1a13] text-[12px] text-[#a08a6a] hover:text-white hover:border-[#2d2620] transition-all"
        >
          <ArrowLeft size={13} />
          Back to store
        </Link>
      </div>
    );
  }

  const purchaseDate = new Date(purchase.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[#0a0907] text-[#E8DCC8]">
      {/* ── Header ── */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-10 pb-8">
        <Link
          href="/store"
          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#5a5142] hover:text-[#a08a6a] transition-colors mb-8"
        >
          <ArrowLeft size={10} />
          Back to store
        </Link>

        {/* Success banner */}
        <div className="rounded-2xl border border-[#6DC6A4]/20 bg-[#0e1f17]/60 px-6 py-5 mb-8 flex items-start gap-4">
          <CheckCircle2 size={22} className="text-[#6DC6A4] shrink-0 mt-0.5" />
          <div>
            <h1 className="text-[18px] font-bold text-white">Your files are ready</h1>
            <p className="text-[12px] text-[#6a5d4a] mt-1">
              Purchase confirmed · {purchaseDate} · ${Number(purchase.amount_usd).toFixed(2)}
            </p>
            <p className="text-[11px] text-[#5a5142] mt-0.5">
              Receipt sent to <span className="text-[#a08a6a]">{purchase.buyer_email}</span>
            </p>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-center gap-2 mb-6 text-[10px] font-mono text-[#3a3328]">
          <ShieldCheck size={11} />
          <span>
            Download links are private to this session.
            Bookmark this page to re-download your files.
          </span>
        </div>

        {/* Track list */}
        <div className="space-y-3">
          {tracks.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#1f1a13] py-12 text-center text-[#5a5142] text-[13px]">
              No tracks found in this purchase.
            </div>
          )}

          {tracks.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            const isTrackPlaying = isCurrent && isPlaying;
            const isDownloading = downloading[track.id];

            return (
              <div
                key={track.id}
                className={`rounded-2xl border transition-all ${
                  isCurrent ? 'border-[#D4BFA0]/30 bg-[#14110d]' : 'border-[#1f1a13] bg-[#14110d]/60'
                }`}
              >
                <div className="flex items-center gap-4 p-4">
                  {/* Cover art + play */}
                  <button
                    onClick={() => handlePlay(track)}
                    className="relative w-14 h-14 rounded-xl overflow-hidden bg-[#0a0907] border border-[#1f1a13] shrink-0 group"
                  >
                    {track.cover_url ? (
                      <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#3a3328]">
                        <Music size={18} />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isTrackPlaying
                        ? <Pause size={16} fill="currentColor" className="text-white" />
                        : <Play size={16} fill="currentColor" className="text-white ml-0.5" />}
                    </div>
                    {isCurrent && (
                      <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-[#6DC6A4] animate-pulse" />
                    )}
                  </button>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white truncate">{track.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                        track.license_type === 'exclusive'
                          ? 'text-[#D4BFA0] bg-[#D4BFA0]/10 border-[#D4BFA0]/20'
                          : 'text-[#6a5d4a] bg-white/[0.03] border-[#1f1a13]'
                      }`}>
                        {track.license_type === 'exclusive' ? 'Exclusive' : 'Lease'}
                      </span>
                      {track.bpm && (
                        <span className="text-[9px] font-mono text-[#5a5142]">{track.bpm} BPM</span>
                      )}
                      {track.key && (
                        <span className="text-[9px] font-mono text-[#5a5142]">{track.key} {track.scale ?? ''}</span>
                      )}
                      {track.duration_seconds && (
                        <span className="text-[9px] font-mono text-[#5a5142]">{fmt(track.duration_seconds)}</span>
                      )}
                    </div>

                    {/* Waveform */}
                    <div className="mt-2">
                      <MiniWaveform
                        trackId={track.id}
                        peaksUrl={track.peaks_url}
                        height={28}
                        isActive={isCurrent}
                      />
                    </div>
                  </div>

                  {/* Download button */}
                  <button
                    onClick={() => handleDownload(track)}
                    disabled={isDownloading}
                    className="shrink-0 flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl bg-[#D4BFA0] hover:bg-[#E8D8B8] disabled:opacity-60 text-black transition-all"
                  >
                    {isDownloading
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Download size={14} />}
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                      {isDownloading ? 'Preparing…' : 'Download'}
                    </span>
                  </button>
                </div>

                {/* File types row */}
                <div className="border-t border-[#1a160f] px-4 py-2 flex items-center gap-2 flex-wrap">
                  <FileAudio size={10} className="text-[#3a3328]" />
                  <span className="text-[9px] font-mono text-[#3a3328] uppercase tracking-wider">
                    Included:
                  </span>
                  {track.file_types.map((ft) => (
                    <span
                      key={ft}
                      className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a] px-1.5 py-0.5 rounded bg-white/[0.03] border border-[#1f1a13]"
                    >
                      {ft}
                    </span>
                  ))}
                  {track.license_type === 'exclusive' && (
                    <span className="ml-auto text-[9px] font-mono text-[#5a5142]">
                      Stems available on request
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-[#1a160f] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] font-mono text-[#3a3328]">
            <Package size={11} />
            <span>All files are licensed to {purchase.buyer_email}</span>
          </div>
          <Link
            href="/store"
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#5a5142] hover:text-[#a08a6a] transition-colors"
          >
            Browse more beats
            <ExternalLink size={9} />
          </Link>
        </div>
      </div>
    </div>
  );
}
