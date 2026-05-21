'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Music, Search, ShoppingCart, Loader2, Play, Pause,
  Globe, X, CheckCircle2, XCircle, Link2, LayoutGrid,
  List, Mail, ChevronDown, Send, ListMusic, ChevronRight,
} from 'lucide-react';
import { MiniWaveform } from '@/components/player/MiniWaveform';
import { useCart } from '@/hooks/useCart';
import { usePlayer } from '@/hooks/usePlayer';
import { toast } from '@/hooks/useToast';
import type { Track } from '@/lib/types';

/**
 * /store — Public-facing beat storefront.
 *
 * Sections (top to bottom):
 *   Artist Bio Block — hero image, display_name, bio, license_notes, social links
 *   Featured Playlists — expandable playlist cards
 *   Toolbar — search, type filter, advanced filters, grid/list toggle, share
 *   Beat grid OR list — every store_listed track
 *   Contact form — visitor can message the producer directly
 */

/* ─── Types ─────────────────────────────────────────────────── */

interface TrackTag {
  tag: string;
  category: string | null;
}

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
  accent_color?: string | null;
  font_style?: string | null;
  text_color_primary?: string | null;
  store_enabled?: boolean | null;
}

interface PlaylistTrackItem {
  id: string;
  title: string;
  type: string;
  audio_url: string;
  peaks_url?: string | null;
  cover_url?: string | null;
  duration_seconds?: number | null;
  bpm?: number | null;
  key?: string | null;
  scale?: string | null;
  lease_price_usd?: number | null;
  exclusive_price_usd?: number | null;
  free_download_enabled?: boolean | null;
}

interface FeaturedPlaylist {
  id: string;
  name: string;
  cover_url: string | null;
  store_order: number | null;
  tracks: PlaylistTrackItem[];
}

interface StoreTrack extends Track {
  tags?: TrackTag[];
}

/** Beat + Instrumental share the "Beats" filter pill */
const TYPE_FILTERS = ['all', 'beats', 'song', 'remix'] as const;
type TypeFilter = typeof TYPE_FILTERS[number];
type ViewMode = 'grid' | 'list';

const FONT_FAMILY_MAP: Record<string, string> = {
  default: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif:   'Georgia, ui-serif, Times New Roman, serif',
  mono:    'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/* ─── Helpers ────────────────────────────────────────────────── */

function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)+/, 'https://');
}

function fmtDur(s: number | null | undefined): string {
  if (!s) return '—';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

/** Return up to `limit` tracks from `pool` that share the most tags with `track`. */
function getSimilarTracks(track: StoreTrack, pool: StoreTrack[], limit = 4): StoreTrack[] {
  const myTags = new Set(
    (track.tags ?? [])
      .filter((t) => t.category === 'genre' || t.category === 'mood' || t.category === 'instrument')
      .map((t) => t.tag.toLowerCase()),
  );
  if (myTags.size === 0) return [];
  return pool
    .filter((t) => t.id !== track.id)
    .map((t) => ({
      track: t,
      score: (t.tags ?? []).filter(
        (tag) => (tag.category === 'genre' || tag.category === 'mood' || tag.category === 'instrument') && myTags.has(tag.tag.toLowerCase()),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ track: t }) => t);
}

/* ─── Suspense wrapper ───────────────────────────────────────── */

export default function StorePageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0907]" />}>
      <StorePage />
    </Suspense>
  );
}

/* ─── Main page ──────────────────────────────────────────────── */

