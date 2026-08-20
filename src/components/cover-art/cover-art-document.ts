import type { CoverArtTemplateId, CoverArtWaveformStyle } from '@/design-system';
import {
  barRect, barSlots, buildWaveformSeries, capRadius, circularSegments, isBarMode,
  pointsAttribute, suggestedBarCount, waveformPathPoints, type WaveformMode,
} from '@/lib/cover/waveform';

export type { WaveformMode } from '@/lib/cover/waveform';

export type CoverArtTool =
  | 'source'
  | 'directions'
  | 'media'
  | 'typography'
  | 'elements'
  | 'textures'
  | 'waveform'
  | 'brand'
  | 'history';

export type ArtworkLayerType = 'text' | 'shape' | 'waveform' | 'texture' | 'image';

export type ArtworkLayerBase = {
  id: string;
  name: string;
  type: ArtworkLayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  blendMode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light';
};

export type TextArtworkLayer = ArtworkLayerBase & {
  type: 'text';
  text: string;
  /**
   * `brand` is Akira Expanded — the face the app's own "U2C Beatstore" mark is
   * set in. It needed its own role because Akira only ever appeared as a
   * fallback behind Synkopy in the other stacks, so it never actually rendered.
   */
  fontFamily: 'display' | 'artwork' | 'ui' | 'mono' | 'brand';
  fontSize: number;
  tracking: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  uppercase: boolean;
  color: string;
  /** Outline colour. Undefined means no outline, which is the common case. */
  stroke?: string;
  strokeWidth?: number;
};

export type ShapeArtworkLayer = ArtworkLayerBase & {
  type: 'shape';
  shape: 'rect' | 'circle' | 'rule' | 'triangle';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  /** Corner rounding in document units. Ignored by non-rect shapes. */
  cornerRadius?: number;
};

export type WaveformArtworkLayer = ArtworkLayerBase & {
  type: 'waveform';
  /**
   * `linear` and `spectral-bars` predate the rest and are kept so saved
   * documents keep opening; both draw mirrored bars now.
   */
  mode: WaveformMode;
  style: CoverArtWaveformStyle;
  amplitude: number;
  strokeWidth: number;
  smoothing: number;
  color: string;
  bpm?: number | null;
  durationSeconds?: number | null;
  peakSource: 'real' | 'preview';
  peaks: number[];
  /** Bars drawn across the layer. Optional so older documents still load. */
  barCount?: number;
  /** Space between bars as a fraction of each slot, 0..0.9. */
  barGap?: number;
  cap?: 'flat' | 'round';
  /** Lift the loudest peak to full height. */
  normalize?: boolean;
  /** Mirror around the centreline. Off hangs bars from the baseline. */
  mirror?: boolean;
};

/** Defaults for the fields added after the first version of this layer. */
export function waveformDefaults(layer: WaveformArtworkLayer) {
  return {
    barCount: layer.barCount ?? suggestedBarCount(layer.width),
    barGap: layer.barGap ?? 0.3,
    cap: layer.cap ?? 'round',
    normalize: layer.normalize ?? true,
    mirror: layer.mirror ?? true,
  } as const;
}

/**
 * The drawable series for a waveform layer.
 *
 * Single source of truth for both renderers — the canvas and the SVG exporter
 * call this, so a waveform cannot look one way on screen and another in the
 * exported file.
 */
export function waveformSeriesFor(layer: WaveformArtworkLayer): number[] {
  const { barCount, normalize } = waveformDefaults(layer);
  const count = layer.mode === 'circular'
    // A dense circle turns into a solid ring; keep spokes countable.
    ? Math.min(barCount, 180)
    : barCount;
  return buildWaveformSeries({
    peaks: layer.peaks,
    count,
    smoothing: layer.smoothing,
    normalize,
    amplitude: layer.amplitude,
  });
}

export const artworkTextureKinds = [
  'paper-grain',
  'basalt-noise',
  'scan-grain',
  'halftone',
  'crosshatch',
  'vignette',
] as const;

export type ArtworkTextureKind = (typeof artworkTextureKinds)[number];

export type TextureArtworkLayer = ArtworkLayerBase & {
  type: 'texture';
  texture: ArtworkTextureKind;
  intensity: number;
};

export const artworkImageTreatments = [
  'normal',
  'duotone',
  'mineral-tint',
  'high-contrast',
  'grayscale',
  'bleach',
] as const;

export type ArtworkImageTreatment = (typeof artworkImageTreatments)[number];

export const artworkImageMasks = ['none', 'circle', 'arch', 'diamond'] as const;

export type ArtworkImageMask = (typeof artworkImageMasks)[number];

export type ImageArtworkLayer = ArtworkLayerBase & {
  type: 'image';
  src?: string;
  label: string;
  treatment: ArtworkImageTreatment;
  /**
   * Crop behaviour inside the layer frame. `cover` fills and crops, `contain`
   * fits the whole image inside, `fill` stretches. Optional so documents saved
   * before cropping existed still load; every read goes through
   * `imageCropDefaults`.
   */
  fit?: 'cover' | 'contain' | 'fill';
  /** Pan within the frame, -1..1, 0 centred. Only meaningful when scale > 1. */
  offsetX?: number;
  offsetY?: number;
  /** Zoom on top of `fit`. 1 = no extra zoom. */
  scale?: number;
  /** Corner rounding in document units. */
  radius?: number;
  mask?: ArtworkImageMask;
};

