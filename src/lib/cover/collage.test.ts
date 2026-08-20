import { describe, expect, it } from 'vitest';
import { buildCollage, collageFrame, gridColumns, type CollageLayoutId } from './collage';

const frame = { x: 0, y: 0, width: 1000, height: 1000 };
const layouts: CollageLayoutId[] = ['grid', 'mosaic', 'filmstrip', 'stack', 'scatter'];

describe('buildCollage', () => {
  it('returns nothing for an empty collage', () => {
    expect(buildCollage({ frame, count: 0, layout: 'grid' })).toEqual([]);
  });

  it('gives a single image the whole frame', () => {
    expect(buildCollage({ frame, count: 1, layout: 'grid' })[0])
      .toMatchObject({ x: 0, y: 0, width: 1000, height: 1000 });
  });

  it.each(layouts)('returns one slot per image for %s', (layout) => {
    expect(buildCollage({ frame, count: 5, layout })).toHaveLength(5);
  });

  it.each(layouts)('keeps every slot inside the frame for %s', (layout) => {
    buildCollage({ frame, count: 6, layout }).forEach((slot) => {
      expect(slot.x).toBeGreaterThanOrEqual(frame.x - 1);
      expect(slot.y).toBeGreaterThanOrEqual(frame.y - 1);
      expect(slot.x + slot.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      expect(slot.y + slot.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    });
  });

  it.each(layouts)('gives every slot a positive size for %s', (layout) => {
    buildCollage({ frame, count: 7, layout }).forEach((slot) => {
      expect(slot.width).toBeGreaterThan(0);
      expect(slot.height).toBeGreaterThan(0);
    });
  });

  it.each(layouts)('assigns a unique paint order for %s', (layout) => {
    const orders = buildCollage({ frame, count: 4, layout }).map((slot) => slot.order);
    expect(new Set(orders).size).toBe(4);
  });

  it('builds a square-ish grid', () => {
    expect(gridColumns(4)).toBe(2);
    expect(gridColumns(5)).toBe(3);
    expect(gridColumns(9)).toBe(3);
    const slots = buildCollage({ frame, count: 4, layout: 'grid', gap: 0 });
    expect(slots[0]).toMatchObject({ x: 0, y: 0, width: 500, height: 500 });
    expect(slots[3]).toMatchObject({ x: 500, y: 500 });
  });

  it('respects the gap between grid tiles', () => {
    const slots = buildCollage({ frame, count: 4, layout: 'grid', gap: 100 });
    expect(slots[1].x - (slots[0].x + slots[0].width)).toBeCloseTo(100);
  });

  it('gives the mosaic hero the full frame height and the larger share of width', () => {
    const slots = buildCollage({ frame, count: 4, layout: 'mosaic', gap: 0 });
    expect(slots[0].height).toBe(1000);
    expect(slots[0].width).toBeGreaterThan(slots[1].width);
  });

  it('falls back to a grid when a mosaic has too few images', () => {
    const mosaic = buildCollage({ frame, count: 2, layout: 'mosaic', gap: 0 });
    const grid = buildCollage({ frame, count: 2, layout: 'grid', gap: 0 });
    expect(mosaic).toEqual(grid);
  });

  it('lays a filmstrip out in a single row', () => {
    const slots = buildCollage({ frame, count: 4, layout: 'filmstrip' });
    expect(new Set(slots.map((slot) => slot.y)).size).toBe(1);
  });

  it('steps a stack from one corner to the other', () => {
    const slots = buildCollage({ frame, count: 3, layout: 'stack' });
    expect(slots[0].x).toBeLessThan(slots[2].x);
    expect(slots[0].y).toBeLessThan(slots[2].y);
    expect(slots[2].x + slots[2].width).toBeCloseTo(frame.width);
  });

  it('scatters the same way for the same seed and differently for another', () => {
    const a = buildCollage({ frame, count: 5, layout: 'scatter', seed: 'one' });
    const b = buildCollage({ frame, count: 5, layout: 'scatter', seed: 'one' });
    const c = buildCollage({ frame, count: 5, layout: 'scatter', seed: 'two' });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('only rotates in the scatter layout', () => {
    expect(buildCollage({ frame, count: 5, layout: 'grid' }).every((s) => s.rotation === 0)).toBe(true);
    expect(buildCollage({ frame, count: 5, layout: 'scatter' }).some((s) => s.rotation !== 0)).toBe(true);
  });
});

describe('collageFrame', () => {
  it('insets the artboard symmetrically', () => {
    expect(collageFrame({ width: 3000, height: 3000 })).toEqual({ x: 240, y: 240, width: 2520, height: 2520 });
  });

  it('accepts a custom inset', () => {
    expect(collageFrame({ width: 1000, height: 1000 }, 0.1)).toEqual({ x: 100, y: 100, width: 800, height: 800 });
  });
});
