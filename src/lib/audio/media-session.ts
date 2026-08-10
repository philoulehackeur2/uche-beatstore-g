/**
 * Media Session skip-button policy.
 *
 * iOS Safari renders exactly ONE pair of skip buttons in Now Playing (lock
 * screen, Control Center, CarPlay, AirPods stem). If `seekforward` /
 * `seekbackward` handlers are registered, iOS binds that pair to them and
 * shows ±15s/±30s arrows — even when `nexttrack` / `previoustrack` are ALSO
 * registered. The track-skip handlers are simply never reachable.
 *
 * That is why the lock screen could only move playback by 30 seconds: the
 * bridge registered both pairs, and seek silently won.
 *
 * To get Spotify-style track skipping you must explicitly clear the seek
 * handlers (`setActionHandler('seekforward', null)`), not merely omit them —
 * handlers persist on the global mediaSession until nulled, so a stale
 * registration from a previous track keeps overriding the new one.
 *
 * The scrubber is a separate action (`seekto`) and is unaffected; it stays
 * registered in both modes so dragging the OS progress bar still works.
 */
export type MediaSessionSkipMode = 'track' | 'seek';

/**
 * Which pair to bind to the OS skip buttons.
 *
 * With a real queue, track skipping is what the buttons are for. With a lone
 * track there is nowhere to skip to, so ±15s is the more useful binding — an
 * inert next/prev pair would just look broken.
 */
export function mediaSessionSkipMode(queueLength: number): MediaSessionSkipMode {
  return queueLength > 1 ? 'track' : 'seek';
}

/** Default jump for the seek-mode buttons, in seconds. */
export const MEDIA_SESSION_SEEK_OFFSET_SECONDS = 15;

/**
 * Clamp a seek to the 0..1 fraction the player store expects.
 * Guards the divide-by-zero when duration isn't known yet.
 */
export function seekFractionAfterOffset(
  progress: number,
  offsetSeconds: number,
  durationSeconds: number,
): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const next = progress + offsetSeconds / durationSeconds;
  return Math.max(0, Math.min(1, next));
}
