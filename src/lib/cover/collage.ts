/**
 * Collage layouts for the cover art studio.
 *
 * Given N image layers and a frame, this returns where each one goes. Pure and
 * deterministic — including `scatter`, which uses a seeded generator rather
 * than Math.random so re-running a layout does not reshuffle a composition the
 * producer was happy with, and so the result can be tested at all.
 *
 * Placing images by hand one at a time is the slowest part of making a collage,
 * and it is the part a tool should do. The producer picks a layout, then nudges.
 */

export type CollageLayoutId = 'grid' | 'mosaic' | 'filmstrip' | 'stack' | 'scatter';

export type CollageSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Painting order; higher sits on top. */
  order: number;
};

export type CollageOptions = {
  /** Region the collage must stay inside, in document units. */
  frame: { x: number; y: number; width: number; height: number };
  count: number;
  layout: CollageLayoutId;
  /** Space between items, in document units. */
  gap?: number;
  /** Seed for `scatter`, so a layout is reproducible. */
  seed?: string;
};

export const collageLayouts: Array<{ id: CollageLayoutId; name: string; hint: string }> = [
  { id: 'grid', name: 'Grid', hint: 'Even tiles, contact-sheet feel.' },
  { id: 'mosaic', name: 'Mosaic', hint: 'One hero image with supporting tiles.' },
  { id: 'filmstrip', name: 'Filmstrip', hint: 'A single horizontal band across the cover.' },
  { id: 'stack', name: 'Stack', hint: 'Overlapping prints, like photos on a table.' },
  { id: 'scatter', name: 'Scatter', hint: 'Loose angles and offsets, hand-placed look.' },
];

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Columns that keep a grid of `count` items closest to square. */
export function gridColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

function gridSlots(frame: CollageOptions['frame'], count: number, gap: number): CollageSlot[] {
  const columns = gridColumns(count);
  const rows = Math.ceil(count / columns);
  const cellWidth = (frame.width - gap * (columns - 1)) / columns;
  const cellHeight = (frame.height - gap * (rows - 1)) / rows;

  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: frame.x + column * (cellWidth + gap),
      y: frame.y + row * (cellHeight + gap),
      width: cellWidth,
      height: cellHeight,
      rotation: 0,
      order: index,
    };
  });
}

/**
 * A hero image filling the left column with the rest stacked down the right.
 *
 * With fewer than three images there is nothing to support the hero, so this
 * falls back to a plain grid rather than producing a lopsided single column.
 */
function mosaicSlots(frame: CollageOptions['frame'], count: number, gap: number): CollageSlot[] {
  if (count < 3) return gridSlots(frame, count, gap);

  const heroWidth = frame.width * 0.62 - gap / 2;
  const railWidth = frame.width - heroWidth - gap;
  const railCount = count - 1;
  const railHeight = (frame.height - gap * (railCount - 1)) / railCount;

  const hero: CollageSlot = {
    x: frame.x,
    y: frame.y,
    width: heroWidth,
    height: frame.height,
    rotation: 0,
    order: 0,
  };

  const rail = Array.from({ length: railCount }, (_, index) => ({
    x: frame.x + heroWidth + gap,
    y: frame.y + index * (railHeight + gap),
    width: railWidth,
    height: railHeight,
    rotation: 0,
    order: index + 1,
  }));

  return [hero, ...rail];
}

function filmstripSlots(frame: CollageOptions['frame'], count: number, gap: number): CollageSlot[] {
  const cellWidth = (frame.width - gap * (count - 1)) / count;
  const height = Math.min(frame.height, cellWidth * 1.25);
  const y = frame.y + (frame.height - height) / 2;

  return Array.from({ length: count }, (_, index) => ({
    x: frame.x + index * (cellWidth + gap),
    y,
    width: cellWidth,
    height,
    rotation: 0,
    order: index,
  }));
}

/**
 * Overlapping prints marching diagonally down the frame.
 *
 * The step is derived from the leftover space rather than fixed, so three
 * images and eight images both fill the frame instead of the last one falling
 * off the edge.
 */
function stackSlots(frame: CollageOptions['frame'], count: number): CollageSlot[] {
  const size = Math.min(frame.width, frame.height) * 0.7;
  const stepX = count > 1 ? (frame.width - size) / (count - 1) : 0;
  const stepY = count > 1 ? (frame.height - size) / (count - 1) : 0;

  return Array.from({ length: count }, (_, index) => ({
    x: frame.x + stepX * index,
    y: frame.y + stepY * index,
    width: size,
    height: size,
    rotation: 0,
    order: index,
  }));
}

/**
 * Grid positions loosened by seeded jitter and a few degrees of rotation.
 *
 * Jitter is clamped back inside the frame afterwards rather than being kept
 * small enough to never escape it: the whole point of the frame is that it is
 * the safe area, and a collage tile that drifts past it gets cropped off by
 * every store that renders the cover.
 */
function scatterSlots(
  frame: CollageOptions['frame'],
  count: number,
  gap: number,
  seed: string,
): CollageSlot[] {
  const random = seededRandom(seed);
  return gridSlots(frame, count, gap).map((slot) => {
    const jitterX = (random() - 0.5) * slot.width * 0.3;
    const jitterY = (random() - 0.5) * slot.height * 0.3;
    const scale = 0.86 + random() * 0.28;
    const width = slot.width * scale;
    const height = slot.height * scale;
    const x = slot.x + jitterX + (slot.width - width) / 2;
    const y = slot.y + jitterY + (slot.height - height) / 2;
    return {
      x: Math.min(frame.x + frame.width - width, Math.max(frame.x, x)),
      y: Math.min(frame.y + frame.height - height, Math.max(frame.y, y)),
      width,
      height,
      rotation: (random() - 0.5) * 16,
      order: slot.order,
    };
  });
}

export function buildCollage({ frame, count, layout, gap = 48, seed = 'collage' }: CollageOptions): CollageSlot[] {
  if (count <= 0) return [];
  if (count === 1 && layout !== 'scatter') {
    return [{ x: frame.x, y: frame.y, width: frame.width, height: frame.height, rotation: 0, order: 0 }];
  }

  switch (layout) {
    case 'mosaic': return mosaicSlots(frame, count, gap);
    case 'filmstrip': return filmstripSlots(frame, count, gap);
    case 'stack': return stackSlots(frame, count);
    case 'scatter': return scatterSlots(frame, count, gap, seed);
    default: return gridSlots(frame, count, gap);
  }
}

/**
 * The frame a collage should occupy: the artboard inset by a margin.
 *
 * Covers get cropped by every store and player that shows them, so a collage
 * that runs to the bleed loses its outer images. The default 8% inset matches
 * the safe-area guide the canvas already draws.
 */
export function collageFrame(
  artboard: { width: number; height: number },
  insetPct = 0.08,
): { x: number; y: number; width: number; height: number } {
  const inset = Math.round(Math.min(artboard.width, artboard.height) * insetPct);
  return {
    x: inset,
    y: inset,
    width: artboard.width - inset * 2,
    height: artboard.height - inset * 2,
  };
}
