'use client';

/**
 * /library = VAULT
 * Flat list of every track the user owns. The source of truth.
 */

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Loader2, Music, Search, Sparkles, Play, Shuffle, Disc3 } from 'lucide-react';
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
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  // Batch-select state for delete. Same UX as the playlists page —
  // a "Select" toggle near the bulk-analyze button activates select
  // mode, then TrackCards expose checkboxes via the `selectable` prop.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const { setTrack, setQueue } = usePlayer();

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
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
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
  }, [tracks, search, typeFilter, sortMode]);

  // Total library duration shown in the hero. Format follows the
  // "N hr N min" pattern when over an hour, "N min" otherwise — same
  // convention as project header stats.
  const totalDurationLabel = useMemo(() => {
    const secs = tracks.reduce((s, t) => s + (t.duration_seconds || 0), 0);
    if (secs <= 0) return '';
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours > 0) return `${hours} hr ${mins} min`;
    return `${Math.max(1, mins)} min`;
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
      <div className="max-w-[1400px] mx-auto px-10 pt-10">
        {/* Hero — gradient panel with the library "cover" tile, title,
            stats, and the two primary actions (Play / Shuffle). Builds on
            the same gradient + glass language as the project detail
            cover, only flatter and wider. Filter chips and the secondary
            toolbar sit underneath, outside the hero, so the hero only
            owns identity + primary intent. */}
        <div className="relative mb-8 rounded-2xl overflow-hidden border border-white/[0.05] bg-gradient-to-br from-[#3a2a8a]/30 via-[#2A2418]/20 to-[#0a0907] p-7">
          <div
            className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none opacity-30"
            style={{ background: 'radial-gradient(circle, #D4BFA0 0%, transparent 70%)' }}
          />
          <div className="relative z-10 flex items-end gap-7">
            <div className="w-[140px] h-[140px] rounded-xl bg-gradient-to-br from-[#D4BFA0] to-[#3a2a8a] flex items-center justify-center shadow-[0_12px_36px_rgba(0,0,0,0.5)] shrink-0">
              <Disc3 size={56} className="text-white/85" strokeWidth={1.2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#E8D8B8] mb-2">Vault</p>
              <h1 className="text-[56px] font-bold tracking-tight text-white leading-none mb-3">Library</h1>
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#a08a6a]">
                {tracks.length} track{tracks.length !== 1 ? 's' : ''}
                {totalDurationLabel && <> · {totalDurationLabel}</>}
              </p>
              <div className="flex items-center gap-2 mt-5">
                <button
                  onClick={playAll}
                  disabled={!filtered.length}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black text-[12px] font-medium hover:bg-[#E8DCC8] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Play size={12} fill="currentColor" className="ml-0.5" />
                  Play
                </button>
                <button
                  onClick={shuffleAll}
                  disabled={!filtered.length}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[#E8DCC8] text-[12px] font-medium hover:bg-white/[0.1] hover:border-white/[0.16] backdrop-blur-sm disabled:opacity-40 transition-colors"
                >
                  <Shuffle size={12} />
                  Shuffle
                </button>
                {stale.length > 0 && (
                  <button
                    onClick={runBulkAnalyze}
                    disabled={!!bulkAnalyzing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[#a08a6a] text-[12px] font-medium hover:text-[#E8D8B8] hover:border-[#D4BFA0]/30 disabled:opacity-40 transition-colors"
                    title="Run analysis on tracks missing intelligence fields"
                  >
                    {bulkAnalyzing ? (
                      <>
                        <Loader2 size={11} className="animate-spin" />
                        <span>Analyzing {bulkAnalyzing.done}/{bulkAnalyzing.total}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={11} />
                        <span>Analyze {stale.length}</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  className={`text-[11px] font-medium px-4 py-2.5 rounded-full transition-colors ml-auto ${
                    selectMode
                      ? 'bg-[#2A2418] border border-[#8A7A5C]/40 text-[#E8D8B8]'
                      : 'bg-white/[0.04] border border-white/[0.06] text-[#a08a6a] hover:text-[#E8DCC8] hover:bg-white/[0.08]'
                  }`}
                >
                  {selectMode ? 'Done' : 'Select'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filter chips strip — type tabs as pill chips, scrolls
            horizontally on narrow viewports so it never wraps. Active
            chip is solid white-on-dark for clear focus state. */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {(['all', 'beat', 'instrumental', 'song', 'remix'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium capitalize transition-colors ${
                typeFilter === t
                  ? 'bg-white text-black'
                  : 'bg-white/[0.04] border border-white/[0.06] text-[#a08a6a] hover:text-white hover:bg-white/[0.08]'
              }`}
            >{t === 'all' ? 'All' : t}</button>
          ))}
        </div>

        {/* Secondary toolbar — search on the left, sort dropdown on the
            right. Lives below the chips so the hero + chip strip read
            as the identity row, and the toolbar is the actual control. */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4a4338]" />
            <input
              placeholder="Search tracks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/[0.06] rounded-full pl-8 pr-3 py-2 text-[12px] text-[#E8DCC8] placeholder-[#4a4338] focus:outline-none focus:border-white/[0.12] transition-colors"
            />
          </div>
          <div className="ml-auto">
            <Dropdown
              value={sortMode}
              onChange={(v) => setSortMode(v as SortMode)}
              options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              label="Sort"
              aria-label="Sort tracks"
            />
          </div>
        </div>

        {/* Upload */}
        <div className="mb-8">
          <DropZone onUploadSuccess={fetchTracks} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-[#4a4338]" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-red-950/30 border border-red-900/40 flex items-center justify-center">
              <Music size={22} className="text-red-400" />
            </div>
            <p className="text-sm text-[#E8DCC8] mb-1">Couldn&apos;t load your library</p>
            <p className="text-[11px] text-red-400 max-w-md mx-auto mb-4">{fetchError}</p>
            <button
              onClick={fetchTracks}
              className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-md border border-[#1a160f] bg-[#14110d] text-[#E8DCC8] hover:border-[#2d2620]"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-[#14110d] border border-[#1a160f] flex items-center justify-center">
              <Music size={22} className="text-[#3a3328]" />
            </div>
            <p className="text-sm text-[#E8DCC8] mb-1">
              {tracks.length === 0 ? 'No tracks yet' : 'No matches'}
            </p>
            <p className="text-[11px] text-[#5a5142]">
              {tracks.length === 0
                ? 'Upload above to start building your Vault'
                : 'Try a different search or filter'}
            </p>
          </div>
        ) : (
          <div className="border-t border-[#161310] border-b mb-32">
            <div className="grid grid-cols-[32px_32px_1fr_80px_100px_120px_110px_32px] items-center gap-4 px-4 h-9 border-b border-[#161310] text-[10px] font-mono uppercase tracking-wider text-[#3a3328]">
              <span className="text-center">#</span>
              <span />
              <span>Title</span>
              <span>Type</span>
              <span>BPM · Key</span>
              <span className="hidden md:block">Added</span>
              <span className="text-right">Rating</span>
              <span />
            </div>
            {filtered.map((t: any, i: number) => (
              <TrackCard
                key={t.id}
                track={t}
                index={i + 1}
                onClickDetails={(track) => setSelectedTrack(track)}
                onPlayClick={() => playTrack(t)}
                onDelete={(track) => handleDeleteTrack(track)}
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
