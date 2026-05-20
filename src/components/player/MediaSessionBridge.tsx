'use client';

import { useEffect } from 'react';
import { usePlayer } from '@/hooks/usePlayer';

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

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play',          () => setPlaying(true)],
      ['pause',         () => setPlaying(false)],
      ['stop',          () => setPlaying(false)],
      ['nexttrack',     () => next()],
      ['previoustrack', () => prev()],
      ['togglemicrophone' as MediaSessionAction, () => togglePlay()],
    ];

    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Not all actions are supported on every browser; ignore.
      }
    }

    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
    };
  }, [togglePlay, next, prev, setPlaying]);

  return null;
}
