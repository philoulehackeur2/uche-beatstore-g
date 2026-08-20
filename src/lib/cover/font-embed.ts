/**
 * Font embedding for cover art export.
 *
 * WHY THIS EXISTS. `svgToRasterBlob` rasterises by loading the SVG through
 * `new Image()`. An SVG loaded as an image renders in an isolated context: it
 * cannot see the page's stylesheets and cannot fetch external resources. So an
 * SVG that merely *names* `Synkopy` or `Akira Expanded` — which is all the
 * renderer did — exported with the browser's fallback sans-serif, and every
 * downloaded cover and every "set as cover" upload shipped in the wrong
 * typeface while the canvas showed the right one.
 *
 * The fix is to inline the fonts as base64 `@font-face` rules inside the SVG
 * itself. Data URIs are the one resource kind that isolated SVG rendering will
 * honour, which is the same reason images are inlined before export.
 *
 * Only the families a document actually uses get embedded — Synkopy alone is
 * 1.3 MB, so embedding all three unconditionally would triple export payloads
 * for a cover whose type is entirely Panchang.
 */

import type { ArtworkDocument, TextArtworkLayer } from '@/components/cover-art/cover-art-document';

/** The font roles a text layer can carry, mapped to real families and files. */
export type CoverFontFamily = 'Synkopy' | 'Akira Expanded' | 'Panchang';

export type CoverFontAsset = {
  family: CoverFontFamily;
  /** Public path, served from /public/fonts. */
  url: string;
  weight: number;
  format: string;
};

/**
 * Files backing each family.
 *
 * One weight per family on purpose: the SVG renderer writes
 * `style="font-weight:700"` on every text node, and shipping six Panchang cuts
 * to satisfy one bold would bloat the export for no visible gain. The chosen
 * cuts are the ones the artwork actually renders with.
 */
export const coverFontAssets: CoverFontAsset[] = [
  { family: 'Synkopy', url: '/fonts/Synkopy-Regular.otf', weight: 400, format: 'opentype' },
  { family: 'Akira Expanded', url: '/fonts/AkiraExpanded.otf', weight: 400, format: 'opentype' },
  { family: 'Panchang', url: '/fonts/Panchang-Bold.otf', weight: 700, format: 'opentype' },
];

/**
 * Families a font-role resolves to, in the order the SVG lists them.
 *
 * Mirrors `fontFor()` in the document renderer. Kept as data rather than parsed
 * out of the SVG string so the two cannot drift silently.
 */
export const fontRoleFamilies: Record<TextArtworkLayer['fontFamily'], CoverFontFamily[]> = {
  display: ['Synkopy', 'Akira Expanded'],
  artwork: ['Synkopy', 'Akira Expanded'],
  mono: ['Panchang'],
  brand: ['Akira Expanded'],
  // 'ui' resolves to Inter/sans-serif, which is a system stack — nothing to embed.
  ui: [],
};

/**
 * Which families a document needs embedded.
 *
 * Only *visible* text layers count, and only layers with text in them: a hidden
 * or empty title should not drag 1.3 MB of Synkopy into the export.
 */
export function collectUsedFontFamilies(document: ArtworkDocument): CoverFontFamily[] {
  const used = new Set<CoverFontFamily>();
  document.layers.forEach((layer) => {
    if (layer.type !== 'text' || !layer.visible) return;
    if (layer.text.trim().length === 0) return;
    fontRoleFamilies[layer.fontFamily].forEach((family) => used.add(family));
  });
  return coverFontAssets
    .map((asset) => asset.family)
    .filter((family) => used.has(family));
}

/** Assets needed for a set of families, in a stable order. */
export function assetsForFamilies(families: CoverFontFamily[]): CoverFontAsset[] {
  return coverFontAssets.filter((asset) => families.includes(asset.family));
}

export type EmbeddedFont = { family: CoverFontFamily; dataUrl: string; weight: number; format: string };

/** Build the `@font-face` block that goes inside the SVG. */
export function buildFontFaceCss(fonts: EmbeddedFont[]): string {
  return fonts
    .map((font) => [
      '@font-face{',
      `font-family:'${font.family}';`,
      `src:url('${font.dataUrl}') format('${font.format}');`,
      `font-weight:${font.weight};`,
      'font-style:normal;',
      '}',
    ].join(''))
    .join('');
}

/**
 * Insert a `<style>` block as the first child of the SVG's `<defs>`.
 *
 * Anchored on the literal `<defs>` the renderer always emits rather than a
 * regex over the whole document, so it cannot accidentally match text content
 * that happens to contain the word.
 */
export function injectFontCss(svg: string, css: string): string {
  if (!css) return svg;
  const marker = '<defs>';
  const at = svg.indexOf(marker);
  if (at === -1) return svg;
  const style = `<style type="text/css">${css}</style>`;
  return svg.slice(0, at + marker.length) + style + svg.slice(at + marker.length);
}

/* ── Browser side ──────────────────────────────────────────────────────── */

/**
 * Fetched fonts, cached for the session.
 *
 * Synkopy is 1.3 MB; re-fetching and re-encoding it on every export — and the
 * producer will export repeatedly while iterating — is wasted time and memory
 * churn. Keyed by URL, so adding a weight later cannot collide.
 */
const fontCache = new Map<string, Promise<string>>();

async function fetchFontDataUrl(url: string): Promise<string> {
  const cached = fontCache.get(url);
  if (cached) return cached;

  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    const buffer = await response.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    // Chunked rather than String.fromCharCode(...bytes): a 1.3 MB font spreads
    // into 1.3 million arguments and blows the call stack.
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:font/otf;base64,${btoa(binary)}`;
  })();

  fontCache.set(url, pending);
  // A failed fetch must not poison the cache for the rest of the session.
  pending.catch(() => fontCache.delete(url));
  return pending;
}

/**
 * Return the document's SVG with the fonts it uses inlined.
 *
 * Fails soft: if a font cannot be fetched the export still happens, just with
 * fallback type for that family. Losing the whole export because one file 404'd
 * would be a worse outcome than a cover in the wrong face — and the caller has
 * no way to fix it mid-export either way.
 */
export async function embedFontsInSvg(svg: string, document: ArtworkDocument): Promise<string> {
  const assets = assetsForFamilies(collectUsedFontFamilies(document));
  if (assets.length === 0) return svg;

  const settled = await Promise.allSettled(
    assets.map(async (asset) => ({
      family: asset.family,
      weight: asset.weight,
      format: asset.format,
      dataUrl: await fetchFontDataUrl(asset.url),
    })),
  );

  const embedded = settled
    .filter((result): result is PromiseFulfilledResult<EmbeddedFont> => result.status === 'fulfilled')
    .map((result) => result.value);

  return injectFontCss(svg, buildFontFaceCss(embedded));
}