function StorePage() {
  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [tracks, setTracks] = useState<StoreTrack[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<FeaturedPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Advanced filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bpmMin, setBpmMin] = useState('');
  const [bpmMax, setBpmMax] = useState('');
  const [keyFilter, setKeyFilter] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);

  // Free download modal
  const [freeDownloadTrack, setFreeDownloadTrack] = useState<StoreTrack | null>(null);

  // Cart + global player.
  const { items, addItem, clearCart, setIsOpen } = useCart();
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
        const rawTracks = (data.tracks as StoreTrack[]) ?? [];
        // Sanitize cover URLs on the client side too (belt-and-suspenders)
        const cleanTracks = rawTracks.map((t) => ({
          ...t,
          cover_url: sanitizeUrl(t.cover_url) ?? undefined,
        }));
        setCreator(data.creator ?? null);
        setTracks(cleanTracks);
        setFeaturedPlaylists((data.featuredPlaylists as FeaturedPlaylist[]) ?? []);
      } catch (err) {
        console.error('store fetch failed', err);
        toast.error("Couldn't load store");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Collect unique keys for the key filter dropdown
  const availableKeys = useMemo(() => {
    const keys = new Set(tracks.map((t) => t.key).filter(Boolean) as string[]);
    return Array.from(keys).sort();
  }, [tracks]);

  const activeFilterCount = [
    bpmMin !== '', bpmMax !== '', keyFilter !== '', freeOnly,
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minBpm = bpmMin !== '' ? Number(bpmMin) : null;
    const maxBpm = bpmMax !== '' ? Number(bpmMax) : null;
    return tracks.filter((t) => {
      // 'beats' matches both beat and instrumental
      if (typeFilter === 'beats' && t.type !== 'beat' && t.type !== 'instrumental') return false;
      if (typeFilter !== 'all' && typeFilter !== 'beats' && t.type !== typeFilter) return false;
      if (freeOnly && !t.free_download_enabled) return false;
      if (minBpm !== null && (t.bpm == null || t.bpm < minBpm)) return false;
      if (maxBpm !== null && (t.bpm == null || t.bpm > maxBpm)) return false;
      if (keyFilter && (t.key ?? '').toLowerCase() !== keyFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.key ?? '').toLowerCase().includes(q) ||
        String(t.bpm ?? '').includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.tags ?? []).some((tag) => tag.tag.toLowerCase().includes(q))
      );
    });
  }, [tracks, search, typeFilter, freeOnly, bpmMin, bpmMax, keyFilter]);

  const handlePlay = (t: StoreTrack) => {
    if (currentTrack?.id === t.id) { togglePlay(); return; }
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
    if (price == null) { toast.error(`No ${type} price set for ${t.title}`); return; }
    addItem(t as Track, {
      id: `${type}-${t.id}`,
      name: type === 'lease' ? 'Lease' : 'Exclusive',
      price_usd: price,
      file_types: type === 'lease' ? ['MP3'] : ['WAV', 'MP3', 'STEMS'],
      is_exclusive: type === 'exclusive',
    });
    toast.success(`Added: ${t.title} (${type})`);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + '/store').then(() => {
      toast.success('Store link copied!');
    }).catch(() => toast.error('Copy failed'));
  };

  // Theming
  const accentColor = creator?.accent_color || '#D4BFA0';
  const textColor   = creator?.text_color_primary || '#E8DCC8';
  const fontFamily  = FONT_FAMILY_MAP[creator?.font_style ?? 'default'] ?? FONT_FAMILY_MAP.default;

  // Under-construction guard
  if (!loading && creator?.store_enabled === false) {
    return (
      <div className="min-h-screen bg-[#0a0907] flex items-center justify-center">
        <div className="text-center px-6 max-w-sm">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#3a3328] mb-4">Beat Store</p>
          <h1 className="text-2xl font-bold text-[#E8DCC8] mb-3">
            {creator?.display_name || 'Coming soon'}
          </h1>
          <p className="text-[12px] text-[#5a5142]">The store is under construction. Check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[#0a0907]"
      style={{
        '--store-accent': accentColor,
        '--store-text':   textColor,
        fontFamily,
        color: textColor,
      } as React.CSSProperties}
    >
      {/* ── Purchase return banner ──────────────────────────────── */}
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

      {/* ── Artist bio block (hero + social + license notes) ──────── */}
      <ArtistBioBlock creator={creator} trackCount={tracks.length} />

      {/* ── Featured playlists strip ──────────────────────────────── */}
      {featuredPlaylists.length > 0 && (
        <FeaturedPlaylistsStrip
          playlists={featuredPlaylists}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          onPlay={(t) => {
            setQueue(featuredPlaylists.flatMap((p) => p.tracks) as unknown as Track[]);
            setTrack(t as unknown as Track);
          }}
          priceFor={(t, type) => {
            const override = type === 'lease' ? t.lease_price_usd : t.exclusive_price_usd;
            if (override != null && Number(override) > 0) return Number(override);
            const def = type === 'lease' ? creator?.license_lease_price_usd : creator?.license_exclusive_price_usd;
            return def != null && Number(def) > 0 ? Number(def) : null;
          }}
          onAddToCart={(t, type) => {
            const price = (type === 'lease' ? t.lease_price_usd : t.exclusive_price_usd)
              ?? (type === 'lease' ? creator?.license_lease_price_usd : creator?.license_exclusive_price_usd);
            if (!price) { toast.error(`No ${type} price set`); return; }
            addItem({ ...t, user_id: '', stems_status: 'none', created_at: '' } as Track, {
              id: `${type}-${t.id}`,
              name: type === 'lease' ? 'Lease' : 'Exclusive',
              price_usd: Number(price),
              file_types: type === 'lease' ? ['MP3'] : ['WAV', 'MP3', 'STEMS'],
              is_exclusive: type === 'exclusive',
            });
            toast.success(`Added: ${t.title} (${type})`);
          }}
        />
      )}

      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-[#0a0907]/95 backdrop-blur-md border-b border-[#1f1a13]">
        <div className="max-w-6xl mx-auto px-4 md:px-10 py-3 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3a3328]" />
            <input
              type="text"
              placeholder="Search title, key, BPM, tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#14110d] border border-[#1f1a13] rounded-full py-2 pl-8 pr-3 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620]"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setTypeFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-full transition-colors whitespace-nowrap ${
                  typeFilter === f
                    ? 'text-black'
                    : 'bg-transparent text-[#6a5d4a] hover:text-[#E8DCC8]'
                }`}
                style={typeFilter === f ? { backgroundColor: accentColor } : {}}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Advanced filters toggle */}
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono uppercase tracking-wider transition-colors border whitespace-nowrap ${
              filtersOpen || activeFilterCount > 0
                ? 'text-[#D4BFA0] bg-[#D4BFA0]/5'
                : 'border-[#1f1a13] text-[#6a5d4a] hover:text-[#E8DCC8]'
            }`}
            style={filtersOpen || activeFilterCount > 0 ? { borderColor: `${accentColor}40` } : {}}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full text-black text-[8px] flex items-center justify-center font-bold"
                style={{ backgroundColor: accentColor }}>
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="flex-1" />

          {/* Grid / List toggle */}
          <div className="flex items-center gap-0.5 bg-[#14110d] border border-[#1f1a13] rounded-md p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`p-1.5 rounded transition-colors ${viewMode === 'grid' ? 'bg-[#2d2620] text-[#E8DCC8]' : 'text-[#5a5142] hover:text-[#a08a6a]'}`}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-[#2d2620] text-[#E8DCC8]' : 'text-[#5a5142] hover:text-[#a08a6a]'}`}
            >
              <List size={13} />
            </button>
          </div>

          {/* Copy store link */}
          <button
            onClick={handleCopyLink}
            title="Copy store link"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#1f1a13] text-[#6a5d4a] hover:text-[#E8DCC8] hover:border-[#2d2620] text-[10px] font-mono uppercase tracking-wider transition-colors"
          >
            <Link2 size={11} />
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Cart button */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-black hover:opacity-90 text-[11px] font-bold uppercase tracking-wider transition-opacity disabled:opacity-40"
            style={{ backgroundColor: accentColor }}
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

        {/* Advanced filter panel */}
        {filtersOpen && (
          <div className="max-w-6xl mx-auto px-4 md:px-10 pb-3 flex flex-wrap items-end gap-3 border-t border-[#1a160f] pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#5a5142] uppercase tracking-wider">BPM</span>
              <input type="number" placeholder="min" value={bpmMin} onChange={(e) => setBpmMin(e.target.value)}
                className="w-16 bg-[#14110d] border border-[#1f1a13] rounded px-2 py-1 text-[11px] text-[#E8DCC8] focus:outline-none" />
              <span className="text-[#3a3328]">–</span>
              <input type="number" placeholder="max" value={bpmMax} onChange={(e) => setBpmMax(e.target.value)}
                className="w-16 bg-[#14110d] border border-[#1f1a13] rounded px-2 py-1 text-[11px] text-[#E8DCC8] focus:outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[#5a5142] uppercase tracking-wider">Key</span>
              <select value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)}
                className="bg-[#14110d] border border-[#1f1a13] rounded px-2 py-1 text-[11px] text-[#E8DCC8] focus:outline-none">
                <option value="">Any</option>
                {availableKeys.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)}
                className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono text-[#a08a6a] uppercase tracking-wider">Free only</span>
            </label>
            {activeFilterCount > 0 && (
              <button onClick={() => { setBpmMin(''); setBpmMax(''); setKeyFilter(''); setFreeOnly(false); }}
                className="text-[10px] font-mono text-[#6a5d4a] hover:text-[#E8DCC8] uppercase tracking-wider transition-colors">
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Beat listing ─────────────────────────────────────────── */}
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
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <BeatCard
                key={t.id}
                track={t}
                allTracks={filtered}
                priceLease={priceFor(t, 'lease')}
                priceExclusive={priceFor(t, 'exclusive')}
                isCurrent={currentTrack?.id === t.id}
                isPlaying={isPlaying && currentTrack?.id === t.id}
                onPlay={() => handlePlay(t)}
                onAddLease={() => addToCart(t, 'lease')}
                onAddExclusive={() => addToCart(t, 'exclusive')}
                onFreeDownload={() => setFreeDownloadTrack(t)}
                accentColor={accentColor}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((t, i) => (
              <BeatListRow
                key={t.id}
                track={t}
                index={i + 1}
                priceLease={priceFor(t, 'lease')}
                priceExclusive={priceFor(t, 'exclusive')}
                isCurrent={currentTrack?.id === t.id}
                isPlaying={isPlaying && currentTrack?.id === t.id}
                onPlay={() => handlePlay(t)}
                onAddLease={() => addToCart(t, 'lease')}
                onAddExclusive={() => addToCart(t, 'exclusive')}
                onFreeDownload={() => setFreeDownloadTrack(t)}
                accentColor={accentColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Contact form ─────────────────────────────────────────── */}
      <StoreContactForm creator={creator} accentColor={accentColor} />

      {/* ── Free download modal ──────────────────────────────────── */}
      {freeDownloadTrack && (
        <FreeDownloadModal
          track={freeDownloadTrack}
          onClose={() => setFreeDownloadTrack(null)}
          accentColor={accentColor}
        />
      )}

      {/* Suppress horizontal scrollbar on filter chips */}
      <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
    </div>
  );
}

/* ─── Tag chips helper ───────────────────────────────────────── */

function TagChips({ tags, max = 3 }: { tags: TrackTag[]; max?: number }) {
  const display = tags
    .filter((t) => t.category === 'genre' || t.category === 'mood')
    .slice(0, max + 1);
  if (display.length === 0) return null;
  const visible = display.slice(0, max);
  const overflow = display.length - max;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {visible.map((t) => (
        <span key={t.tag} className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider bg-[#1f1a13] text-[#a08a6a]">
          {t.tag}
        </span>
      ))}
      {overflow > 0 && (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-[#5a5142] bg-[#1a160f]">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

/* ─── Artist Bio Block ───────────────────────────────────────── */

function ArtistBioBlock({ creator, trackCount }: { creator: CreatorProfile | null; trackCount: number }) {
  const [licenseExpanded, setLicenseExpanded] = useState(false);
  const hero = sanitizeUrl(creator?.hero_image_url);

  const socialLinks: Array<{ href: string; label: string; icon: React.ReactNode; color: string }> = [];
  if (creator?.instagram_handle) {
    const h = creator.instagram_handle.replace(/^@/, '');
    socialLinks.push({ href: `https://instagram.com/${h}`, label: 'Instagram', color: 'hover:text-[#E1306C]', icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )});
  }
  if (creator?.twitter_handle) {
    const h = creator.twitter_handle.replace(/^@/, '');
    socialLinks.push({ href: `https://x.com/${h}`, label: 'X / Twitter', color: 'hover:text-white', icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.736-8.854L2.5 2.25h6.894l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    )});
  }
  if (creator?.spotify_url) {
    socialLinks.push({ href: creator.spotify_url, label: 'Spotify', color: 'hover:text-[#1DB954]', icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    )});
  }
  if (creator?.soundcloud_url) {
    socialLinks.push({ href: creator.soundcloud_url, label: 'SoundCloud', color: 'hover:text-[#FF5500]', icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
        <path d="M1.175 12.225c-.014.095 0 .19 0 .285l1.3 5.48H1.175c-.65 0-1.175-.524-1.175-1.175v-3.62c0-.65.524-1.175 1.175-1.175v.205zm2.6-3.92c-.65 0-1.175.524-1.175 1.175v7.63h1.3V8.48c0-.65-.474-1.175-1.125-1.175zm1.3-.3c-.65 0-1.175.524-1.175 1.175v8.43h1.3V9.18c0-.65-.474-1.155-1.125-1.175zm1.3-1.24c-.65 0-1.175.524-1.175 1.175v9.67h1.3V7.94c0-.65-.474-1.175-1.125-1.175zm1.3.175c-.65 0-1.175.524-1.175 1.175v9.495l1.3-.7V7.115c0-.65-.474-1.175-1.125-1.175zm1.3 0c-.65 0-1.175.524-1.175 1.175v9.67c.27.095.555.175.855.175.38 0 .745-.095 1.065-.27V7.115c0-.65-.474-1.175-1.125-1.175zm2.63 8.72c-.27 0-.535-.04-.79-.115v4.12c.255.095.525.155.79.155 1.44 0 2.61-1.17 2.61-2.61 0-1.44-1.17-2.61-2.61-2.61zm4.08-2.89c-.3-.095-.61-.155-.93-.155-1.78 0-3.225 1.445-3.225 3.225 0 1.78 1.445 3.225 3.225 3.225.32 0 .63-.06.93-.155V12.77zm2.27-1.7c-.3 0-.595.04-.875.115v5.53c.28.075.575.115.875.115 1.715 0 3.105-1.39 3.105-3.105 0-1.714-1.39-3.104-3.105-3.104v-.001z" />
      </svg>
    )});
  }
  if (creator?.website_url) {
    socialLinks.push({ href: creator.website_url, label: 'Website', color: 'hover:text-[#E8DCC8]', icon: <Globe size={16} /> });
  }
  if (creator?.contact_email) {
    socialLinks.push({ href: `mailto:${creator.contact_email}`, label: creator.contact_email, color: 'hover:text-[#E8DCC8]', icon: <Mail size={15} /> });
  }

  return (
    <div className="relative w-full overflow-hidden">
      {/* Hero image */}
      {hero ? (
        <img loading="eager" src={hero} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#2A2418] via-[#14110d] to-[#0a0907]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#0a0907]" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-10 pt-10 pb-10 md:pt-24 md:pb-16">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#a08a6a] mb-3">Beat store</p>
        <h1 className="text-3xl md:text-5xl font-medium tracking-tight text-white leading-[1.05] max-w-3xl">
          {creator?.display_name || 'Producer'}
        </h1>
        {creator?.bio && (
          <p className="mt-4 text-[14px] text-[#E8DCC8]/80 max-w-2xl leading-relaxed line-clamp-3">
            {creator.bio}
          </p>
        )}
        <p className="mt-3 text-[11px] font-mono uppercase tracking-wider text-[#5a5142]">
          {trackCount} beat{trackCount === 1 ? '' : 's'} for sale
        </p>

        {/* License terms */}
        {creator?.license_notes && (
          <div className="mt-5 max-w-2xl">
            <button
              onClick={() => setLicenseExpanded((o) => !o)}
              className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a] hover:text-[#a08a6a] transition-colors"
            >
              License Terms
              <ChevronDown size={11} className={`transition-transform ${licenseExpanded ? 'rotate-180' : ''}`} />
            </button>
            {licenseExpanded && (
              <p className="mt-2 text-[11px] font-mono text-[#5a5142] leading-relaxed whitespace-pre-wrap bg-[#14110d]/60 rounded-lg px-3 py-2 border border-[#1f1a13]">
                {creator.license_notes}
              </p>
            )}
          </div>
        )}

        {/* Social links */}
        {socialLinks.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {socialLinks.map(({ href, label, icon, color }) => (
              <a
                key={href}
                href={href}
                target={href.startsWith('mailto:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                title={label}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/30 border border-white/10 text-[#a08a6a] ${color} hover:bg-black/50 hover:border-white/20 transition-all text-[11px] font-medium`}
              >
                {icon}
                <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-wider">{label}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Featured playlists strip ───────────────────────────────── */

function FeaturedPlaylistsStrip({
  playlists, currentTrack, isPlaying, onPlay, priceFor, onAddToCart,
}: {
  playlists: FeaturedPlaylist[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (t: PlaylistTrackItem) => void;
  priceFor: (t: PlaylistTrackItem, type: 'lease' | 'exclusive') => number | null;
  onAddToCart: (t: PlaylistTrackItem, type: 'lease' | 'exclusive') => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-10 pt-8 pb-2">
      <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[#3a3328] mb-4">Featured Playlists</p>

      {/* Playlist cards — horizontal scroll on mobile */}
      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => setExpandedId((id) => (id === pl.id ? null : pl.id))}
            className={`shrink-0 w-[120px] sm:w-[140px] text-left group transition-all ${expandedId === pl.id ? 'opacity-100' : ''}`}
          >
            <div className={`w-full aspect-square rounded-xl bg-[#14110d] border overflow-hidden mb-2 flex items-center justify-center transition-all ${
              expandedId === pl.id ? 'border-[#D4BFA0]/40 shadow-lg shadow-[#D4BFA0]/5' : 'border-[#1f1a13] group-hover:border-[#2d2620]'
            }`}>
              {pl.cover_url
                ? <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                : <ListMusic size={24} className="text-[#2d2620]" />}
            </div>
            <p className="text-[11px] font-medium text-[#E8DCC8] truncate">{pl.name}</p>
            <p className="text-[9px] font-mono text-[#5a5142] mt-0.5">{pl.tracks?.length ?? 0} tracks</p>
          </button>
        ))}
      </div>

      {/* Expanded playlist track list */}
      {expandedId && (() => {
        const pl = playlists.find((p) => p.id === expandedId);
        if (!pl || !pl.tracks?.length) return null;
        return (
          <div className="mt-4 rounded-xl border border-[#1f1a13] bg-[#14110d] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1a160f]">
              <p className="text-[11px] font-semibold text-[#E8DCC8]">{pl.name}</p>
              <button onClick={() => setExpandedId(null)} className="text-[#3a3328] hover:text-[#a08a6a] transition-colors">
                <X size={13} />
              </button>
            </div>
            <div className="divide-y divide-[#1a160f]">
              {pl.tracks.map((t) => {
                const isCur = currentTrack?.id === t.id;
                const lp = priceFor(t, 'lease');
                const ep = priceFor(t, 'exclusive');
                return (
                  <div key={t.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-[#16130e] transition-colors ${isCur ? 'bg-[#16130e]' : ''}`}>
                    <button
                      onClick={() => onPlay(t)}
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isCur ? 'bg-[#D4BFA0] text-black' : 'bg-white/[0.06] text-[#a08a6a] hover:bg-white/[0.12] hover:text-white'
                      }`}
                    >
                      {isCur && isPlaying
                        ? <Pause size={10} fill="currentColor" />
                        : <Play size={10} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="w-8 h-8 rounded shrink-0 bg-[#0a0907] overflow-hidden">
                      {t.cover_url
                        ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[#3a3328]"><Music size={12} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-medium truncate ${isCur ? 'text-[#D4BFA0]' : 'text-[#E8DCC8]'}`}>{t.title}</p>
                      <p className="text-[9px] font-mono text-[#5a5142] uppercase tracking-wider">
                        {t.type}{t.bpm ? ` · ${t.bpm}` : ''}{t.key ? ` · ${t.key}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {t.free_download_enabled ? (
                        <span className="text-[10px] font-mono text-[#6DC6A4] uppercase tracking-wider">Free</span>
                      ) : (
                        <>
                          {lp != null && (
                            <button onClick={() => onAddToCart(t, 'lease')}
                              className="px-2 py-1 rounded bg-white/[0.06] border border-white/[0.08] text-[#E8DCC8] text-[10px] font-bold hover:bg-white/[0.12] transition-colors">
                              ${lp}
                            </button>
                          )}
                          {ep != null && (
                            <button onClick={() => onAddToCart(t, 'exclusive')}
                              className="px-2 py-1 rounded bg-[#D4BFA0] text-black text-[10px] font-bold hover:bg-[#E8D8B8] transition-colors">
                              ${ep}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── BeatCard (grid view) ───────────────────────────────────── */

function BeatCard({
  track, allTracks, priceLease, priceExclusive, isCurrent, isPlaying,
  onPlay, onAddLease, onAddExclusive, onFreeDownload, accentColor,
}: {
  track: StoreTrack;
  allTracks: StoreTrack[];
  priceLease: number | null;
  priceExclusive: number | null;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onAddLease: () => void;
  onAddExclusive: () => void;
  onFreeDownload: () => void;
  accentColor: string;
}) {
  const similar = useMemo(() => getSimilarTracks(track, allTracks), [track, allTracks]);

  const scrollToTrack = (id: string) => {
    document.getElementById(`beat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div
      id={`beat-${track.id}`}
      className={`group rounded-2xl border bg-[#14110d] overflow-hidden transition-all flex flex-col ${
        isCurrent ? 'border-[#D4BFA0]/40 shadow-lg shadow-[#D4BFA0]/5' : 'border-[#1f1a13] hover:border-[#2d2620]'
      }`}
      style={isCurrent ? { borderColor: `${accentColor}66` } : {}}
    >
      <Link href={`/store/${track.id}`} className="relative w-full aspect-square bg-[#0a0907] overflow-hidden block shrink-0">
        {track.cover_url ? (
          <img loading="lazy" src={track.cover_url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#2A2418] to-[#0a0907] flex items-center justify-center text-[#a08a6a]">
            <Music size={36} />
          </div>
        )}
        {isCurrent && (
          <div className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full bg-[#6DC6A4] shadow-[0_0_6px_#6DC6A4] animate-pulse" />
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPlay(); }}
          aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-150 ${
            isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl transform group-hover:scale-105 transition-transform pointer-events-none">
            {isCurrent && isPlaying
              ? <Pause size={22} fill="currentColor" />
              : <Play size={22} className="ml-0.5" fill="currentColor" />}
          </div>
        </button>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <Link href={`/store/${track.id}`}>
          <p className="text-[14px] font-semibold text-white truncate hover:text-[#D4BFA0] transition-colors"
            style={{ '--tw-text-opacity': '1' } as React.CSSProperties}>
            {track.title}
          </p>
        </Link>
        <p className="text-[10px] font-mono text-[#6a5d4a] uppercase tracking-wider mt-1">
          {track.type}
          {track.bpm ? ` · ${track.bpm} bpm` : ''}
          {track.key ? ` · ${track.key}${track.scale ? ' ' + track.scale : ''}` : ''}
        </p>

        {/* Tags */}
        <TagChips tags={track.tags ?? []} />

        <div className="mt-3 px-0.5" onClick={(e) => e.preventDefault()}>
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

        {/* Buy / free download buttons */}
        <div onClick={(e) => e.preventDefault()}>
          {track.free_download_enabled ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFreeDownload(); }}
              className="mt-4 flex items-center justify-center gap-2 w-full px-3 py-2 rounded-md bg-[#6DC6A4]/10 border border-[#6DC6A4]/25 hover:bg-[#6DC6A4]/20 text-[#6DC6A4] text-[11px] font-bold uppercase tracking-wider transition-colors"
            >
              Free Download
            </button>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddLease(); }}
                disabled={priceLease == null}
                className="flex flex-col items-start px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.15] text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-[#6a5d4a]">Lease</span>
                <span className="text-[13px] font-bold text-[#E8DCC8] tabular-nums">
                  {priceLease != null ? `$${priceLease.toLocaleString()}` : '—'}
                </span>
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddExclusive(); }}
                disabled={priceExclusive == null}
                className="flex flex-col items-start px-3 py-2 rounded-md text-left transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-black/70">Exclusive</span>
                <span className="text-[13px] font-bold text-black tabular-nums">
                  {priceExclusive != null ? `$${priceExclusive.toLocaleString()}` : '—'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Similar beats */}
        {similar.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#1a160f]">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-2">Similar beats</p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={(e) => { e.stopPropagation(); scrollToTrack(s.id); }}
                  className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#1a160f] border border-[#1f1a13] hover:border-[#2d2620] transition-colors"
                >
                  <p className="text-[10px] text-[#a08a6a] font-medium whitespace-nowrap max-w-[100px] truncate">{s.title}</p>
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

/* ─── BeatListRow (list view) ────────────────────────────────── */

function BeatListRow({
  track, index, priceLease, priceExclusive, isCurrent, isPlaying,
  onPlay, onAddLease, onAddExclusive, onFreeDownload, accentColor,
}: {
  track: StoreTrack;
  index: number;
  priceLease: number | null;
  priceExclusive: number | null;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onAddLease: () => void;
  onAddExclusive: () => void;
  onFreeDownload: () => void;
  accentColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  void index;

  return (
    <div
      id={`beat-${track.id}`}
      className={`rounded-xl border transition-all ${
        isCurrent ? 'border-[#D4BFA0]/30 bg-[#16130e]' : 'border-[#1a160f] bg-[#14110d] hover:border-[#1f1a13]'
      }`}
      style={isCurrent ? { borderColor: `${accentColor}4D` } : {}}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Play button */}
        <div className="w-8 shrink-0 flex items-center justify-center">
          <button
            onClick={onPlay}
            className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
              isCurrent ? 'text-black' : 'bg-white/[0.06] text-[#a08a6a] hover:bg-white/[0.12] hover:text-white'
            }`}
            style={isCurrent ? { backgroundColor: accentColor } : {}}
          >
            {isCurrent && isPlaying
              ? <Pause size={11} fill="currentColor" />
              : <Play size={11} fill="currentColor" className="ml-0.5" />}
          </button>
        </div>

        {/* Cover art thumbnail */}
        <Link href={`/store/${track.id}`} className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#0a0907]">
          {track.cover_url
            ? <img src={track.cover_url} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center text-[#3a3328]"><Music size={14} /></div>}
        </Link>

        {/* Title + meta + tags */}
        <div className="flex-1 min-w-0">
          <Link href={`/store/${track.id}`} className="block">
            <p className={`text-[13px] font-medium truncate transition-colors ${isCurrent ? 'text-[#D4BFA0]' : 'text-[#E8DCC8] hover:text-[#D4BFA0]'}`}
              style={isCurrent ? { color: accentColor } : {}}>
              {track.title}
            </p>
            <p className="text-[10px] font-mono text-[#5a5142] uppercase tracking-wider truncate">
              {track.type}
              {track.bpm ? ` · ${track.bpm} bpm` : ''}
              {track.key ? ` · ${track.key}` : ''}
              {track.duration_seconds ? ` · ${fmtDur(track.duration_seconds)}` : ''}
            </p>
          </Link>
          {/* Tags chips — visible on wider screens */}
          {(track.tags ?? []).length > 0 && (
            <div className="hidden sm:flex flex-wrap gap-1 mt-1">
              {(track.tags ?? [])
                .filter((t) => t.category === 'genre' || t.category === 'mood')
                .slice(0, 3)
                .map((t) => (
                  <span key={t.tag} className="px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-[#1f1a13] text-[#6a5d4a]">
                    {t.tag}
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* Prices / free — no waveform in list view */}
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {track.free_download_enabled ? (
            <button
              onClick={onFreeDownload}
              className="px-3 py-1.5 rounded-md bg-[#6DC6A4]/10 border border-[#6DC6A4]/20 text-[#6DC6A4] text-[10px] font-bold uppercase tracking-wider hover:bg-[#6DC6A4]/20 transition-colors"
            >
              Free
            </button>
          ) : (
            <>
              <button
                onClick={onAddLease}
                disabled={priceLease == null}
                className="px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#E8DCC8] text-[11px] font-bold hover:bg-white/[0.08] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {priceLease != null ? `$${priceLease}` : '—'}
                <span className="text-[9px] font-mono text-[#6a5d4a] ml-1">Lease</span>
              </button>
              <button
                onClick={onAddExclusive}
                disabled={priceExclusive == null}
                className="px-3 py-1.5 rounded-md text-black text-[11px] font-bold hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ backgroundColor: accentColor }}
              >
                {priceExclusive != null ? `$${priceExclusive}` : '—'}
                <span className="text-[9px] font-mono text-black/60 ml-1">Excl</span>
              </button>
            </>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((o) => !o)}
          className="w-6 h-6 flex items-center justify-center text-[#3a3328] hover:text-[#a08a6a] transition-colors shrink-0"
        >
          <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded: description only — no waveform in list view */}
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-[#1a160f]">
          {track.description && (
            <p className="text-[11px] text-[#a08a6a] leading-relaxed">{track.description}</p>
          )}
          {!track.description && (
            <p className="text-[11px] text-[#3a3328] italic">No description.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Free Download Modal ────────────────────────────────────── */

function FreeDownloadModal({
  track, onClose, accentColor,
}: {
  track: StoreTrack;
  onClose: () => void;
  accentColor: string;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/store/free-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined, track_id: track.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Trigger download
      const a = document.createElement('a');
      a.href = data.download_url;
      a.download = track.title || 'beat';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Download failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-[#14110d] border border-[#1f1a13] rounded-2xl w-full max-w-sm p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-[#3a3328] hover:text-[#a08a6a] transition-colors">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          {track.cover_url && (
            <img src={track.cover_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          )}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#5a5142] mb-1">Free download</p>
            <p className="text-[14px] font-semibold text-[#E8DCC8] truncate max-w-[200px]">{track.title}</p>
          </div>
        </div>

        <p className="text-[11px] text-[#6a5d4a] mb-4 leading-relaxed">
          Enter your email to get the download link. We'll occasionally send new releases — no spam.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full bg-[#0c0a08] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com *"
            required
            className="w-full bg-[#0c0a08] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
          />
          {error && (
            <p className="text-[11px] text-red-400 bg-red-400/5 border border-red-400/20 rounded px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-black font-bold text-[12px] uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
            style={{ backgroundColor: accentColor }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {submitting ? 'Preparing…' : 'Download Free'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Contact form ───────────────────────────────────────────── */

function StoreContactForm({ creator, accentColor }: { creator: CreatorProfile | null; accentColor: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in your name, email, and message.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/store/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${res.status}`);
      }
      setSent(true);
      setName(''); setEmail(''); setSubject(''); setMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-t border-[#1a160f]">
      <div className="max-w-xl mx-auto px-4 md:px-10 py-16">
        <div className="text-center mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#3a3328] mb-2">Get in touch</p>
          <h2 className="text-xl font-medium text-[#E8DCC8]">
            Work with {creator?.display_name || 'the producer'}
          </h2>
          <p className="mt-2 text-[12px] text-[#5a5142]">
            Licensing inquiries, custom beats, features — drop a message.
          </p>
        </div>

        {sent ? (
          <div className="text-center py-10 px-6 rounded-2xl bg-[#14110d] border border-[#1f1a13]">
            <CheckCircle2 size={28} className="text-[#6DC6A4] mx-auto mb-3" />
            <p className="text-[14px] font-medium text-[#E8DCC8] mb-1">Message sent!</p>
            <p className="text-[12px] text-[#5a5142]">You'll hear back soon.</p>
            <button
              onClick={() => setSent(false)}
              className="mt-4 text-[10px] font-mono uppercase tracking-wider text-[#6a5d4a] hover:text-[#E8DCC8] transition-colors"
            >
              Send another
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5">
                  Your name <span className="text-[#3a3328]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Artist name or real name"
                  className="w-full bg-[#14110d] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5">
                  Email <span className="text-[#3a3328]">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-[#14110d] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Beat licensing, custom request, feature…"
                className="w-full bg-[#14110d] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-[#5a5142] mb-1.5">
                Message <span className="text-[#3a3328]">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Tell me about your project, vision, or what you're looking for…"
                className="w-full bg-[#14110d] border border-[#1f1a13] rounded-lg px-3 py-2.5 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620] transition-colors resize-none leading-relaxed"
              />
              <p className="text-right text-[9px] font-mono text-[#3a3328] mt-1">{message.length}/2000</p>
            </div>

            {error && (
              <p className="text-[11px] text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-black font-bold text-[12px] uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: accentColor }}
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {sending ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