/**
 * Crop fields are optional on the layer so older documents keep loading, but
 * every consumer wants concrete numbers. This is the single place that decides
 * what "unset" means, so the canvas preview and the SVG export cannot drift
 * apart — which is exactly how the on-canvas image and the exported image
 * ended up disagreeing before.
 */
export function imageCropDefaults(layer: ImageArtworkLayer) {
  return {
    fit: layer.fit ?? 'cover',
    offsetX: layer.offsetX ?? 0,
    offsetY: layer.offsetY ?? 0,
    scale: layer.scale ?? 1,
    radius: layer.radius ?? 0,
    mask: layer.mask ?? 'none',
  } as const;
}

/**
 * Geometry of the <image> inside its frame, given fit/scale/pan.
 *
 * Shared by the canvas and the exporter. Pan is expressed as a fraction of the
 * overflow the zoom creates: 0 centres the image, +1 pushes it fully to one
 * edge, and when scale is 1 there is no overflow so pan is a no-op by
 * construction rather than by a special case.
 */
export function imageFrameRect(layer: ImageArtworkLayer) {
  const { scale, offsetX, offsetY } = imageCropDefaults(layer);
  const width = layer.width * scale;
  const height = layer.height * scale;
  const overflowX = width - layer.width;
  const overflowY = height - layer.height;
  return {
    x: -overflowX / 2 + (offsetX * overflowX) / 2,
    y: -overflowY / 2 + (offsetY * overflowY) / 2,
    width,
    height,
  };
}

/** `preserveAspectRatio` value matching a fit mode. */
export function imagePreserveAspectRatio(fit: 'cover' | 'contain' | 'fill') {
  if (fit === 'fill') return 'none';
  if (fit === 'contain') return 'xMidYMid meet';
  return 'xMidYMid slice';
}

/** CSS `object-fit` matching a fit mode, for the canvas preview. */
export function imageObjectFit(fit: 'cover' | 'contain' | 'fill'): 'cover' | 'contain' | 'fill' {
  return fit;
}

export type ArtworkLayer =
  | TextArtworkLayer
  | ShapeArtworkLayer
  | WaveformArtworkLayer
  | TextureArtworkLayer
  | ImageArtworkLayer;

export type ArtworkPalette = {
  background: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  secondary: string;
  waveformLow: string;
  waveformHigh: string;
};

export type ArtworkSource = {
  kind: 'track' | 'project' | 'playlist' | 'upload' | 'empty';
  id?: string;
  label: string;
  detail?: string;
};

export type ArtworkDocument = {
  id: string;
  name: string;
  version: number;
  width: number;
  height: number;
  background: string;
  palette: ArtworkPalette;
  templateId: CoverArtTemplateId;
  directionId: CoverArtDirectionId;
  source: ArtworkSource;
  layers: ArtworkLayer[];
  createdAt: string;
  updatedAt: string;
};

export type CoverArtDirectionId =
  | 'brutalist-archive'
  | 'de-roche-mineral'
  | 'industrial-editorial'
  | 'spectral-night';

export type CoverArtDirection = {
  id: CoverArtDirectionId;
  name: string;
  templateId: CoverArtTemplateId;
  palette: ArtworkPalette;
  typography: string;
  material: string;
  rationale: string;
};

export const defaultArtworkPalette: ArtworkPalette = {
  background: '#090907',
  panel: '#0D0D0A',
  text: '#F2F2F0',
  muted: '#6E6E6B',
  accent: '#F2F2F0',
  secondary: '#A95235',
  waveformLow: '#6E6E6B',
  waveformHigh: '#F2F2F0',
};

/**
 * The four house looks.
 *
 * All neutral: they separate by value and contrast — bone paper, deep mineral,
 * hard white, dim silver — rather than by hue. The studio previously carried a
 * warm palette of its own that appeared nowhere else in the app, which made the
 * whole surface read brown next to the near-black, silver-on-black chrome
 * everything else uses.
 */
