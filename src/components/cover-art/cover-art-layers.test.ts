import { describe, expect, it } from 'vitest';
import {
  addLayer,
  alignLayers,
  createArtworkDocument,
  createImageLayer,
  createShapeLayer,
  createTextLayer,
  createTextureLayer,
  createWaveformLayer,
  distributeLayers,
  duplicateLayers,
  imageCropDefaults,
  imageFrameRect,
  removeLayers,
  renderArtworkDocumentSvg,
  reorderLayer,
  sortArtworkLayers,
  type ImageArtworkLayer,
} from './cover-art-document';

const baseDocument = () => createArtworkDocument('de-roche-mineral', { kind: 'empty', label: 'Empty design' });

describe('layer factories', () => {
  it('centres a new text layer in the artboard', () => {
    const document = baseDocument();
    const layer = createTextLayer(document, 'HELLO');
    expect(layer.text).toBe('HELLO');
    expect(layer.x).toBe(Math.round((document.width - layer.width) / 2));
    expect(layer.y).toBe(Math.round((document.height - layer.height) / 2));
  });

  it('stacks each new layer above every existing one', () => {
    const document = baseDocument();
    const highest = Math.max(...document.layers.map((layer) => layer.zIndex));
    expect(createShapeLayer(document).zIndex).toBe(highest + 1);
  });

  it('gives every new layer a distinct id', () => {
    const document = baseDocument();
    const ids = [
      createTextLayer(document).id,
      createImageLayer(document, 'data:image/png;base64,AAA').id,
      createShapeLayer(document).id,
      createTextureLayer(document).id,
    ];
    expect(new Set(ids).size).toBe(4);
  });

  it('reuses loaded peaks when adding a second waveform layer', () => {
    const document = baseDocument();
    const existing = document.layers.find((layer) => layer.type === 'waveform');
    const added = createWaveformLayer(document);
    expect(added.peaks).toEqual(existing && 'peaks' in existing ? existing.peaks : undefined);
  });

  it('creates an image layer with crop defaults already applied', () => {
    const layer = createImageLayer(baseDocument(), 'data:image/png;base64,AAA', 'Shot');
    expect(imageCropDefaults(layer)).toEqual({
      fit: 'cover', offsetX: 0, offsetY: 0, scale: 1, radius: 0, mask: 'none',
    });
  });
});

