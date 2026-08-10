/**
 * Convert a stored audio_url into a same-origin, CORS-safe URL the browser
 * can decode for WaveSurfer + play via <audio>. Local /uploads files are
 * already same-origin so they pass through unchanged.
 *
 * DASHBOARD ONLY. `/api/audio` requires an authenticated Supabase session and
 * answers 401 to everyone else — see `publicAudioSrc` for share/store surfaces.
 */
export function audioSrc(url: string | null | undefined): string {
  if (!url) return '';
  // Already same-origin (relative path or local /uploads)
  if (url.startsWith('/')) return url;
  // Already proxied
  if (url.startsWith('/api/audio')) return url;
  // Wrap external URLs in our proxy
  return `/api/audio?src=${encodeURIComponent(url)}`;
}

/**
 * Media URL resolver for PUBLIC surfaces (share links, storefront) — pages
 * whose whole audience is signed out.
 *
 * The share APIs already hand back a URL an anonymous visitor can fetch:
 * either a token-scoped, HMAC-signed `/api/share/<token>/{preview,peaks}/…`
 * path, or the public R2/CDN preview clip. Re-wrapping those in `audioSrc()`
 * is what broke share links in production: the public-clip case became
 * `/api/audio?src=https://…`, and `/api/audio` 401s without a session, so the
 * waveform failed to decode and playback fell back (or died) — while tracks
 * with no generated `preview_url` kept working, because their signed relative
 * path starts with `/` and passed through untouched. That split is exactly the
 * "waveform sometimes doesn't appear / linked songs don't play" report.
 *
 * So: pass the resolved URL through, and defensively unwrap a legacy
 * `/api/audio?src=` wrapper when the inner source is itself publicly
 * fetchable. A private `r2://` ref is NOT publicly fetchable, so it keeps the
 * proxy — a public page should never have been handed one in the first place,
 * and silently unwrapping it would leak the private reference.
 */
export function publicAudioSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('/api/audio')) {
    try {
      const inner = new URL(url, 'http://x').searchParams.get('src');
      if (inner && !inner.startsWith('r2://')) return inner;
    } catch {
      /* malformed — fall through and return as-is */
    }
  }
  return url;
}
