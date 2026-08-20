/**
 * Waveform rendering for cover art.
 *
 * WHAT WAS WRONG BEFORE. The old builder assigned each bar a "frequency lane"
 * from `index % 6` / `index % 3` — arithmetic on the bar's position, carrying no
 * audio information whatsoever — and the renderer painted those lanes in two
 * fixed blues. On a warm cover that reads as coloured noise, which is most of
 * why the waveform looked amateur. It also point-sampled when downsampling
 * (aliasing away exactly the transients that give a beat its shape), locked
 * itself to 64 bars however wide the layer was, and gave every bar a constant
 * height floor so silence rendered as a solid slab.
 *
 * This module does the three things a professional waveform actually needs:
 * bucket-peak downsampling that keeps transients, optional normalisation so the
 * loudest hit reaches full height, and geometry that mirrors around a
 * centreline. Colour is left to the caller — one colour, from the artwork's own
 * palette.
 *
 * Pure and unit-tested; the canvas and the SVG exporter both render from here
 * so they cannot disagree.
 */

export type WaveformMode = 'linear' | 'mirror' | 'line' | 'contour' | 'circular' | 'spectral-bars' | 'blocks';

/** Modes that draw discrete bars rather than a continuous path. */
export const barModes: WaveformMode[] = ['linear', 'mirror', 'spectral-bars', 'blocks'];

export function isBarMode(mode: WaveformMode): boolean {
  return barModes.includes(mode);
}

/**
 * Downsample to `count` values by taking the peak of each bucket.
 *
 * Peak-per-bucket, not interpolation: a kick drum occupying three source
 * samples out of twenty must still reach full height after downsampling.
 * Sampling the value at a computed index instead — which is what this used to
 * do — lands between transients as often as on them, and the waveform comes out
 * looking like soft noise with the punch averaged away.
 */
export function resamplePeaks(peaks: number[], count: number): number[] {
  if (count <= 0) return [];
  if (peaks.length === 0) return new Array(count).fill(0);
  if (peaks.length === 1) return new Array(count).fill(Math.abs(peaks[0]));

  return Array.from({ length: count }, (_, index) => {
    const start = (index / count) * peaks.length;
    const end = ((index + 1) / count) * peaks.length;
    const from = Math.floor(start);
    // At least one sample per bucket when upsampling past the source length.
    const to = Math.max(from + 1, Math.ceil(end));

    let peak = 0;
    for (let i = from; i < to && i < peaks.length; i += 1) {
      const value = Math.abs(peaks[i]);
      if (value > peak) peak = value;
    }
    return peak;
  });
}

/**
 * Moving average over a window scaled by `amount` (0..1).
 *
 * Smoothing is a look, not a fix — at 0 the series is untouched, so a producer
 * who wants every transient keeps them.
 */
export function smoothSeries(values: number[], amount: number): number[] {
  const strength = Math.min(1, Math.max(0, amount));
  if (strength === 0 || values.length < 3) return [...values];

  // Up to ~4% of the series each side; beyond that everything turns to mush.
  const radius = Math.max(1, Math.round((values.length * 0.04) * strength));

  return values.map((_, index) => {
    let total = 0;
    let n = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const at = index + offset;
      if (at < 0 || at >= values.length) continue;
      total += values[at];
      n += 1;
    }
    return n === 0 ? values[index] : total / n;
  });
}

/** Scale so the loudest value reaches 1. A silent series is left alone. */
export function normalizeSeries(values: number[]): number[] {
  const peak = values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  if (peak <= 0) return [...values];
  return values.map((value) => value / peak);
}

export type WaveformSeriesOptions = {
  peaks: number[];
  count: number;
  /** 0..1 moving-average strength. */
  smoothing?: number;
  /** Scale the loudest peak to full height. */
  normalize?: boolean;
  /** Overall height multiplier, applied after normalisation. */
  amplitude?: number;
  /**
   * Minimum height, as a fraction of full. Small on purpose: a visible floor is
   * what turned the old waveform into a slab, but exactly zero leaves gaps that
   * read as rendering failures.
   */
  floor?: number;
};

