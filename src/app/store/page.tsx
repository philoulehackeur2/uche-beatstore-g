'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Music, Search, ShoppingCart, Loader2, Play, Pause,
  Mail, Globe, X, CheckCircle2, XCircle, ChevronRight,
} from 'lucide-react';
import { MiniWaveform } from '@/components/player/MiniWaveform';
import { useCart } from '@/hooks/useCart';
import { usePlayer } from '@/hooks/usePlayer';
import { toast } from '@/hooks/useToast';
import type { Track } from '@/lib/types';

/**
 * /store — Public-facing beat storefront.
 *
 * No auth required. Loads /api/store on mount, renders the producer's
 * hero strip + a grid/list of every track flagged as `store_listed`.
 * The visitor can play any track (promotes it to the persistent
 * PlayerBar), add Lease/Exclusive licenses to the global useCart
 * store, and check out via Stripe.
 *
 * Why a separate page from /share/[token]: shares are recipient-
 * specific and password-gated. The store is the producer's PUBLIC
 * window — every buyer hits the same URL.
 */

interface CreatorProfile {
  display_name?: string | null;
  bio?: string | null;
  hero_image_url?: string | null;
  credits?: string | null;
  license_lease_price_usd?: number | null;
  license_exclusive_price_usd?: number | null;
  license_notes?: string | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  spotify_url?: string | null;
  soundcloud_url?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
}

interface StoreTrack extends Track {
  // /api/store returns these with possible numeric or null shape;
  // the base Track type already declares them.
}

const TYPE_FILTERS = ['all', 'beat', 'instrumental', 'song', 'remix'] as const;
type TypeFilter = typeof TYPE_FILTERS[number];

/**
 * Outer wrapper just to satisfy Next 16's requirement that any client
 * component reading useSearchParams be inside a <Suspense> boundary.
 * Otherwise the build fails with a CSR-bailout error at prerender.
 */
export default function StorePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0907]" />}>
      <StorePage />
    </Suspense>
  );
}

