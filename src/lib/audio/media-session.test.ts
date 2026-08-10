import { describe, expect, it } from 'vitest';
import {
  MEDIA_SESSION_SEEK_OFFSET_SECONDS,
  mediaSessionSkipMode,
  seekFractionAfterOffset,
} from './media-session';

describe('mediaSessionSkipMode', () => {
  it('binds the OS skip buttons to track skipping when there is a queue', () => {
    expect(mediaSessionSkipMode(2)).toBe('track');
    expect(mediaSessionSkipMode(600)).toBe('track');
  });

  it('falls back to seek for a lone track, where next/prev would be inert', () => {
    expect(mediaSessionSkipMode(1)).toBe('seek');
    expect(mediaSessionSkipMode(0)).toBe('seek');
  });
});

describe('seekFractionAfterOffset', () => {
  const DUR = 120;

  it('moves forward by the offset as a fraction of duration', () => {
    expect(seekFractionAfterOffset(0.5, 15, DUR)).toBeCloseTo(0.625);
  });

  it('moves backward on a negative offset', () => {
    expect(seekFractionAfterOffset(0.5, -15, DUR)).toBeCloseTo(0.375);
  });

  it('clamps to the end of the track', () => {
    expect(seekFractionAfterOffset(0.95, 60, DUR)).toBe(1);
  });

  it('clamps to the start of the track', () => {
    expect(seekFractionAfterOffset(0.05, -60, DUR)).toBe(0);
  });

  it('returns null when duration is unknown, rather than dividing by zero', () => {
    expect(seekFractionAfterOffset(0.5, 15, 0)).toBeNull();
    expect(seekFractionAfterOffset(0.5, 15, Number.NaN)).toBeNull();
    expect(seekFractionAfterOffset(0.5, 15, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('uses a default offset that actually moves a typical beat', () => {
    // A 2-minute beat should move a visible amount, not a rounding error.
    const moved = seekFractionAfterOffset(0, MEDIA_SESSION_SEEK_OFFSET_SECONDS, DUR);
    expect(moved).toBeGreaterThan(0.1);
  });
});
