'use client';

import { usePlayer } from '@/hooks/usePlayer';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  ListMusic, Music, Shuffle, Repeat,
} from 'lucide-react';
import { WavePlayer } from './WavePlayer';
import { QueueDrawer } from './QueueDrawer';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Floating mini-player pill, centered along the bottom edge.
 *
 * Replaces the previous full-width bottom bar. The pill is content-sized
 * (not edge-to-edge), backdrop-blurred, with the waveform inline so the
 * whole player reads as one floating surface rather than chrome glued
 * to the page edge.
 *
 * Business logic is identical to the old PlayerBar — only the visual
 * layer changed. Queue, volume, transport all behave the same.
 */
export function PlayerBar() {
  const { currentTrack, isPlaying, togglePlay, next, prev, volume, setVolume, progress, queue } = usePlayer();
  const [muted, setMuted] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  // Shuffle / repeat are visual-only for now (toggles UI state).
  // Wiring them to the player engine is a separate change — but the
  // controls live here per the new spec.
  const [shuffle, setShuffle] = useState(false);
  const [repeatOn, setRepeatOn] = useState(false);

  if (!currentTrack) return null;

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalSeconds = currentTrack.duration_seconds || 0;
  const currentSeconds = totalSeconds * progress;

  return (
    <>
      <div className="fixed bottom-3 md:bottom-5 left-2 right-2 md:left-1/2 md:right-auto md:-translate-x-1/2 z-50 pointer-events-none flex justify-center">
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-2 md:gap-3 pl-2 pr-2 md:pr-3 py-2 rounded-full',
            'backdrop-blur-2xl border border-white/[0.06]',
            'bg-gradient-to-b from-[#161616]/85 to-[#0a0907]/95',
            'shadow-[0_12px_48px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.03)_inset]',
            'animate-in slide-in-from-bottom-4 fade-in duration-300',
            // Below md: no min-width, fill the screen edges-minus-padding.
            // md+: anchor to the center column with the original
            // proportions so the pill never blows out on ultra-wide.
            'w-full md:w-auto md:min-w-[640px] md:max-w-[920px]',
          )}
        >
          {/* Cover + name + meta — left cap of the pill. */}
          <div className="flex items-center gap-2 md:gap-3 pl-1 pr-2 md:pr-3 py-1 min-w-0">
            <div className="w-10 h-10 md:w-11 md:h-11 bg-[#14110d] rounded-full overflow-hidden flex-shrink-0 border border-white/[0.06] relative">
              {currentTrack.cover_url ? (
                <img src={currentTrack.cover_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#3a3328] bg-gradient-to-br from-[#2A2418] to-[#0a0907]">
                  <Music size={14} />
                </div>
              )}
            </div>
            <div className="min-w-0 max-w-[120px] md:max-w-[160px]">
              <h4 className="text-[12px] font-medium text-[#E8DCC8] truncate leading-tight">{currentTrack.title}</h4>
              <p className="text-[10px] font-mono text-[#5a5142] mt-0.5 uppercase tracking-wider truncate">
                {currentTrack.type}
                {currentTrack.bpm ? ` · ${currentTrack.bpm} bpm` : ''}
              </p>
            </div>
          </div>

          {/* Waveform + scrub + times — hidden below md (phone pill is
              cover + transport only). md+ keeps the inline waveform. */}
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono text-[#5a5142] tabular-nums w-9 text-right shrink-0">
              {formatTime(currentSeconds)}
            </span>
            <div className="w-[200px] h-8 flex items-center">
              {currentTrack.audio_url ? (
                <WavePlayer
                  url={currentTrack.audio_url}
                  trackId={currentTrack.id}
                  peaksUrl={currentTrack.peaks_url ?? null}
                  hideControls
                  onFinish={next}
                  height={28}
                />
              ) : (
                <div className="w-full h-[2px] bg-[#1a160f] rounded" />
              )}
            </div>
            <span className="text-[10px] font-mono text-[#5a5142] tabular-nums w-9 shrink-0">
              {formatTime(totalSeconds)}
            </span>
          </div>

          {/* Transport — center-right. The play button is the dominant
              circular element so it reads as the pill's "anchor". */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={prev} className="w-7 h-7 flex items-center justify-center text-[#a08a6a] hover:text-white transition-colors" aria-label="Previous track">
              <SkipBack size={13} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 active:scale-95 transition-transform shadow-[0_2px_8px_rgba(255,255,255,0.15)]"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={next} className="w-7 h-7 flex items-center justify-center text-[#a08a6a] hover:text-white transition-colors" aria-label="Next track">
              <SkipForward size={13} fill="currentColor" />
            </button>
          </div>

          {/* Right utilities — shuffle, repeat, queue, volume. Compact
              icon row; only the icons are visible, no labels. Volume
              uses a small range; full mixer-grade control lives in the
              studio. Progressive disclosure on narrow screens — phone
              keeps only Queue, tablet adds Shuffle/Repeat, desktop adds
              the volume slider. */}
          <div className="flex items-center gap-1.5 shrink-0 pl-2 md:border-l md:border-white/[0.05] md:ml-1">
            {/* Shuffle + Repeat — hidden below sm (phones) since the
                pill is already cramped with transport + cover. Volume
                stays hidden until md per its hover-slider design. */}
            <button
              onClick={() => setShuffle((v) => !v)}
              className={cn(
                'hidden sm:flex w-7 h-7 items-center justify-center transition-colors rounded-full',
                shuffle ? 'text-[#E8D8B8]' : 'text-[#6a5d4a] hover:text-white',
              )}
              aria-label="Shuffle"
              aria-pressed={shuffle}
            >
              <Shuffle size={12} />
            </button>
            <button
              onClick={() => setRepeatOn((v) => !v)}
              className={cn(
                'hidden sm:flex w-7 h-7 items-center justify-center transition-colors rounded-full',
                repeatOn ? 'text-[#E8D8B8]' : 'text-[#6a5d4a] hover:text-white',
              )}
              aria-label="Repeat"
              aria-pressed={repeatOn}
            >
              <Repeat size={12} />
            </button>
            <button
              onClick={() => setQueueOpen(true)}
              className="relative w-7 h-7 flex items-center justify-center text-[#6a5d4a] hover:text-white transition-colors rounded-full"
              aria-label="Queue"
            >
              <ListMusic size={12} />
              {queue.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-mono px-1 min-w-[12px] h-[12px] rounded-full bg-[#D4BFA0] text-white flex items-center justify-center leading-none">
                  {queue.length > 99 ? '99+' : queue.length}
                </span>
              )}
            </button>
            {/* Volume — clickable mute toggle + hover-revealed slider so
                the pill stays compact in the resting state. Hidden on
                touch-only screens where hover isn't a thing anyway. */}
            <div className="hidden md:flex group relative items-center">
              <button
                onClick={() => setMuted((v) => !v)}
                className="w-7 h-7 flex items-center justify-center text-[#6a5d4a] hover:text-white transition-colors rounded-full"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
              </button>
              <div className="w-0 group-hover:w-20 overflow-hidden transition-[width] duration-200 flex items-center">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(e) => { setMuted(false); setVolume(parseFloat(e.target.value)); }}
                  className="w-full h-1 cursor-pointer accent-white"
                  aria-label="Volume"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {queueOpen && <QueueDrawer onClose={() => setQueueOpen(false)} />}
    </>
  );
}
