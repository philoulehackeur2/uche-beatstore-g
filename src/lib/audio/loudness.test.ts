import { describe, it, expect } from 'vitest';
import { normalizationGain, LOUDNESS_REFERENCE_DBFS } from './loudness';

describe('normalizationGain', () => {
  it('returns 1 for unknown loudness', () => {
    expect(normalizationGain(null)).toBe(1);
    expect(normalizationGain(undefined)).toBe(1);
    expect(normalizationGain(NaN)).toBe(1);
  });

  it('leaves tracks quieter than the reference at full volume (attenuate-only)', () => {
    // -18 is quieter than -12 reference → would need boost → clamped to 1
    expect(normalizationGain(-18)).toBe(1);
    expect(normalizationGain(LOUDNESS_REFERENCE_DBFS)).toBe(1);
  });

  it('attenuates tracks louder than the reference', () => {
    // -6 is 6 dB hotter than -12 → gain = 10^(-6/20) ≈ 0.501
    const g = normalizationGain(-6);
    expect(g).toBeGreaterThan(0.49);
    expect(g).toBeLessThan(0.51);
  });

  it('floors the gain so a pathologically hot value cannot mute the track', () => {
    expect(normalizationGain(-60)).toBeGreaterThanOrEqual(0.25);
  });

  it('never exceeds 1', () => {
    for (const l of [-30, -20, -12, -11, 0, 5]) {
      expect(normalizationGain(l)).toBeLessThanOrEqual(1);
    }
  });
});