function StorePage() {
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [tracks, setTracks] = useState<StoreTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Cart + global player.
  const { items, addItem, clearCart, isOpen, setIsOpen } = useCart();
  const { currentTrack, isPlaying, setTrack, togglePlay, setQueue } = usePlayer();

  // Stripe return banner.
  const searchParams = useSearchParams();
  const router = useRouter();
  const purchaseStatus = searchParams?.get('purchase');
  const [bannerOpen, setBannerOpen] = useState(false);
  useEffect(() => {
    setBannerOpen(purchaseStatus === 'success' || purchaseStatus === 'cancelled');
    if (purchaseStatus === 'success') clearCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseStatus]);
  const dismissBanner = () => {
    setBannerOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete('purchase');
    url.searchParams.delete('session_id');
    router.replace(url.pathname + (url.search ? url.search : ''), { scroll: false });
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/store');
        const data = await res.json();
        setCreator(data.creator ?? null);
        setTracks((data.tracks as StoreTrack[]) ?? []);
      } catch (err) {
        console.error('store fetch failed', err);
        toast.error('Couldn’t load store');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tracks.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.key ?? '').toLowerCase().includes(q) ||
        String(t.bpm ?? '').includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [tracks, search, typeFilter]);

  const handlePlay = (t: StoreTrack) => {
    if (currentTrack?.id === t.id) {
      togglePlay();
      return;
    }
    setQueue(filtered as Track[]);
    setTrack(t as Track);
  };

  // Price resolver — per-track override → profile default → null.
  const priceFor = (t: StoreTrack, type: 'lease' | 'exclusive'): number | null => {
    const override = type === 'lease' ? t.lease_price_usd : t.exclusive_price_usd;
    if (override != null && Number(override) > 0) return Number(override);
    const def = type === 'lease' ? creator?.license_lease_price_usd : creator?.license_exclusive_price_usd;
    return def != null && Number(def) > 0 ? Number(def) : null;
  };

  const addToCart = (t: StoreTrack, type: 'lease' | 'exclusive') => {
    const price = priceFor(t, type);
    if (price == null) {
      toast.error(`No ${type} price set for ${t.title}`);
      return;
    }
    addItem(t as Track, {
      id: `${type}-${t.id}`,
      name: type === 'lease' ? 'Lease' : 'Exclusive',
      price_usd: price,
      file_types: type === 'lease' ? ['MP3'] : ['WAV', 'MP3', 'STEMS'],
      is_exclusive: type === 'exclusive',
    });
    toast.success(`Added: ${t.title} (${type})`);
  };

  return (
    <div className="min-h-screen bg-[#0a0907] text-[#E8DCC8]">
      {/* Purchase return banner */}
      {bannerOpen && (
        <div className={`sticky top-0 z-50 px-4 md:px-12 py-3 border-b ${
          purchaseStatus === 'success'
            ? 'bg-[#0e1f17] border-[#6DC6A4]/30 text-[#6DC6A4]'
            : 'bg-[#1f1010] border-red-500/30 text-red-300'
        }`}>
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            {purchaseStatus === 'success'
              ? <CheckCircle2 size={16} className="shrink-0" />
              : <XCircle size={16} className="shrink-0" />}
            <p className="text-[12px] font-medium flex-1">
              {purchaseStatus === 'success'
                ? 'Purchase complete — check your inbox for the download link.'
                : 'Checkout cancelled. No payment was taken.'}
            </p>
            <button onClick={dismissBanner} aria-label="Dismiss" className="text-current/60 hover:text-current">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Hero */}
      <Hero creator={creator} trackCount={tracks.length} />

      {/* Toolbar */}
      <div className="sticky top-0 z-30 bg-[#0a0907]/95 backdrop-blur-md border-b border-[#1f1a13]">
        <div className="max-w-6xl mx-auto px-4 md:px-10 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a3328]" />
            <input
              type="text"
              placeholder="Search title, key, BPM…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#14110d] border border-[#1f1a13] rounded-full py-2 pl-8 pr-3 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620]"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-full transition-colors ${
                  typeFilter === f
                    ? 'bg-[#D4BFA0] text-black'
                    : 'bg-transparent text-[#6a5d4a] hover:text-[#E8DCC8]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsOpen(true)}
            className="ml-auto flex items-center gap-2 px-3 py-2 rounded-full bg-white text-black hover:bg-[#E8DCC8] text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
            disabled={items.length === 0}
          >
            <ShoppingCart size={13} />
            Cart
            {items.length > 0 && (
              <span className="bg-black text-white text-[9px] font-mono rounded-full w-4 h-4 flex items-center justify-center">
                {items.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-10">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-[#5a5142]">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 border border-dashed border-[#1f1a13] rounded-lg">
            <Music size={28} className="text-[#3a3328] mx-auto mb-3" />
            <p className="text-sm text-[#E8DCC8] mb-1">No beats {tracks.length === 0 ? 'in the store yet' : 'match your filters'}</p>
            <p className="text-[11px] text-[#5a5142]">
              {tracks.length === 0 ? 'Check back soon.' : 'Try a different search or type filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <BeatCard
                key={t.id}
                track={t}
                priceLease={priceFor(t, 'lease')}
                priceExclusive={priceFor(t, 'exclusive')}
                isCurrent={currentTrack?.id === t.id}
                isPlaying={isPlaying && currentTrack?.id === t.id}
                onPlay={() => handlePlay(t)}
                onAddLease={() => addToCart(t, 'lease')}
                onAddExclusive={() => addToCart(t, 'exclusive')}
              />
            ))}
          </div>
        )}
      </div>

      {/* CartDrawer is mounted once in the store layout — no need to render it here */}
    </div>
  );
}

function Hero({ creator, trackCount }: { creator: CreatorProfile | null; trackCount: number }) {
  const hero = creator?.hero_image_url;
  return (
    <div className="relative w-full min-h-[260px] md:min-h-[340px] overflow-hidden">
      {hero ? (
        <img loading="eager" src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2A2418] via-[#14110d] to-[#0a0907]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#0a0907]" />
      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-10 pt-16 pb-10 md:pt-24 md:pb-16">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#a08a6a] mb-3">Beat store</p>
        <h1 className="text-3xl md:text-5xl font-medium tracking-tight text-white leading-[1.05] max-w-3xl">
          {creator?.display_name || 'Producer'}
        </h1>
        {creator?.bio && (
          <p className="mt-4 text-[14px] text-[#E8DCC8]/80 max-w-2xl leading-relaxed line-clamp-3">
            {creator.bio}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-wider text-[#a08a6a]">
          <span>{trackCount} beat{trackCount === 1 ? '' : 's'} for sale</span>
          {creator?.contact_email && (
            <a href={`mailto:${creator.contact_email}`} className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
              <Mail size={11} />
              {creator.contact_email}
            </a>
          )}
          {creator?.instagram_handle && (
            <a href={`https://instagram.com/${creator.instagram_handle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              @{creator.instagram_handle.replace(/^@/, '')}
            </a>
          )}
          {creator?.website_url && (
            <a href={creator.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
              <Globe size={11} />
              site
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * BeatCard — compact grid card for the /store catalogue.
 *
 * UX rules:
 *  • Clicking the cover art square plays/pauses (audio preview only).
 *  • Clicking the title / meta row navigates to the full product page.
 *  • Price buttons add directly to cart without navigating away.
 *  • "Details →" link is always present as an explicit escape hatch.
 */
function BeatCard({
  track, priceLease, priceExclusive, isCurrent, isPlaying,
  onPlay, onAddLease, onAddExclusive,
}: {
  track: StoreTrack;
  priceLease: number | null;
  priceExclusive: number | null;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onAddLease: () => void;
  onAddExclusive: () => void;
})
 {
  return (
    <div className={`group rounded-2xl border bg-[#14110d] overflow-hidden transition-all flex flex-col ${
      isCurrent ? 'border-[#D4BFA0]/40 shadow-lg shadow-[#D4BFA0]/5' : 'border-[#1f1a13] hover:border-[#2d2620]'
    }`}>
      {/* Cover + play overlay — click = play/pause only */}
      <button
        onClick={onPlay}
        className="relative w-full aspect-square bg-[#0a0907] overflow-hidden block shrink-0"
        aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
      >
        {track.cover_url ? (
          <img loading="lazy" src={track.cover_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#2A2418] to-[#0a0907] flex items-center justify-center text-[#a08a6a]">
            <Music size={36} />
          </div>
        )}
        <div className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-150 ${
          isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl transform group-hover:scale-105 transition-transform">
            {isCurrent && isPlaying
              ? <Pause size={22} fill="currentColor" />
              : <Play size={22} className="ml-0.5" fill="currentColor" />}
          </div>
        </div>
        {/* Now playing dot */}
        {isCurrent && (
          <div className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-[#6DC6A4] shadow-[0_0_6px_#6DC6A4] animate-pulse" />
        )}
      </button>

      {/* Meta — clicking title navigates to product page */}
      <div className="p-4 flex flex-col flex-1">
        <Link
          href={`/store/${track.id}`}
          className="group/title"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[14px] font-semibold text-white truncate group-hover/title:text-[#D4BFA0] transition-colors">
            {track.title}
          </p>
        </Link>
        <p className="text-[10px] font-mono text-[#6a5d4a] uppercase tracking-wider mt-1">
          {track.type}
          {track.bpm ? ` · ${track.bpm} bpm` : ''}
          {track.key ? ` · ${track.key}${track.scale ? ' ' + track.scale : ''}` : ''}
        </p>

        {/* Waveform — lazy peaks load, progress shown only on active track */}
        <div className="mt-3 px-0.5" onClick={(e) => e.stopPropagation()}>
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

        {/* Price actions */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onAddLease}
            disabled={priceLease == null}
            className="flex flex-col items-start px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.15] text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a]">Lease</span>
            <span className="text-[13px] font-bold text-[#E8DCC8] tabular-nums">
              {priceLease != null ? `$${priceLease.toLocaleString()}` : '—'}
            </span>
          </button>
          <button
            onClick={onAddExclusive}
            disabled={priceExclusive == null}
            className="flex flex-col items-start px-3 py-2 rounded-md bg-[#D4BFA0] hover:bg-[#E8D8B8] text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span className="text-[9px] font-mono uppercase tracking-wider text-black/70">Exclusive</span>
            <span className="text-[13px] font-bold text-black tabular-nums">
              {priceExclusive != null ? `$${priceExclusive.toLocaleString()}` : '—'}
            </span>
          </button>
        </div>

        {/* Details link */}
        <Link
          href={`/store/${track.id}`}
          className="mt-3 flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[#3a3328] hover:text-[#a08a6a] transition-colors self-start"
          onClick={(e) => e.stopPropagation()}
        >
          Details <ChevronRight size={9} />
        </Link>
      </div>
    </div>
  );
}

