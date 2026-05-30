/**
 * Playback loudness normalization — the "every track plays at a consistent
 * volume" behavior Spotify/Apple Music use.
 *
 * Our `tracks.loudness` is RMS dBFS (negative; see analyze.server.ts —
 * `20 * log10(rms)`). A hot modern master sits around -9 to -11 dBFS; a
 * quiet/unmastered beat around -16 to -20.
 *
 * The HTML/WaveSurfer volume API clamps to [0, 1], so we can only ATTENUATE,
 * never boost. That's the safe direction anyway (boosting risks clipping +
 * amplifying noise floor). We bring tracks louder than the reference DOWN to
 * match it, and leave quieter tracks at full — net effect is consistent
 * perceived loudness with zero clipping.
 *
 *   gain = min(1, 10^((reference - loudness) / 20))
 *
 * reference = -12 dBFS: roughly where a loud beat master sits, so only the
 * hottest tracks get pulled down and the catalogue lands in one volume band.
 */

export const LOUDNESS_REFERENCE_DBFS = -12;

/**
 * Returns a playback gain multiplier in (0, 1] for a track's loudness.
 * Unknown / non-finite loudness → 1 (no change).
 */
export function normalizationGain(
  loudness: number | null | undefined,
  reference = LOUDNESS_REFERENCE_DBFS,
): number {
  if (loudness == null || !Number.isFinite(loudness)) return 1;
  // Only attenuate (loudness above reference → gain < 1). Floor at 0.25 so a
  // pathologically-hot value can't mute the track entirely.
  const gain = Math.pow(10, (reference - loudness) / 20);
  return Math.max(0.25, Math.min(1, gain));
}
