/**
 * Map analyzed audio features to tag suggestions.
 *
 * The library already computes BPM, key/scale, energy, danceability, valence,
 * acousticness on every upload (see lib/audio/merge.ts). Until now those
 * numbers were inert — visible in the drawer but not actionable. This module
 * turns them into one-click tag suggestions drawn from the existing taxonomy
 * (lib/types/tags.ts), so the producer doesn't have to re-decide what they
 * already know is true about each track.
 *
 * Design notes:
 *  - Suggestions are HINTS, not auto-applied. The user clicks to accept.
 *  - Confidence is reported per-suggestion so the UI can sort by it.
 *  - All thresholds live here in named constants so a future learning pass
 *    (per-user calibration) can swap the heuristics without touching callers.
 *  - We never invent a tag that isn't in TAG_TAXONOMY — surfacing "Custom"
 *    suggestions would make the system feel random; staying inside the
 *    taxonomy keeps tag counts useful for filtering later.
 */
import { TAG_TAXONOMY, type TagCategory } from '@/lib/types/tags';

export interface TrackFeatures {
  bpm?: number | null;
  key?: string | null;
  scale?: string | null;
  energy?: number | null;        // 0..1
  danceability?: number | null;  // 0..1
  valence?: number | null;       // 0..1 (positivity)
  acousticness?: number | null;  // 0..1
  loudness?: number | null;      // dB (LUFS-ish, negative)
}

