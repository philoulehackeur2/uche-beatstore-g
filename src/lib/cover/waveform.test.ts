import { describe, expect, it } from 'vitest';
import {
  barRect, barSlots, buildWaveformSeries, capRadius, circularSegments, isBarMode,
  normalizeSeries, pointsAttribute, resamplePeaks, smoothSeries, suggestedBarCount,
  waveformPathPoints,
} from './waveform';

describe('resamplePeaks', () => {
  it('keeps a transient that interpolation would have averaged away', () => {
    // One loud sample in twenty. Downsampled to four buckets, the bucket
    // holding it must still read full height.
    const peaks = new Array(20).fill(0.1);
    peaks[6] = 1;
    expect(Math.max(...resamplePeaks(peaks, 4))).toBe(1);
  });

  it('returns exactly the requested number of values', () => {
    expect(resamplePeaks(new Array(500).fill(0.5), 128)).toHaveLength(128);
  });

  it('upsamples without producing gaps', () => {
    const out = resamplePeaks([0.2, 0.8], 10);
    expect(out).toHaveLength(10);
    expect(out.every((value) => value > 0)).toBe(true);
  });

  it('takes the absolute value of negative samples', () => {
    expect(resamplePeaks([-1, -1, -1, -1], 2)).toEqual([1, 1]);
  });

  it('handles an empty source by returning silence', () => {
    expect(resamplePeaks([], 3)).toEqual([0, 0, 0]);
  });

  it('returns nothing for a zero count', () => {
    expect(resamplePeaks([1, 2, 3], 0)).toEqual([]);
  });

  it('spreads a single sample across every bucket', () => {
    expect(resamplePeaks([0.7], 3)).toEqual([0.7, 0.7, 0.7]);
  });
});

describe('smoothSeries', () => {
  it('leaves the series untouched at zero', () => {
    const values = [0, 1, 0, 1, 0];
    expect(smoothSeries(values, 0)).toEqual(values);
  });

  it('reduces the spread between neighbours', () => {
    const spiky = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const smoothed = smoothSeries(spiky, 1);
    const range = Math.max(...smoothed) - Math.min(...smoothed);
    expect(range).toBeLessThan(1);
  });

  it('keeps the same length and never returns NaN', () => {
    const smoothed = smoothSeries([0.1, 0.9, 0.4, 0.6], 0.5);
    expect(smoothed).toHaveLength(4);
    expect(smoothed.every(Number.isFinite)).toBe(true);
  });

  it('does not mutate its input', () => {
    const values = [0.2, 0.9, 0.3];
    smoothSeries(values, 1);
    expect(values).toEqual([0.2, 0.9, 0.3]);
  });
});

