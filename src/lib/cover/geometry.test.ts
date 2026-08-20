import { describe, expect, it } from 'vitest';
import {
  MIN_LAYER_SIZE,
  clampToArtboard,
  collectSnapTargets,
  fitRectInside,
  normalizeRotation,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  rotationFromPointer,
  selectionBounds,
  scaleRectWithin,
  snapRect,
  uniformScaleFactor,
} from './geometry';

const rect = { x: 100, y: 100, width: 200, height: 100 };

describe('resizeRect', () => {
  it('grows from the north-west corner when dragging south-east', () => {
    const next = resizeRect({ rect, handle: 'se', dx: 50, dy: 25 });
    expect(next).toEqual({ x: 100, y: 100, width: 250, height: 125 });
  });

  it('keeps the south-east corner pinned when dragging north-west', () => {
    const next = resizeRect({ rect, handle: 'nw', dx: -50, dy: -25 });
    expect(next.x).toBeCloseTo(50);
    expect(next.y).toBeCloseTo(75);
    expect(next.x + next.width).toBeCloseTo(rect.x + rect.width);
    expect(next.y + next.height).toBeCloseTo(rect.y + rect.height);
  });

  it('only changes one axis for an edge handle', () => {
    const next = resizeRect({ rect, handle: 'e', dx: 40, dy: 999 });
    expect(next.height).toBe(rect.height);
    expect(next.width).toBe(240);
  });

  it('never shrinks below the minimum size', () => {
    const next = resizeRect({ rect, handle: 'se', dx: -9999, dy: -9999 });
    expect(next.width).toBe(MIN_LAYER_SIZE);
    expect(next.height).toBe(MIN_LAYER_SIZE);
  });

  it('preserves aspect ratio when locked', () => {
    const next = resizeRect({ rect, handle: 'se', dx: 100, dy: 0, aspectLocked: true });
    expect(next.width / next.height).toBeCloseTo(rect.width / rect.height);
  });

  it('grows both ways about the centre when fromCenter is set', () => {
    const next = resizeRect({ rect, handle: 'e', dx: 25, fromCenter: true, dy: 0 });
    expect(next.width).toBe(250);
    expect(next.x + next.width / 2).toBeCloseTo(rect.x + rect.width / 2);
  });

  it('resizes along the layer axis when the layer is rotated', () => {
    // Rotated 90 degrees, a downward screen drag runs along the layer's own
    // -x axis, so the east handle should shrink the width, not the height.
    const next = resizeRect({ rect, handle: 'e', dx: 0, dy: 60, rotation: 90 });
    expect(next.height).toBe(rect.height);
    expect(next.width).toBeCloseTo(260);
  });

  it('keeps the anchor fixed in world space for a rotated layer', () => {
    const rotation = 30;
    const before = resizeRect({ rect, handle: 'se', dx: 0, dy: 0, rotation });
    const after = resizeRect({ rect, handle: 'se', dx: 80, dy: 40, rotation });
    // The north-west corner is the anchor; in world terms it must not move.
    const worldNw = (r: typeof rect) => {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const rad = (rotation * Math.PI) / 180;
      const lx = -r.width / 2;
      const ly = -r.height / 2;
      return {
        x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
        y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
      };
    };
    expect(worldNw(after).x).toBeCloseTo(worldNw(before).x, 6);
    expect(worldNw(after).y).toBeCloseTo(worldNw(before).y, 6);
  });
});

describe('snapping', () => {
  const artboard = { width: 3000, height: 3000 };
  const layers = [
    { id: 'a', x: 500, y: 500, width: 400, height: 400, visible: true },
    { id: 'hidden', x: 10, y: 10, width: 20, height: 20, visible: false },
  ];

  it('offers artboard edges and centres', () => {
    const targets = collectSnapTargets(artboard, [], []);
    expect(targets.vertical).toEqual([0, 1500, 3000]);
    expect(targets.horizontal).toEqual([0, 1500, 3000]);
  });

  it('includes other layers but excludes the dragged one and hidden layers', () => {
    const targets = collectSnapTargets(artboard, layers, ['a']);
    expect(targets.vertical).not.toContain(700);
    expect(targets.vertical).not.toContain(10);
    const withA = collectSnapTargets(artboard, layers, []);
    expect(withA.vertical).toContain(700);
  });

  it('snaps a near-miss onto the guide and reports it', () => {
    const targets = collectSnapTargets(artboard, [], []);
    const result = snapRect({ x: 8, y: 2000, width: 100, height: 100 }, targets, 18);
    expect(result.x).toBe(0);
    expect(result.guides.vertical).toEqual([0]);
  });

  it('leaves a rect alone when nothing is within the threshold', () => {
    const targets = collectSnapTargets(artboard, [], []);
    const result = snapRect({ x: 800, y: 900, width: 100, height: 100 }, targets, 18);
    expect(result).toMatchObject({ x: 800, y: 900 });
    expect(result.guides.vertical).toEqual([]);
  });

  it('snaps by centre when the centre is the closest edge', () => {
    const targets = collectSnapTargets(artboard, [], []);
    // Centre sits at 1495, five from the artboard centre; left edge is far away.
    const result = snapRect({ x: 1445, y: 0, width: 100, height: 100 }, targets, 18);
    expect(result.x + 50).toBe(1500);
  });
});