describe('document operations', () => {
  it('adds a layer without touching the others', () => {
    const document = baseDocument();
    const next = addLayer(document, createShapeLayer(document, 'circle'));
    expect(next.layers).toHaveLength(document.layers.length + 1);
    expect(next.layers.slice(0, -1)).toEqual(document.layers);
  });

  it('refuses to delete a locked layer', () => {
    const document = baseDocument();
    const locked = document.layers.find((layer) => layer.locked);
    expect(locked).toBeTruthy();
    expect(removeLayers(document, [locked!.id])).toBe(document);
  });

  it('deletes unlocked layers', () => {
    const document = baseDocument();
    const title = document.layers.find((layer) => layer.name === 'Main Title')!;
    const next = removeLayers(document, [title.id]);
    expect(next.layers.find((layer) => layer.id === title.id)).toBeUndefined();
  });

  it('duplicates with a fresh id, an offset and no lock', () => {
    const document = baseDocument();
    const source = document.layers.find((layer) => layer.name === 'Main Title')!;
    const { document: next, ids } = duplicateLayers(document, [source.id]);
    const clone = next.layers.find((layer) => layer.id === ids[0])!;
    expect(clone.id).not.toBe(source.id);
    expect(clone.x).toBe(source.x + 80);
    expect(clone.locked).toBe(false);
    // A deep copy: mutating the clone's peaks must not reach the original.
    expect(next.layers.find((layer) => layer.id === source.id)).toEqual(source);
  });

  it('sends a layer to the front and to the back', () => {
    const document = baseDocument();
    const first = sortArtworkLayers(document.layers)[0];
    const toFront = reorderLayer(document.layers, first.id, 'front');
    expect(sortArtworkLayers(toFront).at(-1)!.id).toBe(first.id);
    const backAgain = reorderLayer(toFront, first.id, 'back');
    expect(sortArtworkLayers(backAgain)[0].id).toBe(first.id);
    expect(sortArtworkLayers(backAgain).map((layer) => layer.zIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('aligns a single layer against the artboard', () => {
    const document = baseDocument();
    const title = document.layers.find((layer) => layer.name === 'Main Title')!;
    const next = alignLayers(document, [title.id], 'left');
    expect(next.layers.find((layer) => layer.id === title.id)!.x).toBe(0);
  });

  it('aligns several layers against their own bounding box', () => {
    let document = baseDocument();
    const a = createShapeLayer(document, 'rect', { x: 100, y: 100, width: 200, height: 200 });
    document = addLayer(document, a);
    const b = createShapeLayer(document, 'rect', { x: 900, y: 400, width: 200, height: 200 });
    document = addLayer(document, b);
    const next = alignLayers(document, [a.id, b.id], 'left');
    expect(next.layers.find((layer) => layer.id === b.id)!.x).toBe(100);
  });

  it('distributes three layers to even gaps', () => {
    let document = baseDocument();
    const made = [0, 500, 1400].map((x) => createShapeLayer(document, 'rect', { x, y: 0, width: 100, height: 100 }));
    made.forEach((layer) => { document = addLayer(document, layer); });
    const next = distributeLayers(document, made.map((layer) => layer.id), 'x');
    const xs = made.map((layer) => next.layers.find((item) => item.id === layer.id)!.x);
    expect(xs[1] - xs[0]).toBe(xs[2] - xs[1]);
  });

  it('leaves fewer than three layers alone when distributing', () => {
    const document = baseDocument();
    const ids = document.layers.slice(0, 2).map((layer) => layer.id);
    expect(distributeLayers(document, ids, 'x')).toBe(document);
  });
});

describe('image cropping', () => {
  it('centres the image when there is no zoom', () => {
    const layer = createImageLayer(baseDocument(), 'data:image/png;base64,AAA');
    const rect = imageFrameRect(layer);
    expect(rect).toMatchObject({ x: 0, y: 0, width: layer.width, height: layer.height });
  });

  it('centres the overflow when zoomed with no pan', () => {
    const base = createImageLayer(baseDocument(), 'data:image/png;base64,AAA');
    const layer: ImageArtworkLayer = { ...base, width: 1000, height: 1000, scale: 2 };
    expect(imageFrameRect(layer)).toMatchObject({ x: -500, y: -500, width: 2000, height: 2000 });
  });

  it('pans to the edge of the overflow at the extremes', () => {
    const base = createImageLayer(baseDocument(), 'data:image/png;base64,AAA');
    const layer: ImageArtworkLayer = { ...base, width: 1000, height: 1000, scale: 2 };
    expect(imageFrameRect({ ...layer, offsetX: 1 }).x).toBe(0);
    expect(imageFrameRect({ ...layer, offsetX: -1 }).x).toBe(-1000);
  });
});

describe('svg rendering', () => {
  it('draws the image source rather than the placeholder', () => {
    let document = baseDocument();
    document = addLayer(document, createImageLayer(document, 'data:image/png;base64,ABC', 'Shot'));
    const svg = renderArtworkDocumentSvg(document);
    expect(svg).toContain('href="data:image/png;base64,ABC"');
    expect(svg).toContain('clip-path="url(#clip-');
  });

  it('escapes text so a quote cannot break out of the markup', () => {
    let document = baseDocument();
    document = addLayer(document, createTextLayer(document, 'A "<b>" & C'));
    const svg = renderArtworkDocumentSvg(document);
    expect(svg).toContain('&quot;&lt;B&gt;&quot; &amp; C');
    expect(svg).not.toContain('<b>');
  });

  it('splits newlines into tspans so multi-line text survives export', () => {
    let document = baseDocument();
    document = addLayer(document, createTextLayer(document, 'LINE ONE\nLINE TWO'));
    const svg = renderArtworkDocumentSvg(document);
    expect(svg).toContain('LINE ONE</tspan>');
    expect(svg).toContain('LINE TWO</tspan>');
  });

  it('rounds rectangle corners and renders a triangle', () => {
    let document = baseDocument();
    document = addLayer(document, createShapeLayer(document, 'rect', { cornerRadius: 48 }));
    document = addLayer(document, createShapeLayer(document, 'triangle'));
    const svg = renderArtworkDocumentSvg(document);
    expect(svg).toContain('rx="48"');
    expect(svg).toContain('<polygon');
  });

  it('gives each texture kind its own fill', () => {
    let document = baseDocument();
    document = addLayer(document, createTextureLayer(document, 'halftone'));
    expect(renderArtworkDocumentSvg(document)).toContain('url(#texHalftone)');
  });

  it('skips hidden layers', () => {
    let document = baseDocument();
    document = addLayer(document, createTextLayer(document, 'SHOULD NOT APPEAR', { visible: false }));
    expect(renderArtworkDocumentSvg(document)).not.toContain('SHOULD NOT APPEAR');
  });
});

/**
 * The exported SVG is rasterised by loading it through `new Image()`, and that
 * path parses it as strict XML. A single malformed tag makes the whole export
 * fail with "Unable to load rendered cover SVG" — which is exactly what a
 * duplicate `style` attribute on `<text>` used to do to every cover that had
 * any text on it. These guard the markup itself rather than the pixels.
 */
describe('exported svg is well-formed', () => {
  /** Every opening tag in the document, with its raw attribute text. */
  function tags(svg: string) {
    return [...svg.matchAll(/<([a-zA-Z][\w:-]*)\s([^>]*?)\/?>/g)]
      .map((match) => ({ name: match[1], attrs: match[2] }));
  }

  function duplicateAttributes(attrs: string) {
    const names = [...attrs.matchAll(/(^|\s)([a-zA-Z][\w:-]*)\s*=\s*"/g)].map((m) => m[2]);
    return names.filter((name, index) => names.indexOf(name) !== index);
  }

  function richDocument() {
    let document = baseDocument();
    document = addLayer(document, createTextLayer(document, 'MIDNIGHT CARTEL'));
    document = addLayer(document, createTextLayer(document, 'A\nB', { stroke: '#fff', strokeWidth: 6 }));
    document = addLayer(document, createImageLayer(document, 'data:image/png;base64,AAA'));
    document = addLayer(document, createShapeLayer(document, 'rect', { cornerRadius: 20 }));
    document = addLayer(document, createShapeLayer(document, 'triangle'));
    document = addLayer(document, createShapeLayer(document, 'circle'));
    document = addLayer(document, createTextureLayer(document, 'halftone'));
    return document;
  }

  it('never repeats an attribute on any element', () => {
    const offenders = tags(renderArtworkDocumentSvg(richDocument()))
      .map((tag) => ({ tag: tag.name, duplicates: duplicateAttributes(tag.attrs) }))
      .filter((entry) => entry.duplicates.length > 0);
    expect(offenders).toEqual([]);
  });

  it('gives every text element exactly one style attribute', () => {
    const texts = tags(renderArtworkDocumentSvg(richDocument())).filter((tag) => tag.name === 'text');
    expect(texts.length).toBeGreaterThan(0);
    texts.forEach((text) => {
      expect((text.attrs.match(/style=/g) ?? []).length).toBe(1);
      expect(text.attrs).toContain('mix-blend-mode:');
    });
  });

  it('folds the type weight into that one style rather than adding a second', () => {
    const texts = tags(renderArtworkDocumentSvg(richDocument())).filter((tag) => tag.name === 'text');
    const weighted = texts.filter((text) => text.attrs.includes('font-weight:700'));
    expect(weighted.length).toBeGreaterThan(0);
    weighted.forEach((text) => {
      expect(text.attrs).toMatch(/style="mix-blend-mode:[^"]*;font-weight:700"/);
    });
  });

  it('balances every tag it opens', () => {
    const svg = renderArtworkDocumentSvg(richDocument());
    const opened = [...svg.matchAll(/<([a-zA-Z][\w:-]*)(\s[^>]*?)?(\/)?>/g)]
      .filter((match) => !match[3])
      .map((match) => match[1]);
    const closed = [...svg.matchAll(/<\/([a-zA-Z][\w:-]*)>/g)].map((match) => match[1]);
    const count = (list: string[], name: string) => list.filter((item) => item === name).length;
    [...new Set(opened)].forEach((name) => {
      expect(`${name}:${count(opened, name)}`).toBe(`${name}:${count(closed, name)}`);
    });
  });

  it('quotes every attribute value', () => {
    tags(renderArtworkDocumentSvg(richDocument())).forEach((tag) => {
      // An unquoted value would show up as `name=` followed by a non-quote.
      expect(tag.attrs).not.toMatch(/=\s*[^"\s>]/);
    });
  });
});

describe('brand typography', () => {
  it('sets the artist name in the brand face by default', () => {
    const artist = baseDocument().layers.find((layer) => layer.name === 'Artist Name');
    expect(artist).toMatchObject({ type: 'text', fontFamily: 'brand' });
  });

  it('renders the brand role as Akira with nothing ahead of it in the stack', () => {
    let document = baseDocument();
    document = addLayer(document, createTextLayer(document, 'UCHE', { fontFamily: 'brand' }));
    const svg = renderArtworkDocumentSvg(document);
    expect(svg).toContain('font-family="Akira Expanded, sans-serif"');
    // Synkopy ahead of Akira is what stopped Akira ever rendering before.
    expect(svg).not.toContain('font-family="Synkopy, Akira Expanded, sans-serif" letter-spacing="18"');
  });
});
