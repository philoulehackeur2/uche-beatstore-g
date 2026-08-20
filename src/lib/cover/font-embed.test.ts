import { describe, expect, it } from 'vitest';
import {
  addLayer, createArtworkDocument, createTextLayer, type ArtworkDocument,
} from '@/components/cover-art/cover-art-document';
import {
  assetsForFamilies, buildFontFaceCss, collectUsedFontFamilies, coverFontAssets, fontRoleFamilies, injectFontCss,
} from './font-embed';

const blank = (): ArtworkDocument => {
  // Start from a document with no text at all, so each test controls exactly
  // which families are in play.
  const doc = createArtworkDocument('de-roche-mineral', { kind: 'empty', label: 'Empty design' });
  return { ...doc, layers: doc.layers.filter((layer) => layer.type !== 'text') };
};

describe('collectUsedFontFamilies', () => {
  it('returns nothing when a document has no text', () => {
    expect(collectUsedFontFamilies(blank())).toEqual([]);
  });

  it('maps the artwork role to Synkopy and its fallback', () => {
    const doc = addLayer(blank(), createTextLayer(blank(), 'TITLE', { fontFamily: 'artwork' }));
    expect(collectUsedFontFamilies(doc)).toEqual(['Synkopy', 'Akira Expanded']);
  });

  it('maps the mono role to Panchang only', () => {
    const doc = addLayer(blank(), createTextLayer(blank(), '140 BPM', { fontFamily: 'mono' }));
    expect(collectUsedFontFamilies(doc)).toEqual(['Panchang']);
  });

  it('embeds nothing for the ui role, which is a system stack', () => {
    const doc = addLayer(blank(), createTextLayer(blank(), 'Label', { fontFamily: 'ui' }));
    expect(collectUsedFontFamilies(doc)).toEqual([]);
  });

  it('ignores hidden text layers', () => {
    const doc = addLayer(blank(), createTextLayer(blank(), 'TITLE', { fontFamily: 'artwork', visible: false }));
    expect(collectUsedFontFamilies(doc)).toEqual([]);
  });

  it('ignores empty and whitespace-only text layers', () => {
    let doc = addLayer(blank(), createTextLayer(blank(), '', { fontFamily: 'artwork' }));
    doc = addLayer(doc, createTextLayer(doc, '   ', { fontFamily: 'mono' }));
    expect(collectUsedFontFamilies(doc)).toEqual([]);
  });

  it('deduplicates families used by several layers', () => {
    let doc = blank();
    doc = addLayer(doc, createTextLayer(doc, 'ONE', { fontFamily: 'artwork' }));
    doc = addLayer(doc, createTextLayer(doc, 'TWO', { fontFamily: 'display' }));
    expect(collectUsedFontFamilies(doc)).toEqual(['Synkopy', 'Akira Expanded']);
  });

  it('collects every family a mixed document needs', () => {
    let doc = blank();
    doc = addLayer(doc, createTextLayer(doc, 'TITLE', { fontFamily: 'artwork' }));
    doc = addLayer(doc, createTextLayer(doc, '140 BPM', { fontFamily: 'mono' }));
    expect(collectUsedFontFamilies(doc)).toEqual(['Synkopy', 'Akira Expanded', 'Panchang']);
  });
});

describe('assetsForFamilies', () => {
  it('resolves families to files', () => {
    const assets = assetsForFamilies(['Panchang']);
    expect(assets).toHaveLength(1);
    expect(assets[0].url).toBe('/fonts/Panchang-Bold.otf');
  });

  it('returns nothing for an empty list, so nothing is fetched', () => {
    expect(assetsForFamilies([])).toEqual([]);
  });

  it('points every asset at a real file under /fonts', () => {
    coverFontAssets.forEach((asset) => {
      expect(asset.url.startsWith('/fonts/')).toBe(true);
      expect(asset.url.endsWith('.otf')).toBe(true);
    });
  });
});

describe('buildFontFaceCss', () => {
  it('writes a font-face rule carrying the data URI', () => {
    const css = buildFontFaceCss([
      { family: 'Panchang', dataUrl: 'data:font/otf;base64,AAA', weight: 700, format: 'opentype' },
    ]);
    expect(css).toContain("font-family:'Panchang'");
    expect(css).toContain("url('data:font/otf;base64,AAA') format('opentype')");
    expect(css).toContain('font-weight:700');
  });

  it('returns an empty string when there is nothing to embed', () => {
    expect(buildFontFaceCss([])).toBe('');
  });
});

describe('injectFontCss', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg">\n  <defs>\n    <pattern id="p" />\n  </defs>\n  <rect />\n</svg>';

  it('places the style block inside defs', () => {
    const out = injectFontCss(svg, '@font-face{}');
    expect(out).toContain('<defs><style type="text/css">@font-face{}</style>');
    expect(out.indexOf('<style')).toBeLessThan(out.indexOf('</defs>'));
  });

  it('leaves the svg untouched when there is no css', () => {
    expect(injectFontCss(svg, '')).toBe(svg);
  });

  it('leaves the svg untouched when it has no defs', () => {
    const bare = '<svg><rect /></svg>';
    expect(injectFontCss(bare, '@font-face{}')).toBe(bare);
  });

  it('keeps the original defs content', () => {
    expect(injectFontCss(svg, '@font-face{}')).toContain('<pattern id="p" />');
  });
});

describe('the brand role', () => {
  it('resolves to Akira Expanded, the face the app brand mark uses', () => {
    const doc = addLayer(blank(), createTextLayer(blank(), 'UCHE', { fontFamily: 'brand' }));
    expect(collectUsedFontFamilies(doc)).toEqual(['Akira Expanded']);
  });

  it('does not drag Synkopy into the export, which the other roles would', () => {
    const brand = addLayer(blank(), createTextLayer(blank(), 'UCHE', { fontFamily: 'brand' }));
    const artwork = addLayer(blank(), createTextLayer(blank(), 'UCHE', { fontFamily: 'artwork' }));
    expect(collectUsedFontFamilies(brand)).not.toContain('Synkopy');
    expect(collectUsedFontFamilies(artwork)).toContain('Synkopy');
  });

  it('embeds the Akira file for it', () => {
    expect(assetsForFamilies(['Akira Expanded'])[0].url).toBe('/fonts/AkiraExpanded.otf');
  });

  it('covers every font role, so none can silently embed nothing', () => {
    (['display', 'artwork', 'mono', 'ui', 'brand'] as const).forEach((role) => {
      expect(fontRoleFamilies[role]).toBeDefined();
    });
  });
});
