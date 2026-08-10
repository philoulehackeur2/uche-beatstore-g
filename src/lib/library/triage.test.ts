import { describe, expect, it } from 'vitest';
import {
  TRIAGE_STAGE_ORDER,
  filterByTriage,
  listedWithBlockers,
  summarizeTriage,
  triageBlockers,
  triageStage,
  type TriageStage,
  type TriageTrack,
} from './triage';

/** A beat that clears every gate but isn't on the storefront yet. */
function ready(over: Partial<TriageTrack> = {}): TriageTrack {
  return {
    bpm: 140,
    key: 'C',
    cover_url: 'https://cdn/x.jpg',
    lease_price_usd: 30,
    track_tags: [{ tag: 'Trap', category: 'genre' }],
    store_listed: false,
    ...over,
  };
}

describe('triageStage', () => {
  it('files a fully-prepared, unlisted beat as ready_to_list', () => {
    expect(triageStage(ready())).toBe('ready_to_list');
  });

  it('files a listed beat as listed', () => {
    expect(triageStage(ready({ store_listed: true }))).toBe('listed');
  });

  it('stops at the FIRST unmet gate, not the last', () => {
    // Missing analysis AND artwork AND price — analysis comes first.
    const track = ready({ bpm: null, key: null, cover_url: null, lease_price_usd: null });
    expect(triageStage(track)).toBe('needs_analysis');
  });

  it('treats a missing key as incomplete analysis even when bpm is set', () => {
    expect(triageStage(ready({ key: null }))).toBe('needs_analysis');
  });

  it('treats a missing bpm as incomplete analysis even when key is set', () => {
    expect(triageStage(ready({ bpm: null }))).toBe('needs_analysis');
  });

  it('walks the pipeline in order as each gate is cleared', () => {
    expect(triageStage(ready({ track_tags: [] }))).toBe('needs_tags');
    expect(triageStage(ready({ cover_url: null }))).toBe('needs_artwork');
    expect(triageStage(ready({ lease_price_usd: null }))).toBe('needs_price');
  });

  it('ignores tags in other categories when looking for a genre', () => {
    const track = ready({ track_tags: [{ tag: 'Dark', category: 'mood' }] });
    expect(triageStage(track)).toBe('needs_tags');
  });

  it('ignores blank genre tags', () => {
    const track = ready({ track_tags: [{ tag: '   ', category: 'genre' }] });
    expect(triageStage(track)).toBe('needs_tags');
  });

  it('can require a mood tag as well', () => {
    const genreOnly = ready();
    expect(triageStage(genreOnly, { requireMoodTag: true })).toBe('needs_tags');
    const both = ready({
      track_tags: [
        { tag: 'Trap', category: 'genre' },
        { tag: 'Dark', category: 'mood' },
      ],
    });
    expect(triageStage(both, { requireMoodTag: true })).toBe('ready_to_list');
  });

  it('does not misfile a free beat as needing a price', () => {
    // 0 is a deliberate price. Truthiness testing would break every free
    // download in the catalogue.
    expect(triageStage(ready({ lease_price_usd: 0 }))).toBe('ready_to_list');
  });

  it('counts an exclusive-only price as priced', () => {
    const track = ready({ lease_price_usd: null, exclusive_price_usd: 200 });
    expect(triageStage(track)).toBe('ready_to_list');
  });

  it('treats a producer default price as covering an unpriced beat', () => {
    const track = ready({ lease_price_usd: null, exclusive_price_usd: null });
    expect(triageStage(track)).toBe('needs_price');
    expect(triageStage(track, { hasDefaultPrice: true })).toBe('ready_to_list');
  });

  it('keeps a listed-but-incomplete beat in listed rather than hiding it in a to-do bucket', () => {
    const track = ready({ store_listed: true, cover_url: null, lease_price_usd: null });
    expect(triageStage(track)).toBe('listed');
    expect(triageBlockers(track)).toEqual(['artwork', 'price']);
  });
});

describe('triageBlockers', () => {
  it('returns every unmet gate in pipeline order', () => {
    const bare: TriageTrack = {};
    expect(triageBlockers(bare)).toEqual(['analysis', 'tags', 'artwork', 'price']);
  });

  it('returns nothing for a fully-prepared beat', () => {
    expect(triageBlockers(ready())).toEqual([]);
  });
});

describe('summarizeTriage', () => {
  it('always returns a count for every stage, including zeros', () => {
    const summary = summarizeTriage([]);
    expect(Object.keys(summary).sort()).toEqual([...TRIAGE_STAGE_ORDER].sort());
    expect(Object.values(summary).every((n) => n === 0)).toBe(true);
  });

  it('buckets a mixed catalogue', () => {
    const summary = summarizeTriage([
      ready(),
      ready(),
      ready({ store_listed: true }),
      ready({ bpm: null, key: null }),
      ready({ track_tags: [] }),
      ready({ cover_url: null }),
    ]);
    expect(summary).toEqual({
      needs_analysis: 1,
      needs_tags: 1,
      needs_artwork: 1,
      needs_price: 0,
      ready_to_list: 2,
      listed: 1,
    });
  });

  it('accounts for every track exactly once', () => {
    const tracks = [
      ready(),
      ready({ store_listed: true }),
      ready({ bpm: null }),
      {} as TriageTrack,
    ];
    const total = Object.values(summarizeTriage(tracks)).reduce((a, b) => a + b, 0);
    expect(total).toBe(tracks.length);
  });
});

describe('filterByTriage', () => {
  const tracks = [
    ready({ cover_url: null }),
    ready({ store_listed: true }),
    ready(),
  ];

  it('passes everything through on an empty selection', () => {
    expect(filterByTriage(tracks, new Set<TriageStage>())).toHaveLength(3);
  });

  it('does not return the original array reference on an empty selection', () => {
    // The library re-sorts the result in place downstream; handing back the
    // source array would mutate the fetched list.
    expect(filterByTriage(tracks, new Set<TriageStage>())).not.toBe(tracks);
  });

  it('filters to a single stage', () => {
    const out = filterByTriage(tracks, new Set<TriageStage>(['needs_artwork']));
    expect(out).toHaveLength(1);
    expect(out[0].cover_url).toBeNull();
  });

  it('filters to several stages at once', () => {
    const out = filterByTriage(tracks, new Set<TriageStage>(['listed', 'ready_to_list']));
    expect(out).toHaveLength(2);
  });
});

describe('listedWithBlockers', () => {
  it('surfaces only listed beats that still have gaps', () => {
    const broken = ready({ store_listed: true, cover_url: null });
    const out = listedWithBlockers([
      ready(),
      ready({ store_listed: true }),
      broken,
      ready({ cover_url: null }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].track).toBe(broken);
    expect(out[0].blockers).toEqual(['artwork']);
  });
});
