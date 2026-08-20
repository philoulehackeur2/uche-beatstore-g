import { describe, expect, it } from 'vitest';
import {
  addLayer, createArtworkDocument, createImageLayer, type ArtworkDocument,
} from '@/components/cover-art/cover-art-document';
import {
  estimateDocumentBytes, isStoredCoverDocument, sortSummaries, toStored, toSummary,
  uniqueDocumentName, withFreshId,
} from './document-store';

const doc = (): ArtworkDocument => createArtworkDocument('de-roche-mineral', { kind: 'empty', label: 'Empty design' });

describe('isStoredCoverDocument', () => {
  it('accepts a well-formed record', () => {
    expect(isStoredCoverDocument(toStored(doc()))).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['a missing id', { name: 'x', updatedAt: 'x', document: doc() }],
    ['an empty id', { id: '', name: 'x', updatedAt: 'x', document: doc() }],
    ['a missing document', { id: 'a', name: 'x', updatedAt: 'x' }],
  ])('rejects %s', (_label, value) => {
    expect(isStoredCoverDocument(value)).toBe(false);
  });

  it('rejects a document with no layers array', () => {
    const stored = toStored(doc());
    expect(isStoredCoverDocument({ ...stored, document: { ...stored.document, layers: null } })).toBe(false);
  });

  it('rejects a document with a zero-size artboard', () => {
    const stored = toStored(doc());
    expect(isStoredCoverDocument({ ...stored, document: { ...stored.document, width: 0 } })).toBe(false);
  });

  it('rejects a layer missing the fields the canvas positions it with', () => {
    const stored = toStored(doc());
    const broken = { ...stored, document: { ...stored.document, layers: [{ id: 'a', type: 'text' }] } };
    expect(isStoredCoverDocument(broken)).toBe(false);
  });
});

describe('uniqueDocumentName', () => {
  it('keeps a free name as-is', () => {
    expect(uniqueDocumentName('Night Drive', ['Other'])).toBe('Night Drive');
  });

  it('appends a counter when taken', () => {
    expect(uniqueDocumentName('Night Drive', ['Night Drive'])).toBe('Night Drive 2');
  });

  it('counts up past existing copies rather than stacking suffixes', () => {
    expect(uniqueDocumentName('Night Drive', ['Night Drive', 'Night Drive 2'])).toBe('Night Drive 3');
    expect(uniqueDocumentName('Night Drive 2', ['Night Drive', 'Night Drive 2'])).toBe('Night Drive 3');
  });

  it('ignores case and surrounding space when checking', () => {
    expect(uniqueDocumentName('night drive', ['  NIGHT DRIVE '])).toBe('night drive 2');
  });

  it('falls back for an empty name', () => {
    expect(uniqueDocumentName('   ', [])).toBe('Untitled cover');
  });
});

describe('withFreshId', () => {
  it('replaces the template-derived id so two blank covers cannot collide', () => {
    const a = withFreshId(doc());
    const b = withFreshId(doc());
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toBe(doc().id);
  });

  it('accepts an explicit id', () => {
    expect(withFreshId(doc(), 'fixed-id').id).toBe('fixed-id');
  });

  it('changes nothing else about the document', () => {
    const original = doc();
    const { id: _id, ...restFresh } = withFreshId(original);
    const { id: _original, ...restOriginal } = original;
    expect(restFresh).toEqual(restOriginal);
  });
});

describe('summaries', () => {
  it('counts layers and images', () => {
    let d = doc();
    d = addLayer(d, createImageLayer(d, 'data:image/png;base64,AAAA', 'Shot'));
    const summary = toSummary(toStored(d));
    expect(summary.layerCount).toBe(d.layers.length);
    // The template ships an empty image frame; only the one with bytes counts.
    expect(summary.imageCount).toBe(1);
  });

  it('estimates size from the image payloads that dominate it', () => {
    const small = estimateDocumentBytes(doc());
    let d = doc();
    d = addLayer(d, createImageLayer(d, `data:image/png;base64,${'A'.repeat(50_000)}`));
    expect(estimateDocumentBytes(d)).toBeGreaterThan(small + 49_000);
  });

  it('sorts newest first', () => {
    const rows = [
      { id: 'a', name: 'A', updatedAt: '2026-01-01T00:00:00.000Z', layerCount: 1, imageCount: 0, bytes: 1 },
      { id: 'b', name: 'B', updatedAt: '2026-06-01T00:00:00.000Z', layerCount: 1, imageCount: 0, bytes: 1 },
    ];
    expect(sortSummaries(rows).map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the list it sorts', () => {
    const rows = [
      { id: 'a', name: 'A', updatedAt: '2026-01-01T00:00:00.000Z', layerCount: 1, imageCount: 0, bytes: 1 },
      { id: 'b', name: 'B', updatedAt: '2026-06-01T00:00:00.000Z', layerCount: 1, imageCount: 0, bytes: 1 },
    ];
    sortSummaries(rows);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('toStored', () => {
  it('carries the document name and id onto the record', () => {
    const d = { ...doc(), name: 'Night Drive' };
    const stored = toStored(d);
    expect(stored.name).toBe('Night Drive');
    expect(stored.id).toBe(d.id);
  });

  it('preserves the original createdAt across saves', () => {
    const stored = toStored(doc(), '2020-01-01T00:00:00.000Z');
    expect(stored.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(stored.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
