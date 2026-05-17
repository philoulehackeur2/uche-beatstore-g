/**
 * Convert a stored audio_url into a same-origin, CORS-safe URL the browser
 * can decode for WaveSurfer + play via <audio>. Local /uploads files are
 * already same-origin so they pass through unchanged.
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
