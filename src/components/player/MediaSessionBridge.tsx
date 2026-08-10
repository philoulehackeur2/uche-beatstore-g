'use client';

import { useEffect } from 'react';
import { usePlayer } from '@/hooks/usePlayer';
import {
  MEDIA_SESSION_SEEK_OFFSET_SECONDS,
  mediaSessionSkipMode,
  seekFractionAfterOffset,
} from '@/lib/audio/media-session';

/**
 * Bridges the Zustand player store to the browser's Media Session API
 * so iOS lock screen / Dynamic Island / Android notification show the
 * current track's title + cover, and hardware play/pause/next/prev
 * buttons drive the same store.
 *
 * Mount once at the dashboard root — no UI, side-effects only.
 *
 * iOS Safari quirks worth knowing:
 *  - MediaMetadata.artwork must be HTTPS in production or it's silently ignored
 *  - title falls back to "Untitled" so the lock screen never reads a category
 *    label ("instrumental", "song") that came from `track.type`
 */
export function MediaSessionBridge() {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  const setPlaying = usePlayer((s) => s.setPlaying);
  const progress = usePlayer((s) => s.progress);
  const seekTo = usePlayer((s) => s.seekTo);
  // Subscribe to the length, not the array — a queue reorder shouldn't tear
  // down and rebuild every action handler.
  const queueLength = usePlayer((s) => s.queue.length);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }

    const artwork = currentTrack.cover_url
      ? [
          { src: currentTrack.cover_url, sizes: '96x96',   type: 'image/jpeg' },
          { src: currentTrack.cover_url, sizes: '192x192', type: 'image/jpeg' },
          { src: currentTrack.cover_url, sizes: '512x512', type: 'image/jpeg' },
        ]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Untitled',
      artist: 'U2C Beatstore',
      album: currentTrack.type ? currentTrack.type.charAt(0).toUpperCase() + currentTrack.type.slice(1) : '',
      artwork,
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  // Position state — drives the OS-level scrubber (lock screen, macOS Now
  // Playing widget, Bluetooth displays). Updated as progress advances so
  // the scrubber tracks playback and the elapsed/remaining times are right.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const dur = currentTrack?.duration_seconds || 0;
    if (!currentTrack || dur <= 0 || typeof navigator.mediaSession.setPositionState !== 'function') return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        position: Math.max(0, Math.min(dur, progress * dur)),
        playbackRate: 1,
      });
    } catch {
      // Some browsers throw if position > duration mid-transition; ignore.
    }
  }, [currentTrack, progress]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const dur = () => usePlayer.getState().currentTrack?.duration_seconds || 0;
    const seekBy = (offset: number) => {
      const fraction = seekFractionAfterOffset(
        usePlayer.getState().progress,
        offset,
        dur(),
      );
      if (fraction != null) seekTo(fraction);
    };

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play',  () => setPlaying(true)],
      ['pause', () => setPlaying(false)],
      ['stop',  () => setPlaying(false)],
      // OS scrubber drag → seek to absolute time. Independent of the skip
      // buttons below, so it stays available in both modes.
      ['seekto', (d: MediaSessionActionDetails) => {
        const t = dur();
        if (t > 0 && typeof d.seekTime === 'number') seekTo(d.seekTime / t);
      }],
    ];

    // Bind the OS skip-button pair to ONE of track-skip or seek — never both.
    // See lib/audio/media-session for why registering both silently loses the
    // track buttons on iOS.
    const skipMode = mediaSessionSkipMode(queueLength);
    if (skipMode === 'track') {
      handlers.push(['nexttrack', () => next()], ['previoustrack', () => prev()]);
    } else {
      handlers.push(
        ['seekforward',  (d: MediaSessionActionDetails) =>
          seekBy(d.seekOffset ?? MEDIA_SESSION_SEEK_OFFSET_SECONDS)],
        ['seekbackward', (d: MediaSessionActionDetails) =>
          seekBy(-(d.seekOffset ?? MEDIA_SESSION_SEEK_OFFSET_SECONDS))],
      );
    }

    // Actions we are NOT binding this pass must be actively cleared. Handlers
    // live on the global mediaSession object, so a registration left over from
    // a previous queue length would keep overriding the current mode.
    const unused: MediaSessionAction[] = skipMode === 'track'
      ? ['seekforward', 'seekbackward']
      : ['nexttrack', 'previoustrack'];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not all actions are supported on every browser; ignore.
      }
    }
    for (const action of unused) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }

    return () => {
      for (const action of [...handlers.map(([a]) => a), ...unused]) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [togglePlay, next, prev, setPlaying, seekTo, queueLength]);

  return null;
}
