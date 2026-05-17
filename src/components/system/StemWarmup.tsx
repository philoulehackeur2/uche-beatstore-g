'use client';

import { useEffect } from 'react';

/**
 * Fires a single fire-and-forget request to /api/stems/health on app boot,
 * which proxies to the Demucs service. The service starts loading model
 * weights into memory the moment any endpoint is hit, so this lets the user's
 * first real stem split skip the ~30s cold-start.
 *
 * Renders nothing.
 */
export function StemWarmup() {
  useEffect(() => {
    // Defer slightly so we don't compete with critical-path requests.
    const t = setTimeout(() => {
      fetch('/api/stems/health', { cache: 'no-store' }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
