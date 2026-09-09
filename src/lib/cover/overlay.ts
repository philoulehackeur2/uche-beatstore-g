/**
 * Grid and safe-area overlays.
 *
 * Both are drawing aids the exporter must never see. Ruler guides need a test
 * to enforce that, because they live ON the document; these deliberately do
 * not. They are view state held by the studio, so `renderArtworkDocumentSvg`
 * is not given them and cannot draw them by mistake. An overlay describes how
 * you are *looking* at the artwork, not the artwork.
 *
 * The maths is here rather than in the canvas because it is the part that can
 * be wrong in a way you would not notice: an off-by-one in the line list draws
 * a grid that is a hair asymmetric, and a crop rect computed with the aspect
 * test inverted looks plausible until the day it matters.
 */

import type { Rect } from './geometry';

/* ── Grid ──────────────────────────────────────────────────────────────── */

/**
 * The grid divides the artboard rather than stepping in fixed units. A cover
 * gets resized between 1400 and 3000 while it is being designed (see
 * `lib/cover/artboard.ts`), and a 100-unit grid means something different
 * either side of that; "eighths" does not change meaning.
 */
export const gridDivisionChoices = [3, 4, 6, 8, 12, 16] as const;

export type GridSettings = {
  visible: boolean;
  divisions: number;
  /** Snap layer edges to grid lines while dragging. */
  snap: boolean;
};

export const defaultGrid: GridSettings = { visible: false, divisions: 8, snap: false };

/**
 * Interior division lines along one axis, excluding both edges.
 *
 * The edges are omitted deliberately: the artboard already draws its own
 * border, and `collectSnapTargets` already contributes 0 and the extent, so
 * including them here would double-draw one and duplicate the other.
 */
export function gridLines(extent: number, divisions: number): number[] {
  if (!Number.isFinite(extent) || extent <= 0) return [];
  const count = Math.floor(divisions);
  if (!Number.isFinite(count) || count < 2) return [];

  const lines: number[] = [];
  for (let index = 1; index < count; index += 1) lines.push((extent * index) / count);
  return lines;
}

/**
 * Grid lines shaped for `collectSnapTargets`' guides argument.
 *
 * They ride the same channel as ruler guides rather than getting a pass of
 * their own, so `snapRect` keeps picking the single nearest line on each axis.
 * A separate grid pass would let a layer snap to a grid line on x and a guide
 * on y and land on neither.
 */
export function gridSnapLines(
  artboard: { width: number; height: number },
  grid: GridSettings,
): { x: number[]; y: number[] } {
  if (!grid.visible || !grid.snap) return { x: [], y: [] };
  return {
    x: gridLines(artboard.width, grid.divisions),
    y: gridLines(artboard.height, grid.divisions),
  };
}

/* ── Safe areas ────────────────────────────────────────────────────────── */

export type SafeAreaPreset = {
  id: string;
  label: string;
  hint: string;
  /**
   * `inset` pulls a margin in from every edge; `crop` shows the largest centred
   * rect of a given aspect ratio — what actually survives when a square cover
   * is re-cropped for somewhere it was not made for.
   */
  kind: 'inset' | 'crop';
  /** Fraction of the shorter side for `inset`; width÷height for `crop`. */
  value: number;
};

export const safeAreaPresets: SafeAreaPreset[] = [
  {
    id: 'title-safe',
    label: 'Title safe',
    hint: 'Keep type inside. Stores round the corners and lay controls over the edges.',
    kind: 'inset',
    value: 0.08,
  },
  {
    id: 'tight',
    label: 'Tight margin',
    hint: 'A 4% margin, for work that is meant to run close to the edge.',
    kind: 'inset',
    value: 0.04,
  },
  {
    id: 'crop-4-5',
    label: 'Crop 4:5',
    hint: 'What survives a portrait feed post.',
    kind: 'crop',
    value: 4 / 5,
  },
  {
    id: 'crop-16-9',
    label: 'Crop 16:9',
    hint: 'What survives a video thumbnail or a store banner.',
    kind: 'crop',
    value: 16 / 9,
  },
  {
    id: 'crop-9-16',
    label: 'Crop 9:16',
    hint: 'What survives a full-screen story.',
    kind: 'crop',
    value: 9 / 16,
  },
];

export function safeAreaById(id: string | null): SafeAreaPreset | null {
  if (!id) return null;
  return safeAreaPresets.find((preset) => preset.id === id) ?? null;
}

/**
 * The overlay rect in document units.
 *
 * An inset is a fraction of the SHORTER side, so a non-square artboard gets an
 * even margin all round. Taking it per-axis instead would draw a wider margin
 * on the long side, which is the opposite of what a margin is for.
 */
export function safeAreaRect(
  width: number,
  height: number,
  preset: SafeAreaPreset | null,
): Rect | null {
  if (!preset) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  if (preset.kind === 'inset') {
    const margin = Math.min(width, height) * Math.min(Math.max(preset.value, 0), 0.45);
    return {
      x: margin,
      y: margin,
      width: width - margin * 2,
      height: height - margin * 2,
    };
  }

  const aspect = preset.value;
  if (!Number.isFinite(aspect) || aspect <= 0) return null;

  const wide = width / height > aspect;
  const cropWidth = wide ? height * aspect : width;
  const cropHeight = wide ? height : width / aspect;

  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

/** True when the rect sits fully inside the safe area — the check the UI reports. */
export function withinSafeArea(rect: Rect, safe: Rect | null): boolean {
  if (!safe) return true;
  return rect.x >= safe.x
    && rect.y >= safe.y
    && rect.x + rect.width <= safe.x + safe.width
    && rect.y + rect.height <= safe.y + safe.height;
}
