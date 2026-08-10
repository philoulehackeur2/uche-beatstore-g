/**
 * Triage state — where each beat sits in the produce → sell pipeline.
 *
 * At 100 beats the producer remembers what's done. At 600 they don't, and the
 * useful question stops being "find a beat" and becomes "what haven't I
 * finished yet". This module answers that.
 *
 * Everything here is DERIVED from columns that already exist — no migration,
 * no status column to keep in sync, and it classifies the whole back catalogue
 * retroactively the moment it ships. A stored status would need backfilling and
 * would drift the first time someone edits a track outside the UI that sets it.
 *
 * Pure by design: this is exactly the "logic inside React components can't be
 * tested in isolation and gets silently reverted" case CLAUDE.md warns about.
 */

export type TriageBlocker = 'analysis' | 'tags' | 'artwork' | 'price';

export type TriageStage =
  | 'needs_analysis'
  | 'needs_tags'
  | 'needs_artwork'
  | 'needs_price'
  | 'ready_to_list'
  | 'listed';

/** Pipeline order. A beat sits at the FIRST gate it fails. */
export const TRIAGE_BLOCKER_ORDER: readonly TriageBlocker[] = [
  'analysis',
  'tags',
  'artwork',
  'price',
] as const;

export const TRIAGE_STAGE_ORDER: readonly TriageStage[] = [
  'needs_analysis',
  'needs_tags',
  'needs_artwork',
  'needs_price',
  'ready_to_list',
  'listed',
] as const;

export const TRIAGE_STAGE_LABELS: Record<TriageStage, string> = {
  needs_analysis: 'Needs analysis',
  needs_tags: 'Needs tags',
  needs_artwork: 'Needs artwork',
  needs_price: 'Needs price',
  ready_to_list: 'Ready to list',
  listed: 'Listed',
};

const BLOCKER_TO_STAGE: Record<TriageBlocker, TriageStage> = {
  analysis: 'needs_analysis',
  tags: 'needs_tags',
  artwork: 'needs_artwork',
  price: 'needs_price',
};

export interface TriageTag {
  tag: string;
  category?: string | null;
}

/**
 * Structural input — deliberately looser than `Track` so this works with the
 * library's inline-tag rows, the lean list payload, and test fixtures alike.
 */
export interface TriageTrack {
  bpm?: number | null;
  key?: string | null;
  cover_url?: string | null;
  store_listed?: boolean | null;
  lease_price_usd?: number | null;
  exclusive_price_usd?: number | null;
  track_tags?: TriageTag[] | null;
}

export interface TriageOptions {
  /**
   * The producer has a default lease/exclusive price on their
   * `creator_profiles` row. The storefront falls back to it, so a beat with no
   * per-track override is still sellable and must NOT read as "needs price".
   */
  hasDefaultPrice?: boolean;
  /** Require a mood tag as well as a genre tag. Default: genre only. */
  requireMoodTag?: boolean;
}

function hasTagInCategory(track: TriageTrack, category: string): boolean {
  return (track.track_tags ?? []).some(
    (t) => t.category === category && typeof t.tag === 'string' && t.tag.trim() !== '',
  );
}

function hasPrice(track: TriageTrack, options: TriageOptions): boolean {
  if (options.hasDefaultPrice) return true;
  // 0 is a real price (a free beat is intentionally priced), so test for null
  // rather than truthiness — `!0` would misfile every free download.
  return track.lease_price_usd != null || track.exclusive_price_usd != null;
}

/**
 * Every unmet gate, in pipeline order. A listed beat can still have blockers —
 * that's the "listed but broken" case the store-editor's attention panel shows.
 */
export function triageBlockers(track: TriageTrack, options: TriageOptions = {}): TriageBlocker[] {
  const blockers: TriageBlocker[] = [];
  // BPM and key both come from the same Essentia pass; either one missing
  // means the analysis didn't complete or hasn't run.
  if (track.bpm == null || !track.key) blockers.push('analysis');
  if (!hasTagInCategory(track, 'genre')) blockers.push('tags');
  else if (options.requireMoodTag && !hasTagInCategory(track, 'mood')) blockers.push('tags');
  if (!track.cover_url) blockers.push('artwork');
  if (!hasPrice(track, options)) blockers.push('price');
  return blockers;
}

/**
 * The single stage a beat occupies.
 *
 * `store_listed` wins outright: a listed beat reads as "listed" even when it
 * still has blockers, because it IS on the storefront and mis-filing it as
 * "needs artwork" would hide a live sales problem behind a to-do label. Use
 * `triageBlockers` alongside the stage to surface those.
 */
export function triageStage(track: TriageTrack, options: TriageOptions = {}): TriageStage {
  if (track.store_listed) return 'listed';
  const blockers = triageBlockers(track, options);
  const first = TRIAGE_BLOCKER_ORDER.find((b) => blockers.includes(b));
  return first ? BLOCKER_TO_STAGE[first] : 'ready_to_list';
}

export type TriageSummary = Record<TriageStage, number>;

/** Counts per stage — drives the facet chips. Always returns every key. */
export function summarizeTriage(
  tracks: readonly TriageTrack[],
  options: TriageOptions = {},
): TriageSummary {
  const summary = Object.fromEntries(
    TRIAGE_STAGE_ORDER.map((stage) => [stage, 0]),
  ) as TriageSummary;
  for (const track of tracks) summary[triageStage(track, options)] += 1;
  return summary;
}

/**
 * Filter to the selected stages. An empty selection means "no triage filter"
 * and passes everything through — matching how the library's other facets
 * treat an empty Set.
 */
export function filterByTriage<T extends TriageTrack>(
  tracks: readonly T[],
  stages: ReadonlySet<TriageStage>,
  options: TriageOptions = {},
): T[] {
  if (stages.size === 0) return [...tracks];
  return tracks.filter((track) => stages.has(triageStage(track, options)));
}

/**
 * Listed beats that still have blockers — the ones actively costing sales.
 * This is the library-side counterpart to the store-editor attention panel.
 */
export function listedWithBlockers<T extends TriageTrack>(
  tracks: readonly T[],
  options: TriageOptions = {},
): { track: T; blockers: TriageBlocker[] }[] {
  const out: { track: T; blockers: TriageBlocker[] }[] = [];
  for (const track of tracks) {
    if (!track.store_listed) continue;
    const blockers = triageBlockers(track, options);
    if (blockers.length > 0) out.push({ track, blockers });
  }
  return out;
}
