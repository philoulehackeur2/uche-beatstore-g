'use client';

import { useState } from 'react';
import { X, Play, Pause, Music, ShoppingCart, Loader2, Info } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface CreatorProfile {
  display_name?: string | null;
  license_lease_price_usd?: number | null;
  license_exclusive_price_usd?: number | null;
  license_notes?: string | null;
}

interface Track {
  id: string;
  title: string;
  type: string;
  audio_url: string;
  cover_url?: string | null;
  duration_seconds?: number | null;
  bpm?: number | null;
  key?: string | null;
  scale?: string | null;
  description?: string | null;
  lease_price_usd?: number | null;
  exclusive_price_usd?: number | null;
}

interface ShareTrackDetailsDrawerProps {
  track: Track | null;
  projectCover?: string | null;
  creator: CreatorProfile | null;
  shareToken?: string;
  onClose: () => void;
  onPlay: (track: Track) => void;
  isPlaying: boolean;
  playingId: string | null;
  currentTime: number;
  duration: number;
  progressPct: number;
  onSeek: (seconds: number) => void;
}

export function ShareTrackDetailsDrawer({
  track,
  projectCover,
  creator,
  shareToken,
  onClose,
  onPlay,
  isPlaying,
  playingId,
  currentTime,
  duration,
  progressPct,
  onSeek,
}: ShareTrackDetailsDrawerProps) {
  const [buyerEmail, setBuyerEmail] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState<null | 'lease' | 'exclusive'>(null);

  if (!track) return null;

  const isActive = playingId === track.id;
  const isCurrentPlaying = isActive && isPlaying;

  const cover = track.cover_url || projectCover || null;

  // Pricing resolve logic: use track overrides, fallback to creator defaults
  const leasePrice = track.lease_price_usd !== undefined && track.lease_price_usd !== null
    ? Number(track.lease_price_usd)
    : creator?.license_lease_price_usd;

  const exclusivePrice = track.exclusive_price_usd !== undefined && track.exclusive_price_usd !== null
    ? Number(track.exclusive_price_usd)
    : creator?.license_exclusive_price_usd;

  const hasPricing = leasePrice != null || exclusivePrice != null;

  const handlePlayToggle = () => {
    onPlay(track);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isActive || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(pct * duration);
  };

  const handleBuy = async (licenseType: 'lease' | 'exclusive') => {
    if (!shareToken) return;
    if (!buyerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail)) {
      toast.error('Email required', 'Add your email so we can send the license.');
      return;
    }
    setCheckoutLoading(licenseType);
    try {
      const res = await fetch(`/api/share/${shareToken}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_type: licenseType,
          track_ids: [track.id], // Buy individual beat
          buyer_email: buyerEmail.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      toast.error('Checkout failed', err instanceof Error ? err.message : 'Unknown error');
      setCheckoutLoading(null);
    }
  };

  const fmt = (seconds: number) => {
    if (isNaN(seconds) || seconds === null) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40 animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[440px] bg-[#0c0c0c] border-l border-[#1f1a13] z-50 flex flex-col shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-[#1f1a13] flex items-center justify-between bg-gradient-to-b from-[#14110d] to-[#0c0c0c]">
          <div className="min-w-0 flex-1">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#a08a6a] bg-[#1f1a13] px-2 py-0.5 rounded">
              {track.type}
            </span>
            <h2 className="text-lg font-bold text-white uppercase tracking-wider truncate mt-1.5 leading-none">
              {track.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#6a5d4a] hover:text-[#E8DCC8] p-2 hover:bg-white/[0.03] rounded-lg transition-colors border border-white/[0.03]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          
          {/* Cover Art Card */}
          <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-[#14110d] border border-[#1f1a13] group shadow-2xl">
            {cover ? (
              <img src={cover} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#3a3328]">
                <Music size={64} />
              </div>
            )}
            
            {/* Hover Play/Pause Overlay */}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handlePlayToggle}
                className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-2xl"
              >
                {isCurrentPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} className="ml-1" fill="currentColor" />
                )}
              </button>
            </div>
          </div>

          {/* Inline Media Player Panel */}
          <div className="bg-[#14110d] border border-[#1f1a13] rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayToggle}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shrink-0"
              >
                {isCurrentPlaying ? (
                  <Pause size={14} fill="currentColor" />
                ) : (
                  <Play size={14} className="ml-0.5" fill="currentColor" />
                )}
              </button>
              
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-mono text-[#a08a6a] uppercase tracking-wider">
                  {isActive ? (isCurrentPlaying ? 'Now playing' : 'Paused') : 'Preview Track'}
                </p>
                <p className="text-xs font-medium text-white truncate mt-0.5">
                  {track.title}
                </p>
              </div>
            </div>

            {/* Progress seek bar */}
            <div className="space-y-1">
              <div
                onClick={handleSeek}
                className={`h-1.5 rounded-full relative cursor-pointer ${
                  isActive ? 'bg-[#1f1a13]' : 'bg-[#1f1a13]/40'
                }`}
              >
                <div
                  className="h-full bg-[#D4BFA0] rounded-full transition-all"
                  style={{ width: `${isActive ? progressPct : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-[#5a5142] tabular-nums">
                <span>{isActive ? fmt(currentTime) : '0:00'}</span>
                <span>{isActive && duration > 0 ? fmt(duration) : fmt(track.duration_seconds || 0)}</span>
              </div>
            </div>
          </div>

          {/* Beat Analytics / Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#14110d]/50 border border-[#1f1a13]/60 rounded-xl p-3.5 text-center">
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#6a5d4a]">BPM</p>
              <p className="text-sm font-bold mt-1 text-white font-mono">{track.bpm || '—'}</p>
            </div>
            <div className="bg-[#14110d]/50 border border-[#1f1a13]/60 rounded-xl p-3.5 text-center">
              <p className="text-[9px] font-mono uppercase tracking-widest text-[#6a5d4a]">Key / Scale</p>
              <p className="text-sm font-bold mt-1 text-white font-mono">
                {track.key ? `${track.key} ${track.scale || ''}`.trim() : '—'}
              </p>
            </div>
          </div>

          {/* Description */}
          {track.description && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a08a6a]">Description</p>
              <p className="text-xs text-[#E8DCC8]/85 leading-relaxed bg-[#14110d]/30 border border-white/[0.02] p-4 rounded-xl whitespace-pre-wrap">
                {track.description}
              </p>
            </div>
          )}

          {/* Track-Level Licensing Purchase Block */}
          {shareToken && hasPricing ? (
            <div className="space-y-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#a08a6a]">Purchase License</p>
              
              <div className="rounded-2xl border border-[#1f1a13] bg-gradient-to-br from-[#14110d] to-[#0c0c0c] p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {leasePrice != null && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a]">Lease</span>
                      <span className="text-2xl font-bold text-white font-mono mt-0.5">
                        ${leasePrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#a08a6a] mt-0.5">Non-exclusive</span>
                      <button
                        onClick={() => handleBuy('lease')}
                        disabled={checkoutLoading !== null}
                        className="mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-[10px] font-bold uppercase tracking-widest text-[#E8DCC8] transition-colors disabled:opacity-40"
                      >
                        {checkoutLoading === 'lease' ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <ShoppingCart size={11} />
                        )}
                        Lease
                      </button>
                    </div>
                  )}
                  {exclusivePrice != null && (
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a]">Exclusive</span>
                      <span className="text-2xl font-bold text-[#E8D8B8] font-mono mt-0.5">
                        ${exclusivePrice.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#a08a6a] mt-0.5">Full transfer</span>
                      <button
                        onClick={() => handleBuy('exclusive')}
                        disabled={checkoutLoading !== null}
                        className="mt-3 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#D4BFA0] text-black hover:bg-[#E8D8B8] text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-40"
                      >
                        {checkoutLoading === 'exclusive' ? (
                          <Loader2 size={11} className="animate-spin text-black" />
                        ) : (
                          <ShoppingCart size={11} />
                        )}
                        Exclusive
                      </button>
                    </div>
                  )}
                </div>

                {/* Email verification input */}
                <div className="pt-4 border-t border-[#1f1a13]">
                  <label className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a] block mb-1.5">
                    Your email for license delivery
                  </label>
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(e) => setBuyerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-black/45 border border-white/[0.06] rounded-lg py-2 px-3 text-xs text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-white/[0.2] transition-colors"
                  />
                </div>
              </div>
            </div>
          ) : (
            shareToken && (
              <div className="bg-[#14110d]/20 border border-white/[0.02] rounded-xl p-4 flex gap-3 text-[#6a5d4a]">
                <Info size={14} className="shrink-0 mt-0.5" />
                <p className="text-xs">
                  This track is only available for preview. Set beat overrides or creator default licensing prices to enable purchase options.
                </p>
              </div>
            )
          )}
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
        }
      `}</style>
    </>
  );
}