describe('rotationFromPointer', () => {
  it('reads zero when the pointer is directly above the centre', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0);
  });

  it('reads ninety when the pointer is to the right', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
  });

  it('snaps to detents', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: -10, y: -1 }, 15)).toBe(-90);
  });

  it('folds angles into the inspector range of -180 to 180', () => {
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-8)).toBe(-8);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(0)).toBe(0);
  });
});

describe('rect helpers', () => {
  it('bounds a multi-selection', () => {
    expect(selectionBounds([
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 50, width: 100, height: 300 },
    ])).toEqual({ x: 0, y: 0, width: 300, height: 350 });
  });

  it('returns null for an empty selection', () => {
    expect(selectionBounds([])).toBeNull();
  });

  it('detects intersection for marquee selection', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectsIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(rectsIntersect(a, { x: 200, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('normalises a backwards drag into a positive rect', () => {
    expect(rectFromPoints({ x: 100, y: 100 }, { x: 20, y: 40 }))
      .toEqual({ x: 20, y: 40, width: 80, height: 60 });
  });

  it('fits a landscape image inside a square frame without distortion', () => {
    const fitted = fitRectInside({ x: 0, y: 0, width: 1000, height: 1000 }, 2);
    expect(fitted).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });

  it('fits a portrait image inside a square frame', () => {
    const fitted = fitRectInside({ x: 0, y: 0, width: 1000, height: 1000 }, 0.5);
    expect(fitted).toEqual({ x: 250, y: 0, width: 500, height: 1000 });
  });

  it('keeps a dragged layer partly on the artboard', () => {
    const clamped = clampToArtboard({ x: -5000, y: 9000, width: 200, height: 200 }, { width: 3000, height: 3000 });
    expect(clamped.x).toBe(48 - 200);
    expect(clamped.y).toBe(3000 - 48);
  });
});

describe('scaleRectWithin', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };

  it('leaves a rect alone when the box does not change', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(scaleRectWithin(rect, box, box)).toEqual(rect);
  });

  it('scales position and size together when the box doubles', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 };
    expect(scaleRectWithin(rect, box, { x: 0, y: 0, width: 200, height: 200 }))
      .toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });

  it('follows the box when it moves without resizing', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(scaleRectWithin(rect, box, { x: 50, y: 70, width: 100, height: 100 }))
      .toEqual({ x: 60, y: 80, width: 20, height: 20 });
  });

  it('scales each axis independently', () => {
    const rect = { x: 0, y: 0, width: 50, height: 50 };
    expect(scaleRectWithin(rect, box, { x: 0, y: 0, width: 200, height: 50 }))
      .toEqual({ x: 0, y: 0, width: 100, height: 25 });
  });

  it('keeps members in the same relative order along an axis', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 50, y: 0, width: 10, height: 10 };
    const to = { x: 0, y: 0, width: 300, height: 100 };
    expect(scaleRectWithin(a, box, to).x).toBeLessThan(scaleRectWithin(b, box, to).x);
  });

  it('does not divide by zero on a degenerate box', () => {
    const rect = { x: 5, y: 5, width: 10, height: 10 };
    const flat = { x: 0, y: 0, width: 0, height: 0 };
    const result = scaleRectWithin(rect, flat, { x: 20, y: 20, width: 100, height: 100 });
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.width)).toBe(true);
  });
});

describe('uniformScaleFactor', () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };

  it('is 1 when nothing changes', () => {
    expect(uniformScaleFactor(box, box)).toBe(1);
  });

  it('doubles when both axes double', () => {
    expect(uniformScaleFactor(box, { x: 0, y: 0, width: 200, height: 200 })).toBeCloseTo(2);
  });

  it('cancels out opposing axes so type keeps its size', () => {
    expect(uniformScaleFactor(box, { x: 0, y: 0, width: 200, height: 50 })).toBeCloseTo(1);
  });

  it('never returns zero or a non-finite number', () => {
    expect(uniformScaleFactor({ x: 0, y: 0, width: 0, height: 0 }, box)).toBe(1);
  });
});