export const coverArtDirections: CoverArtDirection[] = [
  {
    id: 'brutalist-archive',
    name: 'Brutalist Archive',
    templateId: 'de-roche-archive',
    palette: { ...defaultArtworkPalette, background: '#090907', panel: '#E8E8E6', text: '#F2F2F0', accent: '#F2F2F0', secondary: '#6E6E6B' },
    typography: 'Compressed editorial title with restrained metadata.',
    material: 'Paper grain, crop marks, archival catalogue spacing.',
    rationale: 'Best for beats that need a serious collector-grade sleeve.',
  },
  {
    id: 'de-roche-mineral',
    name: 'De Roche Mineral',
    templateId: 'image-mask',
    palette: { ...defaultArtworkPalette, background: '#090907', panel: '#0D0D0A', accent: '#D8D8D5', secondary: '#4A4A47' },
    typography: 'Quiet luxury display type balanced with clean UI labels.',
    material: 'Stone tint, masked imagery, mineral edge contrast.',
    rationale: 'Turns cover art into a dark mineral object without losing readability.',
  },
  {
    id: 'industrial-editorial',
    name: 'Industrial Editorial',
    templateId: 'poster-deconstruction',
    palette: { ...defaultArtworkPalette, background: '#090907', accent: '#FFFFFF', secondary: '#8A8A87' },
    typography: 'Large offset display text with utility metadata rails.',
    material: 'Halftone structure, rules, stamped production labels.',
    rationale: 'Useful for aggressive records that need motion and pressure.',
  },
  {
    id: 'spectral-night',
    name: 'Spectral Night',
    templateId: 'dark-listening-room',
    palette: { ...defaultArtworkPalette, background: '#090907', accent: '#B8B8B5', secondary: '#3A3A38' },
    typography: 'Centered artwork display with a low-lit waveform field.',
    material: 'Nocturne image treatment, spectral band accents.',
    rationale: 'Keeps the artwork cinematic while making audio feel visible.',
  },
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled';
}

function layerId(directionId: CoverArtDirectionId, source: ArtworkSource, prefix: string) {
  return `${slug(directionId)}-${slug(source.id ?? source.label)}-${prefix}`;
}

export function createArtworkDocument(
  directionId: CoverArtDirectionId,
  source: ArtworkSource,
  now = new Date('2026-07-25T00:00:00.000Z'),
): ArtworkDocument {
  const direction = coverArtDirections.find((item) => item.id === directionId) ?? coverArtDirections[1];
  const timestamp = now.toISOString();
  const name = source.kind === 'empty' ? 'Untitled cover' : `${source.label} cover`;

  return {
    id: `cover-${slug(direction.id)}-${slug(source.id ?? source.label)}`,
    name,
    version: 1,
    width: 3000,
    height: 3000,
    background: direction.palette.background,
    palette: direction.palette,
    templateId: direction.templateId,
    directionId: direction.id,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
    layers: [
      {
        id: layerId(direction.id, source, 'background'),
        name: 'Background Field',
        type: 'shape',
        x: 0,
        y: 0,
        width: 3000,
        height: 3000,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: true,
        zIndex: 0,
        blendMode: 'normal',
        shape: 'rect',
        fill: direction.palette.background,
      },
      {
        id: layerId(direction.id, source, 'image'),
        name: 'Artwork Image',
        type: 'image',
        x: 420,
        y: 420,
        width: 2160,
        height: 1580,
        rotation: 0,
        opacity: 0.72,
        visible: true,
        locked: false,
        zIndex: 1,
        blendMode: 'soft-light',
        label: 'Imported image placeholder',
        treatment: direction.id === 'industrial-editorial' ? 'high-contrast' : 'mineral-tint',
      },
      {
        id: layerId(direction.id, source, 'waveform'),
        name: 'Spectral Waveform',
        type: 'waveform',
        x: 350,
        y: 2010,
        width: 2300,
        height: 320,
        rotation: 0,
        opacity: 0.86,
        visible: true,
        locked: false,
        zIndex: 2,
        blendMode: 'screen',
        mode: direction.id === 'spectral-night' ? 'mirror' : 'linear',
        style: direction.id === 'brutalist-archive' ? 'document-rule' : 'low-scanline',
        amplitude: 0.92,
        strokeWidth: 16,
        // Light smoothing only: the point of peak-per-bucket resampling is that
        // transients survive, and heavy smoothing throws them away again.
        smoothing: 0.12,
        // The artwork's own accent, not the stock blue/teal. Two cool colours
        // striped across a warm cover is what made the old waveform read as
        // clip art rather than part of the design.
        color: direction.palette.accent,
        barCount: 132,
        barGap: 0.32,
        cap: 'round',
        normalize: true,
        mirror: true,
        bpm: source.kind === 'track' && source.detail?.includes('BPM') ? Number.parseInt(source.detail, 10) : null,
        durationSeconds: null,
        peakSource: 'preview',
        peaks: createPreviewPeaks(source.label, 96),
      },
      {
        id: layerId(direction.id, source, 'title'),
        name: 'Main Title',
        type: 'text',
        x: 360,
        y: 360,
        width: 2280,
        height: 620,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        zIndex: 3,
        blendMode: 'normal',
        text: source.kind === 'empty' ? 'MIDNIGHT CARTEL' : source.label,
        fontFamily: 'artwork',
        fontSize: 220,
        tracking: -4,
        lineHeight: 0.92,
        align: direction.id === 'spectral-night' ? 'center' : 'left',
        uppercase: true,
        color: direction.palette.text,
      },
      {
        id: layerId(direction.id, source, 'artist'),
        name: 'Artist Name',
        type: 'text',
        x: 360,
        y: 2470,
        width: 1320,
        height: 140,
        rotation: 0,
        opacity: 0.9,
        visible: true,
        locked: false,
        zIndex: 4,
        blendMode: 'normal',
        text: 'UCHE',
        // Same face as the app's own brand mark, and the same 0.22em tracking
        // it carries, so the producer name reads as the same identity.
        fontFamily: 'brand',
        fontSize: 82,
        tracking: 18,
        lineHeight: 1,
        align: 'left',
        uppercase: true,
        color: direction.palette.accent,
      },
      {
        id: layerId(direction.id, source, 'meta'),
        name: 'Metadata Label',
        type: 'text',
        x: 1780,
        y: 2470,
        width: 860,
        height: 140,
        rotation: 0,
        opacity: 0.78,
        visible: true,
        locked: false,
        zIndex: 5,
        blendMode: 'normal',
        text: source.detail ?? '144 BPM / F MINOR',
        fontFamily: 'mono',
        fontSize: 54,
        tracking: 8,
        lineHeight: 1,
        align: 'right',
        uppercase: true,
        color: direction.palette.muted,
      },
      {
        id: layerId(direction.id, source, 'texture'),
        name: 'Paper Texture',
        type: 'texture',
        x: 0,
        y: 0,
        width: 3000,
        height: 3000,
        rotation: 0,
        opacity: 0.18,
        visible: true,
        locked: false,
        zIndex: 6,
        blendMode: 'overlay',
        texture: direction.id === 'spectral-night' ? 'basalt-noise' : 'paper-grain',
        intensity: 0.34,
      },
    ],
  } satisfies ArtworkDocument;
}

