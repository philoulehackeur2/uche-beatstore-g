'use client';

import { useEffect, useState } from 'react';
import { getOfflineSrc } from '@/lib/offline/audio-cache';
import { audioSrc } from '@/lib/audio/url';

/**
 * Resolves a track's playable URL, preferring an IndexedDB-cached blob URL
 * when one exists (offline-first). Falls back to the network proxy URL.
 */
export function useResolvedAudioSrc(trackId: string | null | undefined, rawUrl: string | null | undefined) {
  const [resolved, setResolved] = useState<string>(audioSrc(rawUrl));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!trackId) {
        setResolved(audioSrc(rawUrl));
        return;
      }
      try {
        const off = await getOfflineSrc(trackId);
        if (cancelled) return;
        setResolved(off || audioSrc(rawUrl));
      } catch {
        if (!cancelled) setResolved(audioSrc(rawUrl));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, rawUrl]);

  return resolved;
}