describe('normalizeSeries', () => {
  it('lifts the loudest value to one', () => {
    expect(Math.max(...normalizeSeries([0.1, 0.25, 0.05]))).toBeCloseTo(1);
  });

  it('preserves relative proportions', () => {
    const out = normalizeSeries([0.1, 0.2]);
    expect(out[1] / out[0]).toBeCloseTo(2);
  });

  it('leaves an all-silent series alone rather than dividing by zero', () => {
    expect(normalizeSeries([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('buildWaveformSeries', () => {
  const peaks = Array.from({ length: 200 }, (_, i) => Math.abs(Math.sin(i / 5)) * 0.6);

  it('produces the requested resolution', () => {
    expect(buildWaveformSeries({ peaks, count: 96 })).toHaveLength(96);
  });

  it('keeps every value within the drawable range', () => {
    buildWaveformSeries({ peaks, count: 64, amplitude: 3 }).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    });
  });

  it('reaches full height once normalised, even for a quiet track', () => {
    const quiet = new Array(100).fill(0.05);
    quiet[10] = 0.09;
    expect(Math.max(...buildWaveformSeries({ peaks: quiet, count: 32 }))).toBeCloseTo(1);
  });

  it('leaves levels alone when normalisation is off', () => {
    const quiet = new Array(100).fill(0.05);
    expect(Math.max(...buildWaveformSeries({ peaks: quiet, count: 32, normalize: false }))).toBeCloseTo(0.05);
  });

  it('applies a floor so silence is a thin line, not a gap', () => {
    const out = buildWaveformSeries({ peaks: new Array(50).fill(0), count: 16, floor: 0.02 });
    expect(out.every((value) => value === 0.02)).toBe(true);
  });

  it('keeps that floor small enough not to read as a slab', () => {
    const out = buildWaveformSeries({ peaks: new Array(50).fill(0), count: 8 });
    expect(Math.max(...out)).toBeLessThan(0.05);
  });
});

describe('barSlots', () => {
  it('lays out one slot per bar across the full width', () => {
    const slots = barSlots(1000, 10, 0);
    expect(slots).toHaveLength(10);
    expect(slots[0].x).toBe(0);
    expect(slots[9].x + slots[9].width).toBeCloseTo(1000);
  });

  it('insets each bar by the gap while keeping the pitch even', () => {
    const slots = barSlots(1000, 10, 0.5);
    expect(slots[0].width).toBeCloseTo(50);
    expect(slots[1].x - slots[0].x).toBeCloseTo(100);
  });

  it('centres the bar inside its slot', () => {
    const [slot] = barSlots(100, 1, 0.5);
    expect(slot.x + slot.width / 2).toBeCloseTo(50);
  });

  it('never collapses a bar to zero width', () => {
    expect(barSlots(1000, 10, 5)[0].width).toBeGreaterThan(0);
  });

  it('returns nothing for a zero width or count', () => {
    expect(barSlots(0, 10, 0)).toEqual([]);
    expect(barSlots(100, 0, 0)).toEqual([]);
  });
});

describe('barRect', () => {
  const slot = { x: 10, width: 6 };

  it('centres a mirrored bar on the midline', () => {
    const rect = barRect(slot, 0.5, 200, true);
    expect(rect.y + rect.height / 2).toBeCloseTo(100);
    expect(rect.height).toBeCloseTo(100);
  });

  it('hangs an unmirrored bar from the baseline', () => {
    const rect = barRect(slot, 0.5, 200, false);
    expect(rect.y + rect.height).toBeCloseTo(200);
  });

  it('grows symmetrically as the value rises', () => {
    const small = barRect(slot, 0.2, 200, true);
    const large = barRect(slot, 0.9, 200, true);
    expect(large.height).toBeGreaterThan(small.height);
    expect(small.y + small.height / 2).toBeCloseTo(large.y + large.height / 2);
  });

  it('stays visible at zero rather than vanishing', () => {
    expect(barRect(slot, 0, 200, true).height).toBeGreaterThan(0);
  });
});

describe('capRadius', () => {
  it('is zero when caps are flat', () => {
    expect(capRadius({ x: 0, y: 0, width: 10, height: 40 }, 'flat')).toBe(0);
  });

  it('never exceeds half the short side, so a cap cannot deform the bar', () => {
    expect(capRadius({ x: 0, y: 0, width: 10, height: 40 }, 'round')).toBe(5);
    expect(capRadius({ x: 0, y: 0, width: 40, height: 3 }, 'round')).toBe(1.5);
  });
});

describe('waveformPathPoints', () => {
  it('traces one point per value across the width', () => {
    const points = waveformPathPoints([0, 1, 0], 100, 50, false);
    expect(points).toHaveLength(3);
    expect(points[0].x).toBe(0);
    expect(points[2].x).toBeCloseTo(100);
  });

  it('puts a peak above the midline', () => {
    const points = waveformPathPoints([1], 100, 50, false);
    expect(points[0].y).toBeLessThan(25);
  });

  it('closes a contour into a mirrored shape', () => {
    const points = waveformPathPoints([0.5, 0.5], 100, 50, true);
    expect(points).toHaveLength(4);
    const above = points.filter((p) => p.y < 25).length;
    const below = points.filter((p) => p.y > 25).length;
    expect(above).toBe(below);
  });

  it('returns nothing for an empty series', () => {
    expect(waveformPathPoints([], 100, 50, true)).toEqual([]);
  });

  it('formats points for an svg attribute at two decimals', () => {
    expect(pointsAttribute([{ x: 1.2367, y: 2 }, { x: 3, y: 4.5 }])).toBe('1.24,2.00 3.00,4.50');
  });
});

describe('circularSegments', () => {
  it('returns one spoke per value', () => {
    expect(circularSegments([0.2, 0.4, 0.6], 100)).toHaveLength(3);
  });

  it('starts at the top of the disc', () => {
    const [first] = circularSegments([1], 100);
    expect(first.x1).toBeCloseTo(50);
    expect(first.y1).toBeLessThan(50);
  });

  it('grows outward with the value and stays inside the circle', () => {
    const [quiet] = circularSegments([0.1], 100);
    const [loud] = circularSegments([1], 100);
    const length = (s: typeof quiet) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    expect(length(loud)).toBeGreaterThan(length(quiet));
    expect(Math.hypot(loud.x2 - 50, loud.y2 - 50)).toBeLessThanOrEqual(50.01);
  });

  it('leaves a hole in the middle', () => {
    const [segment] = circularSegments([0], 100, 0.42);
    expect(Math.hypot(segment.x1 - 50, segment.y1 - 50)).toBeCloseTo(21);
  });
});

describe('mode helpers', () => {
  it('knows which modes draw bars', () => {
    expect(isBarMode('linear')).toBe(true);
    expect(isBarMode('mirror')).toBe(true);
    expect(isBarMode('contour')).toBe(false);
    expect(isBarMode('circular')).toBe(false);
  });

  it('suggests a bar count that scales with width but stays in range', () => {
    expect(suggestedBarCount(2300)).toBeGreaterThan(24);
    expect(suggestedBarCount(50)).toBe(24);
    expect(suggestedBarCount(100000)).toBe(400);
  });
});