export function sortArtworkLayers(layers: ArtworkLayer[]) {
  return [...layers].sort((a, b) => a.zIndex - b.zIndex);
}

export function moveLayer(layers: ArtworkLayer[], id: string, delta: -1 | 1) {
  const sorted = sortArtworkLayers(layers);
  const index = sorted.findIndex((layer) => layer.id === id);
  const nextIndex = index + delta;
  if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return layers;

  const next = [...sorted];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next.map((layer, zIndex) => ({ ...layer, zIndex }));
}

/**
 * Deterministic stand-in peaks for a document with no analysed track.
 *
 * Seeded from the source label so the same beat always previews with the same
 * shape — a waveform that reshuffles on every render reads as a bug, and the
 * producer would be positioning against something that will not persist.
 */
export function createPreviewPeaks(seedText: string, count: number) {
  let seed = 0;
  for (let i = 0; i < seedText.length; i += 1) seed = (Math.imul(31, seed) + seedText.charCodeAt(i)) | 0;
  return Array.from({ length: count }, (_, index) => {
    const pulse = Math.abs(Math.sin(index * 0.62 + seed * 0.0001));
    const kick = index % 8 === 0 ? 0.94 : 0;
    const hat = index % 2 === 1 ? 0.22 : 0;
    return Math.min(1, Math.max(0.08, pulse * 0.54 + kick + hat));
  });
}

export function updateWaveformLayerPeaks(
  layers: ArtworkLayer[],
  peaks: number[],
  peakSource: WaveformArtworkLayer['peakSource'],
  bpm?: number | null,
  durationSeconds?: number | null,
) {
  return layers.map((layer) => (
    layer.type === 'waveform'
      ? { ...layer, peaks, peakSource, bpm: bpm ?? layer.bpm ?? null, durationSeconds: durationSeconds ?? layer.durationSeconds ?? null }
      : layer
  ));
}

/** One channel of a hex colour as a 0..1 value, for SVG filter tables. */
export function hexChannel(hex: string, channel: 0 | 1 | 2): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return channel === 0 ? '0' : '0';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const v = parseInt(h.slice(channel * 2, channel * 2 + 2), 16) / 255;
  return v.toFixed(3);
}

/** Maps an image layer's treatment to the matching filter defined in <defs>. */
function imageTreatmentFilter(treatment: ArtworkImageTreatment): string {
  switch (treatment) {
    case 'duotone': return ' filter="url(#imgDuotone)"';
    case 'mineral-tint': return ' filter="url(#imgMineral)"';
    case 'high-contrast': return ' filter="url(#imgHighContrast)"';
    case 'grayscale': return ' filter="url(#imgGrayscale)"';
    case 'bleach': return ' filter="url(#imgBleach)"';
    default: return '';
  }
}

/**
 * The clip path for one image layer's frame.
 *
 * Cropping is done by clipping rather than by resizing the source: the image is
 * drawn larger than its frame and the frame shows a window onto it, which is
 * what pan/zoom cropping means. `mask` reuses the same mechanism for non-rect
 * windows, so a circular crop and a rectangular one take the same code path.
 */
function imageClipShape(layer: ImageArtworkLayer): string {
  const { mask, radius } = imageCropDefaults(layer);
  const w = layer.width;
  const h = layer.height;
  if (mask === 'circle') {
    return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" />`;
  }
  if (mask === 'diamond') {
    return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" />`;
  }
  if (mask === 'arch') {
    // Half-round top, square bottom — the sleeve/arch crop.
    const r = w / 2;
    return `<path d="M0 ${h} L0 ${r} A ${r} ${r} 0 0 1 ${w} ${r} L${w} ${h} Z" />`;
  }
  return `<rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" />`;
}

