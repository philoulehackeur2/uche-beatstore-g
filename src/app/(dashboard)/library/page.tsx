'use client';

/**
 * /library = VAULT
 * Flat list of every track the user owns. The source of truth.
 */

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Loader2, Search, Sparkles, Play, Shuffle, LayoutList, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { usePlayer } from '@/hooks/usePlayer';
import { DropZone } from '@/components/upload/DropZone';
import { TrackCard } from '@/components/tracks/TrackCard';
import { TrackDetailsDrawer } from '@/components/tracks/TrackDetailsDrawer';
import { Track } from '@/lib/types';
import { toast, confirmToast } from '@/hooks/useToast';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import { Dropdown } from '@/components/ui/Dropdown';
import { BatchActionBar, DeleteIcon } from '@/components/ui/BatchActionBar';
import { listCached } from '@/lib/offline/audio-cache';
import { TrackGridCard } from '@/components/tracks/TrackGridCard';
import { FilterBar, LibraryFilters, DEFAULT_FILTERS, hasActiveFilters, activeFilterCount } from '@/components/library/FilterBar';
import { ContentShareModal } from '@/components/share/ContentShareModal';

// Sort modes — added so the library is browsable beyond "newest first."
// `recent` reflects upload time; `recently_played` would need a history
// table we don't have. Skipping for now.
type SortMode = 'recent' | 'title' | 'bpm' | 'bpm-desc' | 'key' | 'rating';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recent', label: 'Newest' },
  { value: 'title', label: 'Title A→Z' },
  { value: 'bpm', label: 'BPM ↑' },
  { value: 'bpm-desc', label: 'BPM ↓' },
  { value: 'key', label: 'Key' },
  { value: 'rating', label: 'Rating ↓' },
];

// Circle-of-fifths ordering — sorting by key alphabetically would
// scatter compatible keys. This puts harmonically related keys near
// each other (C / G / D / A / E / B / F# / C# / G# / D# / A# / F).
const KEY_ORDER: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5,
  'F#': 6, 'C#': 7, 'G#': 8, 'D#': 9, 'A#': 10, F: 11,
  // Flat aliases — Postgres / Essentia sometimes emits these instead
  // of sharps. Map them to the equivalent sharp slot so a mixed
  // dataset still sorts coherently.
  Db: 7, Eb: 9, Gb: 6, Ab: 8, Bb: 10,
};
function keyRank(t: { key?: string | null; scale?: string | null }): number {
  if (!t.key) return 999;
  const base = KEY_ORDER[t.key] ?? 998;
  // Minor sits after major in each slot so a key listing groups
  // C major then C minor, D major then D minor, etc.
  return base * 2 + (t.scale === 'minor' ? 1 : 0);
}