/** The full pipeline: resample, smooth, normalise, scale, clamp. */
export function buildWaveformSeries({
  peaks, count, smoothing = 0, normalize = true, amplitude = 1, floor = 0.015,
}: WaveformSeriesOptions): number[] {
  const resampled = resamplePeaks(peaks, count);
  const smoothed = smoothSeries(resampled, smoothing);
  const scaled = normalize ? normalizeSeries(smoothed) : smoothed;
  return scaled.map((value) => Math.min(1, Math.max(floor, value * amplitude)));
}

/* ── Geometry ──────────────────────────────────────────────────────────── */

export type BarSlot = { x: number; width: number };

/**
 * Evenly divide `width` into `count` slots, each inset by `gap`.
 *
 * `gap` is a fraction of the slot rather than an absolute size so the spacing
 * stays proportional when the layer is resized — an absolute gap closes up to
 * nothing as bars get denser.
 */
export function barSlots(width: number, count: number, gap: number): BarSlot[] {
  if (count <= 0 || width <= 0) return [];
  const slot = width / count;
  const clampedGap = Math.min(0.9, Math.max(0, gap));
  const barWidth = Math.max(0.5, slot * (1 - clampedGap));
  const offset = (slot - barWidth) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: index * slot + offset,
    width: barWidth,
  }));
}

export type BarRect = { x: number; y: number; width: number; height: number };

/**
 * Rect for one bar.
 *
 * `mirror` centres the bar on the layer's midline and grows it both ways, which
 * is what an audio waveform looks like. Without it bars hang from a single
 * edge, which reads as a bar chart.
 */
export function barRect(
  slot: BarSlot,
  value: number,
  layerHeight: number,
  mirror: boolean,
): BarRect {
  const height = Math.max(0.5, value * layerHeight);
  if (!mirror) {
    return { x: slot.x, y: layerHeight - height, width: slot.width, height };
  }
  return { x: slot.x, y: (layerHeight - height) / 2, width: slot.width, height };
}

/** Radius for a rounded bar cap, never more than half the bar's short side. */
export function capRadius(rect: BarRect, cap: 'flat' | 'round'): number {
  if (cap === 'flat') return 0;
  return Math.min(rect.width, rect.height) / 2;
}

/**
 * Points for a line or filled contour.
 *
 * A contour traces the top edge left to right, then the mirrored bottom edge
 * back, so the result closes into a symmetric shape.
 */
export function waveformPathPoints(
  values: number[],
  width: number,
  height: number,
  closed: boolean,
): Array<{ x: number; y: number }> {
  if (values.length === 0) return [];
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  const middle = height / 2;

  const top = values.map((value, index) => ({
    x: index * step,
    y: middle - (value * height) / 2,
  }));
  if (!closed) return top;

  const bottom = [...values].reverse().map((value, index) => ({
    x: (values.length - 1 - index) * step,
    y: middle + (value * height) / 2,
  }));
  return [...top, ...bottom];
}

/** `points` attribute for an SVG polyline/polygon. */
export function pointsAttribute(points: Array<{ x: number; y: number }>): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

export type RadialSegment = { x1: number; y1: number; x2: number; y2: number };

/**
 * Spokes radiating from a centre, one per value.
 *
 * Starts at twelve o'clock rather than three so the loudest part of a track
 * reads from the top of the disc, which is how a circular waveform is expected
 * to sit on a sleeve.
 */
export function circularSegments(
  values: number[],
  size: number,
  innerRatio = 0.42,
): RadialSegment[] {
  const centre = size / 2;
  const inner = centre * innerRatio;
  const span = centre - inner;

  return values.map((value, index) => {
    const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2;
    const outer = inner + value * span;
    return {
      x1: centre + Math.cos(angle) * inner,
      y1: centre + Math.sin(angle) * inner,
      x2: centre + Math.cos(angle) * outer,
      y2: centre + Math.sin(angle) * outer,
    };
  });
}

/**
 * A sensible bar count for a layer's width.
 *
 * Used for the default only. Roughly one bar per 18 document units keeps bars
 * readable without turning a wide waveform into a solid block.
 */
export function suggestedBarCount(width: number): number {
  return Math.min(400, Math.max(24, Math.round(width / 18)));
}