/** SVG <pattern>/<radialGradient> body for each texture kind. */
function texturePatternDefs(palette: ArtworkPalette): string {
  return `
    <pattern id="texPaperGrain" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="${palette.text}" opacity="0.04" />
      <path d="M0 13H80M0 47H80M11 0V80M53 0V80" stroke="${palette.muted}" stroke-width="1" opacity="0.16" />
    </pattern>
    <pattern id="texBasaltNoise" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="${palette.panel}" opacity="0.10" />
      <circle cx="9" cy="14" r="2.4" fill="${palette.text}" opacity="0.20" />
      <circle cx="41" cy="7" r="1.6" fill="${palette.text}" opacity="0.14" />
      <circle cx="27" cy="38" r="3.1" fill="${palette.muted}" opacity="0.22" />
      <circle cx="52" cy="49" r="1.9" fill="${palette.text}" opacity="0.16" />
    </pattern>
    <pattern id="texScanGrain" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="3" fill="${palette.text}" opacity="0.10" />
    </pattern>
    <pattern id="texHalftone" width="16" height="16" patternUnits="userSpaceOnUse">
      <circle cx="4" cy="4" r="2.6" fill="${palette.text}" opacity="0.26" />
      <circle cx="12" cy="12" r="2.6" fill="${palette.text}" opacity="0.26" />
    </pattern>
    <pattern id="texCrosshatch" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M0 0L14 14M14 0L0 14" stroke="${palette.text}" stroke-width="1" opacity="0.20" />
    </pattern>
    <radialGradient id="texVignette" cx="50%" cy="50%" r="72%">
      <stop offset="55%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.85" />
    </radialGradient>`;
}

function textureFill(texture: ArtworkTextureKind): string {
  switch (texture) {
    case 'basalt-noise': return 'url(#texBasaltNoise)';
    case 'scan-grain': return 'url(#texScanGrain)';
    case 'halftone': return 'url(#texHalftone)';
    case 'crosshatch': return 'url(#texCrosshatch)';
    case 'vignette': return 'url(#texVignette)';
    default: return 'url(#texPaperGrain)';
  }
}

