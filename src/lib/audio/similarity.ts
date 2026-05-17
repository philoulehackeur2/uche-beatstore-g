/**
 * Track similarity scoring.
 *
 * Producers don't think about tracks as feature vectors — they think
 * "find me another dark 140 BPM trap beat in F minor". This module
 * collapses that intuition into a single distance number we can sort by.
 *
 * The score is a *dissimilarity* in [0, ~3]: smaller = more similar. We
 * combine four signals, each weighted by how much it actually drives
 * "this sounds like that" judgments in practice:
 *
 *   1. BPM proximity      (weight 1.5) — half-time / double-time aware
 *   2. Key compatibility  (weight 1.0) — Camelot wheel neighbors are free
 *   3. Vibe vector        (weight 1.0) — energy/dance/valence/acousticness
 *   4. Type penalty       (weight 0.3) — instrumental vs song vs remix
 *
 * Tracks missing a signal contribute the *neutral* distance for that
 * signal (≈ 0.5) rather than 0 — otherwise feature-less tracks would
 * masquerade as perfect matches and crowd the top of every list.
 */

import type { Track } from '@/lib/types';

// ---------- Camelot wheel ---------------------------------------------------
//
// Standard mapping: e.g. C major = 8B, A minor = 8A. Tracks in the same slot
// or one step around the wheel mix harmonically. We cache the int code for
// every (key, scale) we see so the comparison is just modular arithmetic.

const CAMELOT_MAJOR: Record<string, number> = {
  'C': 8, 'C#': 3, 'Db': 3, 'D': 10, 'D#': 5, 'Eb': 5, 'E': 12, 'F': 7,
  'F#': 2, 'Gb': 2, 'G': 9, 'G#': 4, 'Ab': 4, 'A': 11, 'A#': 6, 'Bb': 6, 'B': 1,
};
const CAMELOT_MINOR: Record<string, number> = {
  'C': 5, 'C#': 12, 'Db': 12, 'D': 7, 'D#': 2, 'Eb': 2, 'E': 9, 'F': 4,
  'F#': 11, 'Gb': 11, 'G': 6, 'G#': 1, 'Ab': 1, 'A': 8, 'A#': 3, 'Bb': 3, 'B': 10,
};

interface CamelotCode {
  num: number;   // 1..12 around the wheel
  isMajor: boolean;
}

function toCamelot(key: string | null | undefined, scale: string | null | undefined): CamelotCode | null {
  if (!key) return null;
  const k = key.trim();
  const isMajor = (scale ?? 'major').toLowerCase().startsWith('maj');
  const table = isMajor ? CAMELOT_MAJOR : CAMELOT_MINOR;
  const num = table[k];
  if (num == null) return null;
  return { num, isMajor };
}

/** Return key-distance in [0, 1]: 0 = identical, ~1 = far apart on wheel. */
function keyDistance(a: CamelotCode | null, b: CamelotCode | null): number {
  if (!a || !b) return 0.5; // unknown → neutral
  // Wheel distance: 0..6 (12 positions, wraps).
  const raw = Math.abs(a.num - b.num);
  const wheel = Math.min(raw, 12 - raw); // 0..6
  // Same number, different mode (relative key) is harmonically close.
  const modePenalty = a.isMajor === b.isMajor ? 0 : 0.15;
  // Normalize: same slot = 0, ±1 ≈ 0.17, opposite ≈ 1.
  return Math.min(1, wheel / 6 + modePenalty);
}

// ---------- BPM ------------------------------------------------------------

/**
 * BPM distance with double/half-time awareness.
 *
 * A 70 BPM lo-fi beat and a 140 BPM trap beat often share the same groove
 * skeleton — DJs treat them as compatible. We compute the smaller of the
 * direct, doubled, and halved deltas so 70↔140 collapses to "very close".
 *
 * Returned as a normalized [0, 1] where 0 = within 2 BPM, 1 = >40 BPM apart.
 */
function bpmDistance(a: number | null | undefined, b: number | null | undefined): number {
  if (!a || !b) return 0.5;
  const candidates = [Math.abs(a - b), Math.abs(a * 2 - b), Math.abs(a - b * 2)];
  const delta = Math.min(...candidates);
  if (delta <= 2) return 0;
  if (delta >= 40) return 1;
  return (delta - 2) / 38;
}

// ---------- Vibe vector ----------------------------------------------------

const VIBE_DIMS = ['energy', 'danceability', 'valence', 'acousticness'] as const;

function vibeDistance(a: Track, b: Track): number {
  let sumSq = 0;
  let n = 0;
  for (const dim of VIBE_DIMS) {
    const va = a[dim];
    const vb = b[dim];
    if (va == null || vb == null) {
      // Missing dim contributes neutral 0.25^2 — same as "half a stddev apart".
      sumSq += 0.0625;
    } else {
      const d = va - vb;
      sumSq += d * d;
    }
    n++;
  }
  // RMS over dims, already in [0, 1] since each input is [0, 1].
  return Math.sqrt(sumSq / n);
}

// ---------- Type penalty ---------------------------------------------------

function typeDistance(a: Track, b: Track): number {
  if (a.type === b.type) return 0;
  // Instrumental ↔ song is closer than instrumental ↔ remix.
  return 1;
}

// ---------- Public API -----------------------------------------------------

export interface SimilarTrack {
  track: Track;
  /** Lower is more similar. Roughly [0, 3]. */
  distance: number;
  /** Per-signal breakdown — useful for explaining "why" in tooltips. */
  breakdown: {
    bpm: number;
    key: number;
    vibe: number;
    type: number;
  };
}

const W_BPM = 1.5;
const W_KEY = 1.0;
const W_VIBE = 1.0;
const W_TYPE = 0.3;

export function scoreSimilarity(target: Track, candidate: Track): SimilarTrack {
  const bpm = bpmDistance(target.bpm, candidate.bpm);
  const key = keyDistance(
    toCamelot(target.key, target.scale),
    toCamelot(candidate.key, candidate.scale),
  );
  const vibe = vibeDistance(target, candidate);
  const type = typeDistance(target, candidate);
  const distance = bpm * W_BPM + key * W_KEY + vibe * W_VIBE + type * W_TYPE;
  return { track: candidate, distance, breakdown: { bpm, key, vibe, type } };
}

/**
 * Rank a candidate pool against a target track. Filters out the target
 * itself. Returns up to `limit` matches sorted ascending by distance.
 */
export function findSimilar(target: Track, pool: Track[], limit = 5): SimilarTrack[] {
  return pool
    .filter((t) => t.id !== target.id)
    .map((t) => scoreSimilarity(target, t))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
