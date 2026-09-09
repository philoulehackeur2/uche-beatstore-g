import { describe, expect, it } from 'vitest';
import {
  defaultGrid, gridDivisionChoices, gridLines, gridSnapLines,
  safeAreaById, safeAreaPresets, safeAreaRect, withinSafeArea,
} from './overlay';

describe('gridLines', () => {
  it('returns interior lines only, never the edges', () => {
    const lines = gridLines(1000, 4);
    expect(lines).toEqual([250, 500, 750]);
    expect(lines).not.toContain(0);
    expect(lines).not.toContain(1000);
  });

  it('is symmetric about the centre', () => {
    const lines = gridLines(3000, 12);
    lines.forEach((line, index) => {
      expect(line + lines[lines.length - 1 - index]).toBeCloseTo(3000, 6);
    });
  });

  it('yields divisions - 1 lines for every offered division count', () => {
    gridDivisionChoices.forEach((divisions) => {
      expect(gridLines(2048, divisions)).toHaveLength(divisions - 1);
    });
  });

  it('refuses degenerate input rather than dividing by zero', () => {
    expect(gridLines(1000, 1)).toEqual([]);
    expect(gridLines(1000, 0)).toEqual([]);
    expect(gridLines(1000, -4)).toEqual([]);
    expect(gridLines(0, 8)).toEqual([]);
    expect(gridLines(Number.NaN, 8)).toEqual([]);
  });

  it('floors fractional division counts', () => {
    expect(gridLines(900, 3.9)).toEqual(gridLines(900, 3));
  });
});

describe('gridSnapLines', () => {
  it('is empty unless the grid is both visible and snapping', () => {
    const board = { width: 1000, height: 1000 };
    expect(gridSnapLines(board, { visible: false, divisions: 4, snap: true })).toEqual({ x: [], y: [] });
    expect(gridSnapLines(board, { visible: true, divisions: 4, snap: false })).toEqual({ x: [], y: [] });
  });

  it('produces per-axis lines for a non-square artboard', () => {
    const lines = gridSnapLines({ width: 1000, height: 500 }, { visible: true, divisions: 2, snap: true });
    expect(lines).toEqual({ x: [500], y: [250] });
  });

  it('defaults to off, so an existing document behaves as before', () => {
    expect(defaultGrid.visible).toBe(false);
    expect(defaultGrid.snap).toBe(false);
  });
});

describe('safeAreaRect', () => {
  it('returns null with no preset', () => {
    expect(safeAreaRect(1000, 1000, null)).toBeNull();
  });

  it('insets by a fraction of the shorter side, so the margin is even', () => {
    const rect = safeAreaRect(2000, 1000, { id: 'x', label: 'x', hint: '', kind: 'inset', value: 0.1 })!;
    // 10% of 1000, not of each axis.
    expect(rect).toEqual({ x: 100, y: 100, width: 1800, height: 800 });
    expect(rect.x).toBe(rect.y);
  });

  it('stays centred and inside the artboard for every shipped preset', () => {
    safeAreaPresets.forEach((preset) => {
      const rect = safeAreaRect(3000, 3000, preset)!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(3000 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(3000 + 1e-9);
      // Centred: equal slack on both sides of each axis.
      expect(rect.x).toBeCloseTo(3000 - (rect.x + rect.width), 6);
      expect(rect.y).toBeCloseTo(3000 - (rect.y + rect.height), 6);
    });
  });

  it('crops a square cover to the requested aspect', () => {
    const wide = safeAreaRect(1000, 1000, safeAreaById('crop-16-9'))!;
    expect(wide.width).toBe(1000);
    expect(wide.height).toBeCloseTo(562.5, 6);

    const tall = safeAreaRect(1000, 1000, safeAreaById('crop-9-16'))!;
    expect(tall.height).toBe(1000);
    expect(tall.width).toBeCloseTo(562.5, 6);
  });

  it('picks the axis that actually constrains, in both directions', () => {
    const preset = safeAreaById('crop-16-9')!;
    // Artboard already wider than 16:9 — height is the limit.
    const onWide = safeAreaRect(4000, 1000, preset)!;
    expect(onWide.height).toBe(1000);
    expect(onWide.width).toBeCloseTo(1000 * (16 / 9), 6);
    // Artboard narrower — width is the limit.
    const onTall = safeAreaRect(1000, 4000, preset)!;
    expect(onTall.width).toBe(1000);
    expect(onTall.height).toBeCloseTo(1000 / (16 / 9), 6);
  });

  it('leaves an exactly-matching artboard untouched', () => {
    const rect = safeAreaRect(1600, 900, safeAreaById('crop-16-9'))!;
    expect(rect).toEqual({ x: 0, y: 0, width: 1600, height: 900 });
  });

  it('clamps an absurd inset rather than inverting the rect', () => {
    const rect = safeAreaRect(1000, 1000, { id: 'x', label: 'x', hint: '', kind: 'inset', value: 5 })!;
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('refuses a degenerate artboard', () => {
    expect(safeAreaRect(0, 1000, safeAreaById('title-safe'))).toBeNull();
    expect(safeAreaRect(Number.NaN, 1000, safeAreaById('title-safe'))).toBeNull();
  });
});

describe('safeAreaById', () => {
  it('resolves every shipped id and nothing else', () => {
    safeAreaPresets.forEach((preset) => expect(safeAreaById(preset.id)).toBe(preset));
    expect(safeAreaById('nope')).toBeNull();
    expect(safeAreaById(null)).toBeNull();
  });

  it('ships unique ids and a hint for each, since the UI shows them', () => {
    expect(new Set(safeAreaPresets.map((p) => p.id)).size).toBe(safeAreaPresets.length);
    safeAreaPresets.forEach((preset) => expect(preset.hint.length).toBeGreaterThan(0));
  });
});

describe('withinSafeArea', () => {
  const safe = { x: 100, y: 100, width: 800, height: 800 };

  it('passes a rect inside and a rect exactly on the boundary', () => {
    expect(withinSafeArea({ x: 200, y: 200, width: 100, height: 100 }, safe)).toBe(true);
    expect(withinSafeArea({ x: 100, y: 100, width: 800, height: 800 }, safe)).toBe(true);
  });

  it('fails a rect crossing any single edge', () => {
    expect(withinSafeArea({ x: 99, y: 200, width: 100, height: 100 }, safe)).toBe(false);
    expect(withinSafeArea({ x: 200, y: 99, width: 100, height: 100 }, safe)).toBe(false);
    expect(withinSafeArea({ x: 850, y: 200, width: 100, height: 100 }, safe)).toBe(false);
    expect(withinSafeArea({ x: 200, y: 850, width: 100, height: 100 }, safe)).toBe(false);
  });

  it('passes everything when no safe area is shown', () => {
    expect(withinSafeArea({ x: -500, y: -500, width: 100, height: 100 }, null)).toBe(true);
  });
});
