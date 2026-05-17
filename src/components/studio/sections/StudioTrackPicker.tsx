'use client';

import { Loader2, Music2, Search } from 'lucide-react';
import type { Track } from '@/lib/types';

interface Props {
  tracks: Track[];
  loading: boolean;
  activeId: string | null;
  onPick: (id: string) => void;
  search: string;
  setSearch: (v: string) => void;
}

/**
 * Studio's left-rail track picker — extracted from StudioWorkstation.
 *
 * Lists every track with audio_url + a free-text search filter. The
 * parent owns the filtering logic (so it can also be used for things
 * like keyboard navigation) — we just render what gets handed in.
 *
 * Stems availability is surfaced via a small "Stems" pill on the right
 * of each row when the track has `stems_status === 'done'`. Lets the
 * user pick a stem-ready track for layered mixing without opening the
 * track first.
 */
export function StudioTrackPicker({
  tracks, loading, activeId, onPick, search, setSearch,
}: Props) {
  return (
    <aside className="border border-[#16130e] rounded-lg overflow-hidden h-[calc(100vh-220px)] flex flex-col">
      <div className="p-3 border-b border-[#16130e]">
        <div className="relative">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3a3328]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracks"
            className="w-full bg-[#0a0907] border border-[#1a160f] rounded-md py-1.5 pl-7 pr-2 text-[11px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#2d2620]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={14} className="animate-spin text-[#4a4338]" />
          </div>
        ) : search.trim().length === 0 ? (
          // Empty-by-default: studio is for *focus*, not browsing. The
          // user picks ONE track and works on it. Showing the whole
          // library on every studio mount is noise. They type → results
          // appear. The currently-loaded track stays visible at the top
          // so it doesn't feel like the picker "forgot" their session.
          <div className="px-3 py-8 text-center">
            {activeId && tracks.find((t) => t.id === activeId) ? (
              <>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#3a3328] mb-3">Now loaded</p>
                <button
                  onClick={() => onPick(activeId)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md bg-[#2A2418] mb-4"
                >
                  <div className="w-8 h-8 rounded bg-[#16130e] border border-[#1a160f] flex items-center justify-center shrink-0">
                    <Music2 size={12} className="text-[#E8D8B8]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-white truncate">
                      {tracks.find((t) => t.id === activeId)?.title}
                    </p>
                  </div>
                </button>
                <p className="text-[10px] text-[#4a4338] leading-relaxed">
                  Type to find another track to load. The studio works on one track at a time.
                </p>
              </>
            ) : (
              <>
                <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-[#14110d] border border-[#1a160f] flex items-center justify-center">
                  <Search size={14} className="text-[#3a3328]" />
                </div>
                <p className="text-[11px] text-[#6a5d4a] mb-1">Search to load a track</p>
                <p className="text-[10px] text-[#3a3328] leading-relaxed">
                  Or open a track from the library and click <span className="text-[#a08a6a]">Send to studio</span>.
                </p>
              </>
            )}
          </div>
        ) : tracks.length === 0 ? (
          <p className="text-center text-[11px] text-[#5a5142] py-12">No matches</p>
        ) : (
          tracks.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-[#161310] last:border-b-0 transition-colors ${
                activeId === t.id ? 'bg-[#2A2418]' : 'hover:bg-[#101010]'
              }`}
            >
              <div className="w-8 h-8 rounded bg-[#16130e] border border-[#1a160f] flex items-center justify-center shrink-0">
                <Music2 size={12} className={activeId === t.id ? 'text-[#E8D8B8]' : 'text-[#5a5142]'} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] truncate ${activeId === t.id ? 'text-white' : 'text-[#E8DCC8]'}`}>
                  {t.title}
                </p>
                <p className="text-[9px] font-mono text-[#5a5142] uppercase tracking-wider">
                  {t.bpm ? `${t.bpm} BPM` : '— BPM'} · {t.key || '—'}
                </p>
              </div>
              {t.stems_status === 'done' && (
                <span className="text-[8px] font-mono uppercase tracking-wider text-[#E8D8B8] bg-[#2A2418] border border-[#8A7A5C]/40 rounded px-1.5 py-0.5">
                  Stems
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
