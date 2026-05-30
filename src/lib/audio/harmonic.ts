/**
 * Harmonic mixing — Camelot wheel adjacency for ordering beats into a
 * smooth, key-compatible continuous mix (the "DJ mode" store experience).
 *
 * The Camelot system maps every key to a clock position 1–12 plus A (minor)
 * or B (major). Two keys mix well when they're the same, ±1 on the wheel, or
 * the relative major/minor (same number, swap A/B). We score transitions and
 * greedily build a play order that keeps each hop compatible and the tempo
 * close — deterministic, zero cost.
 */

// Musical key (sharp + common flat spellings) → Camelot code.
const CAMELOT: Record<string, string> = {
  // Major (B)
  'B major': '1B', 'F# major': '2B', 'Gb major': '2B', 'C# major': '3B', 'Db major': '3B',
  'G# major': '4B', 'Ab major': '4B', 'D# major': '5B', 'Eb major': '5B', 'A# major': '6B', 'Bb major': '6B',
  'F major': '7B', 'C major': '8B', 'G major': '9B', 'D major': '10B', 'A major': '11B', 'E major': '12B',
  // Minor (A)
  'G# minor': '1A', 'Ab minor': '1A', 'D# minor': '2A', 'Eb minor': '2A', 'A# minor': '3A', 'Bb minor': '3A',
  'F minor': '4A', 'C minor': '5A', 'G minor': '6A', 'D minor': '7A', 'A minor': '8A', 'E minor': '9A',
  'B minor': '10A', 'F# minor': '11A', 'Gb minor': '11A', 'C# minor': '12A', 'Db minor': '12A',
};

export interface KeyedTrack {
  id: string;
  key?: string | null;
  scale?: string | null;
  bpm?: number | null;
}

/** Camelot code for a track, or null if its key is unknown/unmappable. */
export function camelotOf(t: KeyedTrack): string | null {
  if (!t.key) return null;
  const scale = t.scale === 'minor' ? 'minor' : 'major';
  return CAMELOT[`${t.key} ${scale}`] ?? null;
}

function parseCamelot(code: string): { num: number; letter: 'A' | 'B' } {
  return { num: parseInt(code, 10), letter: code.slice(-1) as 'A' | 'B' };
}

/** 0 = perfect (same key), higher = worse. >3 means not harmonically compatible. */
export function harmonicDistance(a: string | null, b: string | null): number {
  if (!a || !b) return 5; // unknown keys: treat as a weak transition
  if (a === b) return 0;
  const pa = parseCamelot(a), pb = parseCamelot(b);
  // Relative major/minor — same number, different letter.
  if (pa.num === pb.num && pa.letter !== pb.letter) return 1;
  // ±1 around the wheel, same letter (energy boost / drop).
  if (pa.letter === pb.letter) {
    const diff = Math.min(Math.abs(pa.num - pb.num), 12 - Math.abs(pa.num - pb.num));
    if (diff === 1) return 1;
    if (diff === 2) return 2;
    return 3 + diff; // far apart
  }
  return 4; // different letter and number — clashy
}

/**
 * Greedy harmonic ordering: start from `seed` (or the first track), then at
 * each step pick the unused track with the lowest combined harmonic + tempo
 * cost. Produces a continuous mix that flows by key and tempo.
 */
export function buildHarmonicOrder<T extends KeyedTrack>(tracks: T[], seedId?: string): T[] {
  if (tracks.length <= 2) return tracks;
  const pool = [...tracks];
  const startIdx = seedId ? Math.max(0, pool.findIndex((t) => t.id === seedId)) : 0;
  const order: T[] = [pool.splice(startIdx, 1)[0]];

  while (pool.length > 0) {
    const last = order[order.length - 1];
    const lastCam = camelotOf(last);
    let bestIdx = 0;
    let bestCost = Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      const harm = harmonicDistance(lastCam, camelotOf(cand));
      // Tempo cost: normalized BPM gap (and tolerant of half/double-time).
      let tempoCost = 0;
      if (last.bpm && cand.bpm) {
        const ratios = [Math.abs(last.bpm - cand.bpm), Math.abs(last.bpm - cand.bpm * 2), Math.abs(last.bpm - cand.bpm / 2)];
        tempoCost = Math.min(...ratios) / 20; // ~1 cost per 20 BPM gap
      }
      const cost = harm + tempoCost;
      if (cost < bestCost) { bestCost = cost; bestIdx = i; }
    }
    order.push(pool.splice(bestIdx, 1)[0]);
  }
  return order;
}
