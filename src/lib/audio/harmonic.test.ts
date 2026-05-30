import { describe, it, expect } from 'vitest';
import { camelotOf, harmonicDistance, buildHarmonicOrder } from './harmonic';

describe('camelotOf', () => {
  it('maps major + minor keys to Camelot codes', () => {
    expect(camelotOf({ id: '1', key: 'C', scale: 'major' })).toBe('8B');
    expect(camelotOf({ id: '2', key: 'A', scale: 'minor' })).toBe('8A');
    expect(camelotOf({ id: '3', key: 'Eb', scale: 'minor' })).toBe('2A');
  });
  it('returns null for unknown keys', () => {
    expect(camelotOf({ id: '4', key: null })).toBeNull();
    expect(camelotOf({ id: '5', key: 'H', scale: 'major' })).toBeNull();
  });
});

describe('harmonicDistance', () => {
  it('is 0 for identical keys', () => {
    expect(harmonicDistance('8A', '8A')).toBe(0);
  });
  it('is 1 for relative major/minor', () => {
    expect(harmonicDistance('8A', '8B')).toBe(1); // Am ↔ C
  });
  it('is 1 for ±1 on the wheel, same letter', () => {
    expect(harmonicDistance('8A', '9A')).toBe(1);
    expect(harmonicDistance('8A', '7A')).toBe(1);
  });
  it('wraps around 12→1', () => {
    expect(harmonicDistance('12A', '1A')).toBe(1);
  });
  it('penalizes unknown keys but does not crash', () => {
    expect(harmonicDistance(null, '8A')).toBeGreaterThan(0);
  });
});

describe('buildHarmonicOrder', () => {
  it('keeps short lists unchanged', () => {
    const t = [{ id: 'a' }, { id: 'b' }];
    expect(buildHarmonicOrder(t)).toHaveLength(2);
  });
  it('orders so each hop is harmonically reasonable', () => {
    const tracks = [
      { id: 'a', key: 'C', scale: 'major', bpm: 140 }, // 8B
      { id: 'b', key: 'A', scale: 'minor', bpm: 140 }, // 8A (relative)
      { id: 'c', key: 'F#', scale: 'major', bpm: 90 }, // 2B (far)
    ];
    const order = buildHarmonicOrder(tracks, 'a');
    expect(order[0].id).toBe('a');
    // The relative-minor 'b' should come before the distant 'c'.
    expect(order[1].id).toBe('b');
    expect(order).toHaveLength(3);
  });
});