export function renderArtworkDocumentSvg(document: ArtworkDocument) {
  const fontFor = (layer: TextArtworkLayer) => {
    if (layer.fontFamily === 'mono') return 'Panchang, monospace';
    if (layer.fontFamily === 'ui') return 'Inter, sans-serif';
    if (layer.fontFamily === 'brand') return 'Akira Expanded, sans-serif';
    return 'Synkopy, Akira Expanded, sans-serif';
  };

  const escape = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

  const visibleLayers = sortArtworkLayers(document.layers).filter((layer) => layer.visible);

  // Clip paths are collected while rendering and emitted into <defs>, because
  // each image layer needs its own frame-shaped clip.
  const clipDefs: string[] = [];

  const layerMarkup = visibleLayers
    .map((layer) => {
      const transform = `translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width / 2} ${layer.height / 2})`;
      /**
       * Shared presentation attributes.
       *
       * Takes any extra CSS as an argument rather than letting callers append a
       * second `style=` attribute. Doing that produced `<text style="..."
       * ... style="font-weight:700">`, which is a duplicate attribute and makes
       * the whole SVG invalid XML — so it failed to load as an image and every
       * export of a cover containing text died with "Unable to load rendered
       * cover SVG for raster export."
       */
      const attrs = (extraStyle = '') => {
        const style = extraStyle ? `mix-blend-mode:${layer.blendMode};${extraStyle}` : `mix-blend-mode:${layer.blendMode}`;
        return `opacity="${layer.opacity}" style="${style}" transform="${transform}"`;
      };
      const common = attrs();

      if (layer.type === 'shape') {
        if (layer.shape === 'circle') {
          return `<ellipse ${common} cx="${layer.width / 2}" cy="${layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${layer.fill}" stroke="${layer.stroke ?? 'none'}" stroke-width="${layer.strokeWidth ?? 0}" />`;
        }
        if (layer.shape === 'triangle') {
          const points = `${layer.width / 2},0 ${layer.width},${layer.height} 0,${layer.height}`;
          return `<polygon ${common} points="${points}" fill="${layer.fill}" stroke="${layer.stroke ?? 'none'}" stroke-width="${layer.strokeWidth ?? 0}" />`;
        }
        const radius = layer.cornerRadius ?? 0;
        return `<rect ${common} width="${layer.width}" height="${layer.height}" rx="${radius}" ry="${radius}" fill="${layer.fill}" stroke="${layer.stroke ?? 'none'}" stroke-width="${layer.strokeWidth ?? 0}" />`;
      }

      if (layer.type === 'image') {
        // Render the actual artwork when the layer has one. `src` existed on
        // the type but was never read here, so every image layer — including a
        // generated or uploaded cover — drew as the grey placeholder box
        // forever.
        if (layer.src) {
          const { fit } = imageCropDefaults(layer);
          const rect = imageFrameRect(layer);
          const clipId = `clip-${layer.id}`;
          clipDefs.push(`<clipPath id="${clipId}">${imageClipShape(layer)}</clipPath>`);
          return `<g ${common} clip-path="url(#${clipId})">`
            + `<image x="${rect.x.toFixed(2)}" y="${rect.y.toFixed(2)}" width="${rect.width.toFixed(2)}" height="${rect.height.toFixed(2)}" href="${escape(layer.src)}" preserveAspectRatio="${imagePreserveAspectRatio(fit)}"${imageTreatmentFilter(layer.treatment)} />`
            + `</g>`;
        }
        return `<rect ${common} width="${layer.width}" height="${layer.height}" fill="${document.palette.panel}" stroke="${document.palette.accent}" stroke-width="4" /><text ${common} x="${layer.width / 2}" y="${layer.height / 2}" text-anchor="middle" dominant-baseline="middle" fill="${document.palette.muted}" font-size="64" font-family="Panchang, monospace">${escape(layer.label)}</text>`;
      }

      if (layer.type === 'waveform') {
        const { barGap, cap, mirror } = waveformDefaults(layer);
        const values = waveformSeriesFor(layer);

        if (layer.mode === 'circular') {
          const size = Math.min(layer.width, layer.height);
          const spokes = circularSegments(values, size)
            .map((segment) => `<line x1="${segment.x1.toFixed(2)}" y1="${segment.y1.toFixed(2)}" x2="${segment.x2.toFixed(2)}" y2="${segment.y2.toFixed(2)}" stroke="${layer.color}" stroke-width="${Math.max(1, layer.strokeWidth / 3)}" stroke-linecap="${cap === 'round' ? 'round' : 'butt'}" />`)
            .join('');
          // Centred so a non-square layer still puts the disc in the middle.
          const offsetX = (layer.width - size) / 2;
          const offsetY = (layer.height - size) / 2;
          return `<g ${common}><g transform="translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)})">${spokes}</g></g>`;
        }

        if (layer.mode === 'contour') {
          const points = pointsAttribute(waveformPathPoints(values, layer.width, layer.height, true));
          return `<g ${common}><polygon points="${points}" fill="${layer.color}" /></g>`;
        }

        if (layer.mode === 'line') {
          const points = pointsAttribute(waveformPathPoints(values, layer.width, layer.height, false));
          return `<g ${common}><polyline points="${points}" fill="none" stroke="${layer.color}" stroke-width="${Math.max(1, layer.strokeWidth / 2)}" stroke-linejoin="round" stroke-linecap="round" /></g>`;
        }

        // Every remaining mode draws bars. `blocks` squares them off and drops
        // the gap for a solid, printed-block look.
        const blocks = layer.mode === 'blocks';
        const slots = barSlots(layer.width, values.length, blocks ? 0.08 : barGap);
        const bars = slots.map((slot, index) => {
          const rect = barRect(slot, values[index], layer.height, mirror);
          const radius = blocks ? 0 : capRadius(rect, cap);
          return `<rect x="${rect.x.toFixed(2)}" y="${rect.y.toFixed(2)}" width="${rect.width.toFixed(2)}" height="${rect.height.toFixed(2)}" rx="${radius.toFixed(2)}" ry="${radius.toFixed(2)}" fill="${layer.color}" />`;
        }).join('');
        return `<g ${common}>${bars}</g>`;
      }

      if (layer.type === 'texture') {
        return `<rect ${common} width="${layer.width}" height="${layer.height}" fill="${textureFill(layer.texture)}" />`;
      }

      const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
      const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start';
      const x = layer.align === 'center' ? layer.width / 2 : layer.align === 'right' ? layer.width : 0;
      // Multi-line text: SVG has no wrapping, so explicit newlines become
      // <tspan> rows. Without this a two-line title rendered as one long line
      // in the export while the canvas showed two.
      const lines = text.split('\n');
      const stroke = layer.stroke && (layer.strokeWidth ?? 0) > 0
        ? ` stroke="${layer.stroke}" stroke-width="${layer.strokeWidth}" paint-order="stroke"`
        : '';
      const tspans = lines
        .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : layer.fontSize * layer.lineHeight}">${escape(line)}</tspan>`)
        .join('');
      return `<text ${attrs('font-weight:700')} y="${layer.fontSize}" text-anchor="${anchor}" fill="${layer.color}"${stroke} font-size="${layer.fontSize}" font-family="${fontFor(layer)}" letter-spacing="${layer.tracking}">${tspans}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.width}" height="${document.height}" viewBox="0 0 ${document.width} ${document.height}">
  <defs>
    <pattern id="paperGrain" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="${document.palette.text}" opacity="0.04" />
      <path d="M0 13H80M0 47H80M11 0V80M53 0V80" stroke="${document.palette.muted}" stroke-width="1" opacity="0.16" />
    </pattern>${texturePatternDefs(document.palette)}
    ${clipDefs.join('\n    ')}
    <filter id="imgDuotone">
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="${hexChannel(document.palette.background, 0)} ${hexChannel(document.palette.accent, 0)}" />
        <feFuncG type="table" tableValues="${hexChannel(document.palette.background, 1)} ${hexChannel(document.palette.accent, 1)}" />
        <feFuncB type="table" tableValues="${hexChannel(document.palette.background, 2)} ${hexChannel(document.palette.accent, 2)}" />
      </feComponentTransfer>
    </filter>
    <filter id="imgMineral">
      <feColorMatrix type="saturate" values="0.35" />
    </filter>
    <filter id="imgHighContrast">
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.6" intercept="-0.3" />
        <feFuncG type="linear" slope="1.6" intercept="-0.3" />
        <feFuncB type="linear" slope="1.6" intercept="-0.3" />
      </feComponentTransfer>
    </filter>
    <filter id="imgGrayscale">
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <filter id="imgBleach">
      <feColorMatrix type="saturate" values="0.15" />
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.15" intercept="0.12" />
        <feFuncG type="linear" slope="1.15" intercept="0.12" />
        <feFuncB type="linear" slope="1.15" intercept="0.10" />
      </feComponentTransfer>
    </filter>
  </defs>
  <rect width="${document.width}" height="${document.height}" fill="${document.background}" />
  ${layerMarkup}
</svg>`;
}

/* ── Layer factories ───────────────────────────────────────────────────────
 *
 * Every "Add …" action in the studio comes through here. Centralising it means
 * a new layer is always well-formed — the old editor had no add path at all, so
 * the only layers that ever existed were the seven a template produced, and
 * anything the producer wanted beyond that was impossible.
 *
 * New layers land centred in the artboard at a readable size rather than at
 * 0,0 — a layer you have to hunt for reads as a bug.
 */

function nextZIndex(layers: ArtworkLayer[]) {
  return layers.reduce((max, layer) => Math.max(max, layer.zIndex), -1) + 1;
}

function freshId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function layerBase(
  document: ArtworkDocument,
  type: ArtworkLayerType,
  name: string,
  width: number,
  height: number,
): ArtworkLayerBase {
  return {
    id: freshId(type),
    name,
    type,
    x: Math.round((document.width - width) / 2),
    y: Math.round((document.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: nextZIndex(document.layers),
    blendMode: 'normal',
  };
}

export function createTextLayer(
  document: ArtworkDocument,
  text = 'NEW TEXT',
  overrides: Partial<TextArtworkLayer> = {},
): TextArtworkLayer {
  return {
    ...layerBase(document, 'text', 'Text', Math.round(document.width * 0.72), 320),
    type: 'text',
    text,
    fontFamily: 'artwork',
    fontSize: 200,
    tracking: -2,
    lineHeight: 0.98,
    align: 'left',
    uppercase: true,
    color: document.palette.text,
    ...overrides,
  };
}

export function createImageLayer(
  document: ArtworkDocument,
  src: string,
  label = 'Image',
  overrides: Partial<ImageArtworkLayer> = {},
): ImageArtworkLayer {
  const size = Math.round(document.width * 0.56);
  return {
    ...layerBase(document, 'image', label, size, size),
    type: 'image',
    src,
    label,
    treatment: 'normal',
    fit: 'cover',
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    radius: 0,
    mask: 'none',
    ...overrides,
  };
}

export function createShapeLayer(
  document: ArtworkDocument,
  shape: ShapeArtworkLayer['shape'] = 'rect',
  overrides: Partial<ShapeArtworkLayer> = {},
): ShapeArtworkLayer {
  const width = shape === 'rule' ? Math.round(document.width * 0.68) : Math.round(document.width * 0.42);
  const height = shape === 'rule' ? 12 : Math.round(document.width * 0.42);
  return {
    ...layerBase(document, 'shape', shape === 'rule' ? 'Rule' : shape === 'circle' ? 'Circle' : shape === 'triangle' ? 'Triangle' : 'Rectangle', width, height),
    type: 'shape',
    shape,
    fill: document.palette.accent,
    cornerRadius: 0,
    ...overrides,
  };
}

export function createTextureLayer(
  document: ArtworkDocument,
  texture: ArtworkTextureKind = 'paper-grain',
  overrides: Partial<TextureArtworkLayer> = {},
): TextureArtworkLayer {
  return {
    ...layerBase(document, 'texture', 'Texture', document.width, document.height),
    type: 'texture',
    x: 0,
    y: 0,
    texture,
    intensity: 0.34,
    opacity: 0.18,
    blendMode: 'overlay',
    ...overrides,
  };
}

export function createWaveformLayer(
  document: ArtworkDocument,
  overrides: Partial<WaveformArtworkLayer> = {},
): WaveformArtworkLayer {
  const existing = document.layers.find((layer): layer is WaveformArtworkLayer => layer.type === 'waveform');
  return {
    ...layerBase(document, 'waveform', 'Waveform', Math.round(document.width * 0.76), 320),
    type: 'waveform',
    mode: 'linear',
    style: 'low-scanline',
    amplitude: 0.92,
    strokeWidth: 16,
    smoothing: 0.12,
    color: document.palette.accent,
    barCount: suggestedBarCount(Math.round(document.width * 0.76)),
    barGap: 0.32,
    cap: 'round',
    normalize: true,
    mirror: true,
    // Reuse peaks already loaded for this document so a second waveform layer
    // shows the real track rather than dropping back to the synthetic pattern.
    bpm: existing?.bpm ?? null,
    durationSeconds: existing?.durationSeconds ?? null,
    peakSource: existing?.peakSource ?? 'preview',
    peaks: existing?.peaks ?? createPreviewPeaks(document.name, 96),
    ...overrides,
  };
}

/* ── Document operations ───────────────────────────────────────────────── */

export function addLayer(document: ArtworkDocument, layer: ArtworkLayer): ArtworkDocument {
  return { ...document, layers: [...document.layers, layer], updatedAt: new Date().toISOString() };
}

/** Locked layers are skipped rather than deleted — that is what the lock is for. */
export function removeLayers(document: ArtworkDocument, ids: string[]): ArtworkDocument {
  const removable = new Set(
    document.layers.filter((layer) => ids.includes(layer.id) && !layer.locked).map((layer) => layer.id),
  );
  if (removable.size === 0) return document;
  return {
    ...document,
    layers: document.layers.filter((layer) => !removable.has(layer.id)),
    updatedAt: new Date().toISOString(),
  };
}

/** Copies are offset so the duplicate is visibly on top, not hidden underneath. */
export function duplicateLayers(
  document: ArtworkDocument,
  ids: string[],
  offset = 80,
): { document: ArtworkDocument; ids: string[] } {
  const originals = document.layers.filter((layer) => ids.includes(layer.id));
  if (originals.length === 0) return { document, ids: [] };

  let z = nextZIndex(document.layers);
  const clones = originals.map((layer) => {
    const clone = {
      ...structuredClone(layer),
      id: freshId(`${layer.type}-copy`),
      name: `${layer.name} copy`,
      x: layer.x + offset,
      y: layer.y + offset,
      locked: false,
      zIndex: z,
    } as ArtworkLayer;
    z += 1;
    return clone;
  });

  return {
    document: { ...document, layers: [...document.layers, ...clones], updatedAt: new Date().toISOString() },
    ids: clones.map((layer) => layer.id),
  };
}

export type LayerReorder = 'front' | 'back' | 'forward' | 'backward';

export function reorderLayer(layers: ArtworkLayer[], id: string, move: LayerReorder): ArtworkLayer[] {
  if (move === 'forward') return moveLayer(layers, id, 1);
  if (move === 'backward') return moveLayer(layers, id, -1);

  const sorted = sortArtworkLayers(layers);
  const target = sorted.find((layer) => layer.id === id);
  if (!target) return layers;
  const rest = sorted.filter((layer) => layer.id !== id);
  const next = move === 'front' ? [...rest, target] : [target, ...rest];
  return next.map((layer, zIndex) => ({ ...layer, zIndex }));
}

export type LayerAlignment = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/**
 * Align layers to the artboard when one is selected, or to the selection's own
 * bounding box when several are. That is the behaviour every design tool has,
 * and the one that makes "align left" useful in both situations.
 */
export function alignLayers(
  document: ArtworkDocument,
  ids: string[],
  alignment: LayerAlignment,
): ArtworkDocument {
  const targets = document.layers.filter((layer) => ids.includes(layer.id) && !layer.locked);
  if (targets.length === 0) return document;

  const bounds = targets.length > 1
    ? {
      left: Math.min(...targets.map((layer) => layer.x)),
      top: Math.min(...targets.map((layer) => layer.y)),
      right: Math.max(...targets.map((layer) => layer.x + layer.width)),
      bottom: Math.max(...targets.map((layer) => layer.y + layer.height)),
    }
    : { left: 0, top: 0, right: document.width, bottom: document.height };

  const moved = new Map(targets.map((layer) => {
    switch (alignment) {
      case 'left': return [layer.id, { x: bounds.left }];
      case 'right': return [layer.id, { x: bounds.right - layer.width }];
      case 'center-x': return [layer.id, { x: Math.round((bounds.left + bounds.right - layer.width) / 2) }];
      case 'top': return [layer.id, { y: bounds.top }];
      case 'bottom': return [layer.id, { y: bounds.bottom - layer.height }];
      case 'center-y': return [layer.id, { y: Math.round((bounds.top + bounds.bottom - layer.height) / 2) }];
      default: return [layer.id, {}];
    }
  }));

  return {
    ...document,
    layers: document.layers.map((layer) => (moved.has(layer.id) ? { ...layer, ...moved.get(layer.id) } : layer)),
    updatedAt: new Date().toISOString(),
  };
}

/** Even gaps between three or more layers along one axis. */
export function distributeLayers(
  document: ArtworkDocument,
  ids: string[],
  axis: 'x' | 'y',
): ArtworkDocument {
  const targets = document.layers
    .filter((layer) => ids.includes(layer.id) && !layer.locked)
    .sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y));
  if (targets.length < 3) return document;

  const sizeKey = axis === 'x' ? 'width' : 'height';
  const first = targets[0];
  const last = targets[targets.length - 1];
  const span = (last[axis] + last[sizeKey]) - first[axis];
  const used = targets.reduce((total, layer) => total + layer[sizeKey], 0);
  const gap = (span - used) / (targets.length - 1);

  let cursor = first[axis];
  const placed = new Map<string, number>();
  targets.forEach((layer) => {
    placed.set(layer.id, Math.round(cursor));
    cursor += layer[sizeKey] + gap;
  });

  return {
    ...document,
    layers: document.layers.map((layer) => (
      placed.has(layer.id) ? { ...layer, [axis]: placed.get(layer.id)! } : layer
    )),
    updatedAt: new Date().toISOString(),
  };
}
