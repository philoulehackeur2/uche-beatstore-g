'use client';

/**
 * DAW-style player canvas — the unified player surface.
 *
 * Wraps the `useWaveSurfer` hook with the chrome that should be
 * consistent across every player surface in the app:
 *
 *   - transport controls (play / pause / skip back/forward / loop)
 *   - timecode (currentTime / duration in mm:ss.ms)
 *   - zoom in / out (cmd-+ / cmd-- or button)
 *   - region toolbar (drag-to-create region, clear all)
 *   - keyboard shortcuts (space = play/pause, ← → = seek, [/] = zoom)
 *
 * Pages that need a different layout (e.g. a thin strip without
 * controls) still drop down to `useWaveSurfer` directly and render
 * their own chrome.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ZoomIn, ZoomOut, Repeat, Square as StopIcon, Activity,
} from 'lucide-react';
import { useWaveSurfer, type RegionInfo } from '@/hooks/useWaveSurfer';

interface PlayerCanvasProps {
  url: string;
  peaksUrl?: string | null;
  height?: number;
  /** Enable region drag-select + loop. */
  enableRegions?: boolean;
  /** Loop playback when inside an active region. */
  loopRegions?: boolean;
  /** Initial zoom in px-per-second. 0 = fit to container width. */
  initialZoom?: number;
  /** Auto-play on ready. */
  autoPlay?: boolean;
  /** Called when playback reaches the end. */
  onFinish?: () => void;
  /** Called when regions change (created/updated/removed). */
  onRegionsChange?: (regions: RegionInfo[]) => void;
  /**
   * Imperative seek hook. Whenever this value changes (and is a positive
   * number), the player jumps to that time in seconds and starts playing.
   * Used by external surfaces (comment timecode pills, jump-to actions)
   * that want to drive playback without holding a ref to WaveSurfer.
   * Pass null / 0 to ignore. The version number on `seekRequest` is
   * what triggers the effect, so callers wanting to "seek to the same
   * spot again" can bump a nonce alongside.
   */
  seekRequest?: { time: number; nonce: number } | null;
  /**
   * Mount the timeline ruler above the waveform. Defaults to true — it's
   * cheap and DAW-mode users expect it. Set false for compact embeds.
   */
  showTimeline?: boolean;
  /**
   * Render a spectrogram toggle button. The spectrogram itself isn't
   * shown until the user clicks it (FFT cost is non-trivial). Defaults
   * to true so the button is visible; the underlying spectrogram is off
   * until the user opts in.
   */
  showSpectrogramToggle?: boolean;
  /** Override the controls bar visibility. */
  hideControls?: boolean;
  /** Override the region toolbar visibility. */
  hideRegionToolbar?: boolean;
}

const ZOOM_STEP = 30; // px-per-second per zoom-in/out click

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const tenths = Math.floor((seconds * 10) % 10);
  return `${m}:${s.toString().padStart(2, '0')}.${tenths}`;
}