export interface TagSuggestion {
  tag: string;
  category: TagCategory;
  /** 0..1 — how confident the heuristic is. UI can sort or filter on this. */
  confidence: number;
  /** Short human reason, e.g. "BPM 142 + high energy". Shown on hover. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Threshold constants — named so the intent is legible and tuning is local.
// ---------------------------------------------------------------------------

const HIGH_ENERGY = 0.7;
const LOW_ENERGY = 0.35;
const HIGH_DANCE = 0.7;
const HIGH_VALENCE = 0.65;     // bright / positive
const LOW_VALENCE = 0.35;      // dark / sad
const HIGH_ACOUSTIC = 0.6;

/** A tag we already KNOW is in the taxonomy, narrowed to its category. */
function known(category: TagCategory, tag: string) {
  return (TAG_TAXONOMY[category] as readonly string[]).includes(tag);
}

// ---------------------------------------------------------------------------
// Genre suggestions from BPM ranges. Ranges overlap deliberately — Trap and
// Drill share a tempo neighborhood, and we want to surface BOTH so the user
// picks. Confidence dips at the edges.
// ---------------------------------------------------------------------------

interface BpmRange {
  tag: string;
  category: TagCategory;
  min: number;
  max: number;
  /** BPM where confidence is highest; falloff is linear toward edges. */
  ideal: number;
}

const BPM_GENRES: BpmRange[] = [
  // Lo-fi / ambient — slow head-nod tempos
  { tag: 'Lo-fi',     category: 'genre', min: 60,  max: 90,  ideal: 75 },
  // Classic R&B / Hip-hop — half-time feel
  { tag: 'R&B',       category: 'genre', min: 70,  max: 100, ideal: 85 },
  { tag: 'Hip-hop',   category: 'genre', min: 80,  max: 100, ideal: 90 },
  // Pluggnb sits where Hip-hop meets melodic Trap
  { tag: 'Pluggnb',   category: 'genre', min: 130, max: 165, ideal: 150 },
  // Trap — the meat of modern hip-hop production
  { tag: 'Trap',      category: 'genre', min: 130, max: 160, ideal: 145 },
  // Drill — slightly faster, tighter
  { tag: 'Drill',     category: 'genre', min: 138, max: 150, ideal: 144 },
  // UK Drill — distinctly faster than US drill
  { tag: 'UK Drill',  category: 'genre', min: 138, max: 145, ideal: 142 },
  // Jersey Club — fast, bouncy
  { tag: 'Jersey Club', category: 'genre', min: 130, max: 145, ideal: 138 },
  // Afrobeats — mid-tempo with swing
  { tag: 'Afrobeats', category: 'genre', min: 100, max: 118, ideal: 110 },
  // Amapiano — log drum tempo
  { tag: 'Amapiano',  category: 'genre', min: 110, max: 118, ideal: 113 },
  // Dancehall — riddim tempo
  { tag: 'Dancehall', category: 'genre', min: 95,  max: 110, ideal: 100 },
  // Pop — broad but anchored around radio tempo
  { tag: 'Pop',       category: 'genre', min: 100, max: 130, ideal: 118 },
];

function bpmConfidence(bpm: number, range: BpmRange): number {
  if (bpm < range.min || bpm > range.max) return 0;
  const halfWidth = Math.max(range.ideal - range.min, range.max - range.ideal);
  const distance = Math.abs(bpm - range.ideal);
  // Linear falloff from 1.0 at ideal to 0.5 at the range edge.
  return Math.max(0.5, 1 - (distance / halfWidth) * 0.5);
}

// ---------------------------------------------------------------------------
// Mood suggestions from the energy/valence/danceability triangle.
// These map directly into TAG_TAXONOMY.mood.
// ---------------------------------------------------------------------------

interface MoodRule {
  tag: string;
  test: (f: TrackFeatures) => { match: boolean; confidence: number; reason: string };
}

const MOOD_RULES: MoodRule[] = [
  {
    tag: 'Hype',
    test: (f) => {
      const hasSignal = f.energy != null && f.danceability != null;
      const match = hasSignal && f.energy! > HIGH_ENERGY && f.danceability! > HIGH_DANCE;
      return {
        match: !!match,
        confidence: match ? Math.min(f.energy!, f.danceability!) : 0,
        reason: `high energy (${pct(f.energy)}) + danceable (${pct(f.danceability)})`,
      };
    },
  },
  {
    tag: 'Aggressive',
    test: (f) => {
      const match = f.energy != null && f.valence != null && f.energy > HIGH_ENERGY && f.valence < LOW_VALENCE;
      return {
        match: !!match,
        confidence: match ? (f.energy! + (1 - f.valence!)) / 2 : 0,
        reason: `high energy (${pct(f.energy)}), low valence (${pct(f.valence)})`,
      };
    },
  },
  {
    tag: 'Dark',
    test: (f) => {
      // Dark != aggressive — moody but not necessarily loud. Mid energy + low valence.
      const match = f.valence != null && f.valence < LOW_VALENCE && (f.energy ?? 0.5) <= HIGH_ENERGY;
      return {
        match: !!match,
        confidence: match ? 1 - f.valence! : 0,
        reason: `low valence (${pct(f.valence)}) without overdrive`,
      };
    },
  },
  {
    tag: 'Emotional',
    test: (f) => {
      // Slow, low-energy, low-valence — ballad / sad territory.
      const match = f.energy != null && f.valence != null && f.energy < LOW_ENERGY && f.valence < HIGH_VALENCE;
      return {
        match: !!match,
        confidence: match ? (1 - f.energy!) * (1 - Math.abs(0.5 - f.valence!)) : 0,
        reason: `low energy (${pct(f.energy)}) + introspective valence`,
      };
    },
  },
  {
    tag: 'Melodic',
    test: (f) => {
      // High valence with at least mid energy — bright melody.
      const match = f.valence != null && f.valence > HIGH_VALENCE && (f.energy ?? 0.5) >= LOW_ENERGY;
      return {
        match: !!match,
        confidence: match ? f.valence! : 0,
        reason: `bright valence (${pct(f.valence)})`,
      };
    },
  },
  {
    tag: 'Chill',
    test: (f) => {
      const match = f.energy != null && f.energy < LOW_ENERGY && (f.acousticness ?? 0) < 0.9;
      return {
        match: !!match,
        confidence: match ? 1 - f.energy! : 0,
        reason: `low energy (${pct(f.energy)})`,
      };
    },
  },
  {
    tag: 'Cinematic',
    test: (f) => {
      // Very dynamic + acoustic-leaning. Acoustic flag often picks up real
      // strings / piano, which is the marker of cinematic production.
      const match = f.acousticness != null && f.acousticness > HIGH_ACOUSTIC && (f.energy ?? 0) > 0.4;
      return {
        match: !!match,
        confidence: match ? f.acousticness! : 0,
        reason: `acoustic-forward (${pct(f.acousticness)}) with movement`,
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute tag suggestions for a track. Returns at most `limit` results,
 * sorted by confidence descending. Suggestions already applied to the
 * track are filtered out.
 */
export function suggestTags(
  features: TrackFeatures,
  appliedTags: readonly string[] = [],
  limit = 6,
): TagSuggestion[] {
  const applied = new Set(appliedTags);
  const out: TagSuggestion[] = [];

  // Genre by BPM
  if (features.bpm != null && features.bpm > 0) {
    for (const range of BPM_GENRES) {
      const c = bpmConfidence(features.bpm, range);
      if (c > 0 && known(range.category, range.tag) && !applied.has(range.tag)) {
        out.push({
          tag: range.tag,
          category: range.category,
          confidence: c,
          reason: `BPM ${Math.round(features.bpm)} fits ${range.tag} range (${range.min}–${range.max})`,
        });
      }
    }
  }

  // Mood from feature ratios
  for (const rule of MOOD_RULES) {
    const r = rule.test(features);
    if (r.match && known('mood', rule.tag) && !applied.has(rule.tag)) {
      out.push({
        tag: rule.tag,
        category: 'mood',
        confidence: r.confidence,
        reason: r.reason,
      });
    }
  }

  // Sort by confidence desc, drop near-zero noise, cap.
  return out
    .filter((s) => s.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

function pct(v: number | null | undefined): string {
  if (v == null) return '?';
  return `${Math.round(v * 100)}%`;
}