export default function LibraryPage() {
  // Proper Track typing rather than the previous `any[]` — catches column
  // renames at compile time and gives the drawer call sites real
  // intellisense on `track.bpm`, `track.energy`, etc.
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'beat' | 'instrumental' | 'song' | 'remix'>('all');
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [cachedIds, setCachedIds] = useState<Set<string>>(new Set());

  const refreshOfflineList = async () => {
    try {
      const list = await listCached();
      setCachedIds(new Set(list.map((item) => item.id)));
    } catch (err) {
      console.error('Failed to list cached tracks:', err);
    }
  };

  useEffect(() => {
    refreshOfflineList();
  }, [tracks]);

  const [sortMode, setSortMode] = useState<SortMode>('recent');
  // Batch-select state for delete. Same UX as the playlists page —
  // a "Select" toggle near the bulk-analyze button activates select
  // mode, then TrackCards expose checkboxes via the `selectable` prop.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [shareTarget, setShareTarget] = useState<Track | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<LibraryFilters>(() => ({
    ...DEFAULT_FILTERS,
    keys: new Set<string>(),
    statuses: new Set<string>(),
  }));
  useEffect(() => {
    const saved = localStorage.getItem('library-view') as 'list' | 'grid' | null;
    if (saved === 'list' || saved === 'grid') setViewMode(saved);
  }, []);
  useEffect(() => { localStorage.setItem('library-view', viewMode); }, [viewMode]);
  const { setTrack, setQueue, currentTrack } = usePlayer();

  const fetchTracks = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/tracks', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Failed to load tracks (${res.status})`);
      }
      setTracks(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Error fetching tracks:', err);
      setFetchError(err?.message || 'Failed to load tracks');
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTracks(); }, []);

  // Auto-refresh on track inserts/updates/deletes. Replaces the previous
  // "refresh only on user action" behavior — uploads from elsewhere or
  // analyze jobs landing now surface immediately in the library.
  useRealtimeTable({ table: 'tracks', onChange: fetchTracks });

  // Whenever the tracks list refreshes, re-sync the open drawer's track so
  // edits (re-analyze, rating, status, replace audio) reflect immediately
  // without requiring the user to close + reopen.
  useEffect(() => {
    if (!selectedTrack) return;
    const fresh = tracks.find((t) => t.id === selectedTrack.id);
    if (fresh && fresh !== selectedTrack) setSelectedTrack(fresh);
  }, [tracks, selectedTrack]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = tracks.filter((t) => {
      if (offlineOnly && !cachedIds.has(t.id)) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (filters.bpmMin != null && (t.bpm == null || t.bpm < filters.bpmMin)) return false;
      if (filters.bpmMax != null && (t.bpm == null || t.bpm > filters.bpmMax)) return false;
      if (filters.keys.size > 0 && (!t.key || !filters.keys.has(t.key))) return false;
      if (filters.scale === 'major' && t.scale === 'minor') return false;
      if (filters.scale === 'minor' && t.scale !== 'minor') return false;
      if (filters.statuses.size > 0 && (!t.status || !filters.statuses.has(t.status))) return false;
      if (filters.rating != null && (t.rating == null || t.rating < filters.rating)) return false;
      if (!q) return true;
      // Match against title, key (e.g. "C minor", "Am"), and BPM
      // string (e.g. "140"). Tags aren't on the Track row by default,
      // so we skip them here — TagPicker filtering belongs in a
      // dedicated chip strip if/when surfaced.
      const haystack = [
        t.title,
        t.key ? `${t.key} ${t.scale ?? ''}` : '',
        t.bpm != null ? String(t.bpm) : '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });

    // Stable sort by the chosen mode. We don't mutate `tracks` directly —
    // returning a fresh array also retriggers downstream memos cleanly.
    const sorted = [...matched];
    switch (sortMode) {
      case 'title':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'bpm':
        sorted.sort((a, b) => (a.bpm ?? Infinity) - (b.bpm ?? Infinity));
        break;
      case 'bpm-desc':
        sorted.sort((a, b) => (b.bpm ?? -Infinity) - (a.bpm ?? -Infinity));
        break;
      case 'key':
        sorted.sort((a, b) => keyRank(a) - keyRank(b));
        break;
      case 'rating':
        sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return sorted;
  }, [tracks, search, typeFilter, offlineOnly, cachedIds, sortMode, filters]);

  const currentHeroTrack = currentTrack || filtered[0] || null;
  const heroCoverUrl = currentHeroTrack?.cover_url || null;

  // Total library duration shown in the hero.
  const totalDurationLabel = useMemo(() => {
    const secs = tracks.reduce((s, t) => s + (t.duration_seconds || 0), 0);
    if (secs <= 0) return '';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${Math.max(1, mins)} min`;
  }, [tracks]);

  // Aggregate stats computed from the full library (not the filtered
  // view) so the stat strip reflects the vault state, not search state.
  const libraryStats = useMemo(() => {
    const withBpm = tracks.filter((t) => t.bpm != null);
    const avgBpm = withBpm.length
      ? Math.round(withBpm.reduce((s, t) => s + (t.bpm ?? 0), 0) / withBpm.length)
      : null;

    // Most common key (e.g. "C# minor")
    const keyCount: Record<string, number> = {};
    for (const t of tracks) {
      if (t.key) {
        const k = `${t.key}${t.scale === 'minor' ? 'm' : ''}`;
        keyCount[k] = (keyCount[k] ?? 0) + 1;
      }
    }
    const topKey = Object.entries(keyCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topKeyScale = topKey?.endsWith('m') ? 'minor' : 'major';

    // Most common type
    const typeCount: Record<string, number> = {};
    for (const t of tracks) {
      if (t.type) typeCount[t.type] = (typeCount[t.type] ?? 0) + 1;
    }
    const topType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // Average rating (only rated tracks)
    const rated = tracks.filter((t) => t.rating != null && t.rating > 0);
    const avgRating = rated.length
      ? (rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;

    return { avgBpm, topKey, topKeyScale, topType, avgRating };
  }, [tracks]);

  const playAll = () => {
    if (filtered.length === 0) return;
    setQueue(filtered);
    setTrack(filtered[0]);
  };
  const shuffleAll = () => {
    if (filtered.length === 0) return;
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setTrack(shuffled[0]);
  };

  const playTrack = (track: any) => {
    // Queue rule: the filtered view if it's the user's current context
    // (multiple visible tracks → they're browsing a subset), otherwise
    // the full library. A filter-of-one would otherwise leave "next"
    // dead, which surprises users who expect Library = album-like queue.
    setQueue(filtered.length > 1 ? filtered : tracks);
    setTrack(track);
  };

  // Tracks that look like they predate the heuristic-features fix.
  // We treat "missing intelligence" as null/undefined on the four AudD-ish
  // fields. Tracks where AudD genuinely returned 0 are skipped — re-analyzing
  // them won't help.
  const stale = useMemo(
    () =>
      tracks.filter(
        (t: any) =>
          !!t.audio_url &&
          (t.energy == null ||
            t.danceability == null ||
            t.valence == null ||
            t.acousticness == null),
      ),
    [tracks],
  );

  const [bulkAnalyzing, setBulkAnalyzing] = useState<{ done: number; total: number } | null>(null);

  const runBulkAnalyze = async () => {
    if (stale.length === 0 || bulkAnalyzing) return;
    setBulkAnalyzing({ done: 0, total: stale.length });
    let ok = 0;
    // Collect per-track failure reasons. The old version just counted
    // fails — users would see "3 failed" with no idea which tracks or
    // why. Now we surface the first few reasons in the toast.
    const failures: { title: string; reason: string }[] = [];
    for (let i = 0; i < stale.length; i++) {
      const t = stale[i];
      try {
        const res = await fetch(`/api/tracks/${t.id}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (res.ok) {
          ok++;
        } else {
          const j = await res.json().catch(() => ({}));
          failures.push({ title: t.title || t.id, reason: j?.error || `HTTP ${res.status}` });
        }
      } catch (err) {
        failures.push({ title: t.title || t.id, reason: err instanceof Error ? err.message : 'Network error' });
      }
      setBulkAnalyzing({ done: i + 1, total: stale.length });
    }
    setBulkAnalyzing(null);
    await fetchTracks();
    if (failures.length === 0) {
      toast.success(`Analyzed ${ok} tracks`);
    } else {
      // Truncate to first 3 reasons; the rest are summarised. Keeps the
      // toast readable for big bulk runs that pile up failures.
      const sample = failures.slice(0, 3).map((f) => `• ${f.title}: ${f.reason}`).join('\n');
      const more = failures.length > 3 ? `\n…and ${failures.length - 3} more.` : '';
      toast.warning(`Analyzed ${ok}, ${failures.length} failed`, `${sample}${more}`);
    }
  };

  const handleDeleteTrack = async (track: Track) => {
    const ok = await confirmToast(
      `Delete "${track.title}"?`,
      'This permanently removes the track from your library.',
      { confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true },
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/tracks/${track.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error('Delete failed', j.error || `HTTP ${res.status}`);
        return;
      }
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      if (selectedTrack?.id === track.id) setSelectedTrack(null);
      toast.success('Track deleted');
    } catch (err: any) {
      toast.error('Delete failed', err?.message);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 pt-8 md:pt-16">
        {/* Hero — minimal, floating typography inspired by Hyper Dreams.
            Clean layout with brand-style typography and subtle metadata. */}
        <div className="mb-10 sm:mb-14">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-white/40 mb-3">Your Vault</p>
              <h1 className="text-[42px] sm:text-[56px] md:text-[72px] font-medium uppercase tracking-[0.15em] text-white leading-[0.9] mb-4">Library</h1>
              <div className="flex items-center gap-6 text-[11px] font-medium uppercase tracking-[0.2em] text-white/40">
                <span>{tracks.length} track{tracks.length !== 1 ? 's' : ''}</span>
                {totalDurationLabel && <span>{totalDurationLabel}</span>}
                {libraryStats.avgBpm && <span className="hidden sm:inline">{libraryStats.avgBpm} BPM avg</span>}
                {libraryStats.topKey && <span className="hidden md:inline">Key: {libraryStats.topKey}</span>}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={playAll}
                disabled={!filtered.length}
                className="flex items-center gap-2 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.15em] bg-white text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Play size={10} fill="currentColor" />
                Play
              </button>
              <button
                onClick={shuffleAll}
                disabled={!filtered.length}
                className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.15em] text-white/60 hover:text-white border border-white/20 hover:border-white/40 disabled:opacity-40 transition-colors"
              >
                <Shuffle size={10} />
                Shuffle
              </button>
              {stale.length > 0 && (
                <button
                  onClick={runBulkAnalyze}
                  disabled={!!bulkAnalyzing}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.15em] text-white/40 hover:text-white border border-white/10 hover:border-white/30 disabled:opacity-40 transition-colors"
                  title="Run analysis on tracks missing intelligence fields"
                >
                  {bulkAnalyzing ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      <span>{bulkAnalyzing.done}/{bulkAnalyzing.total}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={10} />
                      <span>Analyze {stale.length}</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                className={`text-[11px] font-medium uppercase tracking-[0.15em] px-4 py-2 transition-colors ${
                  selectMode
                    ? 'bg-white text-black'
                    : 'text-white/40 hover:text-white border border-white/10 hover:border-white/30'
                }`}
              >
                {selectMode ? 'Done' : 'Select'}
              </button>
            </div>
          </div>
        </div>

        {/* Filter chips strip — minimal, no backgrounds, text-only with underlines */}
        <div className="flex items-center gap-6 mb-6 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide border-b border-white/10">
          {(['all', 'beat', 'instrumental', 'song', 'remix'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setOfflineOnly(false);
                setTypeFilter(t);
              }}
              className={`shrink-0 pb-3 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors relative ${
                typeFilter === t && !offlineOnly
                  ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-white'
                  : 'text-white/40 hover:text-white/70'
              }`}
            >{t === 'all' ? 'All' : t}</button>
          ))}
          
          <button
            onClick={() => {
              setOfflineOnly(true);
              refreshOfflineList();
            }}
            className={`shrink-0 pb-3 text-[11px] font-medium uppercase tracking-[0.2em] transition-colors flex items-center gap-2 relative ${
              offlineOnly
                ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <span>Offline</span>
            {cachedIds.size > 0 && (
              <span className="text-[9px] font-medium tabular-nums">
                ({cachedIds.size})
              </span>
            )}
          </button>
        </div>

        {/* Secondary toolbar — search on the left, sort dropdown on the
            right. Clean, minimal styling. */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-8">
          <div className="relative flex-1 min-w-[160px] sm:max-w-sm">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              placeholder="Search tracks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent border border-white/15 px-8 py-2 text-[11px] uppercase tracking-[0.1em] text-white placeholder-white/30 focus:outline-none focus:border-white/40 transition-colors"
            />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.15em] transition-colors ${
                showFilters || hasActiveFilters(filters)
                  ? 'text-white border border-white/40'
                  : 'text-white/40 hover:text-white border border-white/15 hover:border-white/30'
              }`}
            >
              <SlidersHorizontal size={10} />
              Filters
              {hasActiveFilters(filters) && (
                <span className="text-[9px] tabular-nums">({activeFilterCount(filters)})</span>
              )}
            </button>
            <Dropdown
              value={sortMode}
              onChange={(v) => setSortMode(v as SortMode)}
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              label="Sort"
              aria-label="Sort tracks"
            />
            <div className="flex items-center border border-white/15">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${
                  viewMode === 'list' ? 'bg-white text-black' : 'text-white/40 hover:text-white'
                }`}
                title="List view"
              >
                <LayoutList size={12} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 transition-colors ${
                  viewMode === 'grid' ? 'bg-white text-black' : 'text-white/40 hover:text-white'
                }`}
                title="Grid view"
              >
                <LayoutGrid size={12} />
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <FilterBar filters={filters} onChange={setFilters} />
        )}

        {/* Upload */}
        <div className="mb-8">
          <DropZone onUploadSuccess={fetchTracks} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={16} className="animate-spin text-white/30" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-24">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60 mb-2">Could not load library</p>
            <p className="text-[10px] text-white/30 max-w-md mx-auto mb-6">{fetchError}</p>
            <button
              onClick={fetchTracks}
              className="text-[11px] font-medium uppercase tracking-[0.15em] px-4 py-2 border border-white/20 text-white/60 hover:text-white hover:border-white/40 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60 mb-2">
              {tracks.length === 0 ? 'No tracks yet' : 'No matches'}
            </p>
            <p className="text-[10px] text-white/30">
              {tracks.length === 0
                ? 'Upload above to start building your Vault'
                : 'Try a different search or filter'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="border-t border-white/10 border-b mb-32">
            {/* Column header — grid must match TrackCard's 9-col md template */}
            <div className="grid grid-cols-[32px_32px_1fr_90px_32px] sm:grid-cols-[32px_32px_1fr_90px_110px_110px_32px] md:grid-cols-[32px_32px_1fr_110px_130px_50px_120px_110px_32px] items-center gap-4 px-4 h-10 border-b border-white/10 text-[9px] font-medium uppercase tracking-[0.2em]">
              <span className="text-center flex items-center justify-center text-white/30">
                {selectMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = filtered.every((t: any) => selectedIds.has(t.id));
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (allSelected) {
                          filtered.forEach((t: any) => next.delete(t.id));
                        } else {
                          filtered.forEach((t: any) => next.add(t.id));
                        }
                        return next;
                      });
                    }}
                    className={`w-4 h-4 flex items-center justify-center transition-colors cursor-pointer border ${
                      filtered.length > 0 && filtered.every((t: any) => selectedIds.has(t.id))
                        ? 'bg-white border-white'
                        : 'border-white/30 hover:border-white/60'
                    }`}
                  >
                    {filtered.length > 0 && filtered.every((t: any) => selectedIds.has(t.id)) && (
                      <span className="text-black text-[9px] leading-none">✓</span>
                    )}
                  </button>
                ) : (
                  '#'
                )}
              </span>
              <span />
              {/* Clickable sort headers */}
              {(
                [
                  { label: 'Title', sort: 'title' as SortMode, always: true },
                  { label: 'Type', sort: null, always: false, cls: 'hidden sm:block' },
                  { label: 'BPM · Key', sort: sortMode === 'bpm' ? 'bpm-desc' as SortMode : 'bpm' as SortMode, always: true, activeSort: sortMode === 'bpm' || sortMode === 'bpm-desc' },
                  { label: 'Len', sort: null, always: false, cls: 'hidden md:block' },
                  { label: 'Added', sort: 'recent' as SortMode, always: false, cls: 'hidden md:block' },
                  { label: '★', sort: 'rating' as SortMode, always: false, cls: 'hidden sm:block text-right' },
                ] as Array<{ label: string; sort: SortMode | null; always: boolean; cls?: string; activeSort?: boolean }>
              ).map(({ label, sort, cls, activeSort }) => {
                const isActive = activeSort ?? (sort != null && sortMode === sort);
                if (!sort) return <span key={label} className={`${cls ?? ''} text-white/30`}>{label}</span>;
                return (
                  <button
                    key={label}
                    onClick={() => setSortMode(sort)}
                    className={`flex items-center gap-1 transition-colors hover:text-white ${cls ?? ''} ${
                      isActive ? 'text-white' : 'text-white/30'
                    }`}
                  >
                    {label}
                    <span className="text-[8px]">
                      {isActive ? (sortMode === 'bpm-desc' ? '↓' : '↑') : ''}
                    </span>
                  </button>
                );
              })}
              <span />
            </div>
            {filtered.map((t: any, i: number) => (
              <TrackCard
                key={t.id}
                track={t}
                index={i + 1}
                onClickDetails={(track) => { setSelectedTrack(track); playTrack(track); }}
                onPlayClick={() => playTrack(t)}
                onDelete={(track) => handleDeleteTrack(track)}
                onShare={(track) => setShareTarget(track)}
                selectable={selectMode}
                selected={selectedIds.has(t.id)}
                onSelectChange={(track, sel) => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (sel) next.add(track.id); else next.delete(track.id);
                  return next;
                })}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-32">
            {filtered.map((t) => (
              <TrackGridCard
                key={t.id}
                track={t}
                onClickDetails={(track) => { setSelectedTrack(track); playTrack(track); }}
                onPlayClick={() => playTrack(t)}
                onDelete={(track) => handleDeleteTrack(track)}
                onShare={(track) => setShareTarget(track)}
                selectable={selectMode}
                selected={selectedIds.has(t.id)}
                onSelectChange={(track, sel) => setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (sel) next.add(track.id); else next.delete(track.id);
                  return next;
                })}
              />
            ))}
          </div>
        )}
      </div>

      {selectedTrack && (
        <TrackDetailsDrawer
          track={selectedTrack}
          onClose={() => setSelectedTrack(null)}
          onUpdate={fetchTracks}
        />
      )}

      {shareTarget && (
        <ContentShareModal
          contentType="track"
          contentId={shareTarget.id}
          contentTitle={shareTarget.title}
          coverUrl={shareTarget.cover_url}
          onClose={() => setShareTarget(null)}
        />
      )}

      {/* Batch-delete bar — visible only in select mode with ≥1 chosen.
          Loops the existing DELETE /api/tracks/[id] (already gated by
          requireRowOwnership + cascades on project/playlist junctions).
          No bulk endpoint needed; parallel HTTP keeps wall time flat. */}
      <BatchActionBar
        count={selectedIds.size}
        noun={['track', 'tracks']}
        onClear={() => setSelectedIds(new Set())}
        busy={bulkDeleting}
        actions={[{
          label: 'Delete',
          icon: <DeleteIcon size={11} />,
          intent: 'danger',
          onClick: async () => {
            const ok = await confirmToast(
              `Delete ${selectedIds.size} track${selectedIds.size === 1 ? '' : 's'}?`,
              'Permanently removes the audio files, stems, and history. Cannot be undone.',
              { confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true },
            );
            if (!ok) return;
            setBulkDeleting(true);
            const ids = Array.from(selectedIds);
            const results = await Promise.allSettled(
              ids.map((id) =>
                fetch(`/api/tracks/${id}`, { method: 'DELETE' }).then((r) => {
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                }),
              ),
            );
            const failed = results.filter((r) => r.status === 'rejected').length;
            setBulkDeleting(false);
            setSelectedIds(new Set());
            setSelectMode(false);
            await fetchTracks();
            if (failed === 0) {
              toast.success(`Deleted ${ids.length} track${ids.length === 1 ? '' : 's'}`);
            } else {
              toast.warning(`Deleted ${ids.length - failed}, ${failed} failed`);
            }
          },
        }]}
      />
    </DashboardLayout>
  );
}