export function PlayerCanvas({
  url,
  peaksUrl = null,
  height = 96,
  enableRegions = false,
  loopRegions = false,
  initialZoom = 0,
  autoPlay = false,
  onFinish,
  onRegionsChange,
  seekRequest = null,
  showTimeline = true,
  showSpectrogramToggle = true,
  hideControls = false,
  hideRegionToolbar = false,
}: PlayerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Spectrogram on/off — toggled by the button in the controls bar.
  // Default off because the FFT pass is expensive; flipping this triggers
  // a clean useWaveSurfer rebuild (playback position resets, ~1s redraw).
  const [showSpectrogram, setShowSpectrogram] = useState(false);

  const {
    ready, currentTime, duration, failed,
    play, pause, seek, setVolume,
    zoom, currentZoom,
    regions, clearRegions,
    instanceRef,
  } = useWaveSurfer({
    container: containerRef,
    url,
    peaksUrl,
    height,
    regions: enableRegions ? { loop: loopRegions } : false,
    initialZoom,
    autoPlay,
    onFinish,
    onRegionsChange,
    timeline: showTimeline,
    spectrogram: showSpectrogram,
  });

  // External seek-and-play requests (e.g. clicking a timecode pill on a
  // comment). We watch the nonce so the same time can be requested twice
  // — useful when the user wants to replay a region without dragging
  // the cursor.
  useEffect(() => {
    if (!seekRequest || !ready) return;
    seek(seekRequest.time);
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest?.nonce, ready]);

  // Keyboard shortcuts. We bind them on the document so the player works
  // even when focus is elsewhere on the page, but ignore them when the
  // user is typing in an input — otherwise space would toggle play during
  // comment composition.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? '';
      const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;
      if (isEditable) return;
      if (!ready) return;

      switch (e.key) {
        case ' ': {
          e.preventDefault();
          const ws = instanceRef.current;
          if (ws?.isPlaying()) pause();
          else play();
          break;
        }
        case 'ArrowLeft':
          // Shift accelerator: 10s back; default 2s.
          seek(Math.max(0, currentTime - (e.shiftKey ? 10 : 2)));
          break;
        case 'ArrowRight':
          seek(Math.min(duration, currentTime + (e.shiftKey ? 10 : 2)));
          break;
        case '[':
          // Zoom out
          zoom(Math.max(0, currentZoom - ZOOM_STEP));
          break;
        case ']':
          // Zoom in
          zoom(currentZoom + ZOOM_STEP);
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ready, currentTime, duration, currentZoom, play, pause, seek, zoom, instanceRef]);

  return (
    <div className="w-full space-y-3">
      {/* Waveform canvas — horizontal scroll appears automatically when
          zoom exceeds the container width. */}
      <div className="relative w-full overflow-x-auto bg-[#0a0907] border border-[#1a160f] rounded-md">
        <div ref={containerRef} className="w-full" style={{ minHeight: height }} />
        {!ready && !failed && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#5a5142]">
              Loading…
            </div>
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] font-mono text-[#6a5d4a]">waveform unavailable</span>
          </div>
        )}
      </div>

      {/* Controls bar */}
      {!hideControls && (
        <div className="flex items-center gap-3 px-1">
          {/* Transport */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => seek(Math.max(0, currentTime - 5))}
              className="text-[#a08a6a] hover:text-white transition-colors"
              title="Back 5s (← also works, shift+← = 10s)"
            >
              <SkipBack size={14} fill="currentColor" />
            </button>
            <button
              onClick={() => {
                const ws = instanceRef.current;
                if (ws?.isPlaying()) pause();
                else play();
              }}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
              title="Play / pause (Space)"
            >
              {instanceRef.current?.isPlaying() ? (
                <Pause size={13} fill="currentColor" />
              ) : (
                <Play size={13} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              onClick={() => seek(Math.min(duration, currentTime + 5))}
              className="text-[#a08a6a] hover:text-white transition-colors"
              title="Forward 5s (→ also works, shift+→ = 10s)"
            >
              <SkipForward size={14} fill="currentColor" />
            </button>
            <button
              onClick={() => { pause(); seek(0); }}
              className="text-[#6a5d4a] hover:text-white transition-colors ml-1"
              title="Stop (return to start)"
            >
              <StopIcon size={12} fill="currentColor" />
            </button>
          </div>

          {/* Timecode */}
          <div className="flex items-center gap-1 text-[11px] font-mono text-[#a08a6a] tabular-nums">
            <span className="text-[#E8DCC8]">{fmt(currentTime)}</span>
            <span className="text-[#4a4338]">/</span>
            <span>{fmt(duration)}</span>
          </div>

          {/* Spectrogram toggle + Zoom */}
          <div className="flex items-center gap-1 ml-auto">
            {showSpectrogramToggle && (
              <button
                onClick={() => setShowSpectrogram((v) => !v)}
                className={`p-1.5 border rounded transition-colors ${
                  showSpectrogram
                    ? 'bg-[#2A2418] border-[#8A7A5C] text-[#E8D8B8]'
                    : 'border-[#1a160f] text-[#6a5d4a] hover:text-white hover:border-[#2d2620]'
                }`}
                title={
                  showSpectrogram
                    ? 'Hide spectrogram (frequency view)'
                    : 'Show spectrogram (frequency view) — rebuilds the waveform'
                }
              >
                <Activity size={11} />
              </button>
            )}
            <button
              onClick={() => zoom(Math.max(0, currentZoom - ZOOM_STEP))}
              className="p-1.5 text-[#6a5d4a] hover:text-white border border-[#1a160f] hover:border-[#2d2620] rounded transition-colors"
              title="Zoom out  [  "
            >
              <ZoomOut size={11} />
            </button>
            <span className="text-[10px] font-mono text-[#6a5d4a] min-w-[50px] text-center tabular-nums">
              {currentZoom > 0 ? `${Math.round(currentZoom)}px/s` : 'fit'}
            </span>
            <button
              onClick={() => zoom(currentZoom + ZOOM_STEP)}
              className="p-1.5 text-[#6a5d4a] hover:text-white border border-[#1a160f] hover:border-[#2d2620] rounded transition-colors"
              title="Zoom in  ]  "
            >
              <ZoomIn size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Region toolbar — only when regions are enabled */}
      {enableRegions && !hideRegionToolbar && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#5a5142]">
            Drag on the waveform to mark a region
            {loopRegions && (
              <span className="ml-2 inline-flex items-center gap-1 text-[#E8D8B8]">
                <Repeat size={10} /> looping
              </span>
            )}
          </span>
          {regions.length > 0 && (
            <>
              <span className="text-[10px] font-mono text-[#6a5d4a] ml-2">
                {regions.length} region{regions.length === 1 ? '' : 's'}
              </span>
              <button
                onClick={clearRegions}
                className="ml-auto text-[10px] font-mono uppercase tracking-wider text-[#6a5d4a] hover:text-red-400 px-2 py-1 border border-[#1a160f] hover:border-red-400/40 rounded transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Pass-through volume hook for consumers that want to drive volume from
// outside chrome. Imported separately to keep the canvas API focused on
// the visual surface.
export function useVolumeOn(player: ReturnType<typeof useWaveSurfer>) {
  return { setVolume: player.setVolume };
}
