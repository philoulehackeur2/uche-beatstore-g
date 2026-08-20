/**
 * Saved cover art documents.
 *
 * WHY INDEXEDDB, NOT LOCALSTORAGE. Image layers carry their bytes inline as
 * data URIs (they have to — the export rasteriser cannot fetch cross-origin,
 * see `font-embed.ts` for the same constraint applied to fonts). A three-image
 * collage is therefore several megabytes, which blows straight past
 * localStorage's ~5 MB ceiling and would fail the save with a QuotaExceeded
 * error at the exact moment the producer had done the most work. IndexedDB has
 * no such practical limit, and the project already uses it for audio blobs.
 *
 * A separate database from `antigravity-offline` on purpose: sharing one would
 * mean coordinating version bumps between two unrelated features, and an
 * upgrade race there would take the offline audio cache down with it.
 *
 * The pure half of this file — validation, naming, summaries — is exported
 * separately and unit-tested, per the convention in CLAUDE.md. The IndexedDB
 * half is a thin wrapper with no logic worth hiding in it.
 */

import type { ArtworkDocument } from '@/components/cover-art/cover-art-document';

const DB_NAME = 'antigravity-cover-art';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';
const STORE_META = 'meta';
const LAST_OPENED_KEY = 'last-opened-id';

export type StoredCoverDocument = {
  id: string;
  name: string;
  updatedAt: string;
  createdAt: string;
  document: ArtworkDocument;
};

export type CoverDocumentSummary = {
  id: string;
  name: string;
  updatedAt: string;
  layerCount: number;
  imageCount: number;
  /** Rough on-disk size, for the storage hint in the UI. */
  bytes: number;
};

/* ── Pure helpers ──────────────────────────────────────────────────────── */

/**
 * Is this value a document we can actually open?
 *
 * Stored data outlives the code that wrote it: a half-written record, or one
 * from an older shape, must surface as "skip this entry" rather than throwing
 * somewhere deep in the canvas on next load. Anything that fails here is
 * treated as absent.
 */
export function isStoredCoverDocument(value: unknown): value is StoredCoverDocument {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<StoredCoverDocument>;
  if (typeof record.id !== 'string' || record.id.length === 0) return false;
  if (typeof record.name !== 'string') return false;
  if (typeof record.updatedAt !== 'string') return false;

  const doc = record.document as Partial<ArtworkDocument> | undefined;
  if (!doc || typeof doc !== 'object') return false;
  if (typeof doc.width !== 'number' || typeof doc.height !== 'number') return false;
  if (doc.width <= 0 || doc.height <= 0) return false;
  if (!Array.isArray(doc.layers)) return false;
  // Every layer needs the fields the canvas positions it with.
  return doc.layers.every((layer) => (
    layer
    && typeof layer === 'object'
    && typeof (layer as { id?: unknown }).id === 'string'
    && typeof (layer as { type?: unknown }).type === 'string'
    && typeof (layer as { x?: unknown }).x === 'number'
    && typeof (layer as { y?: unknown }).y === 'number'
  ));
}

/** Approximate stored size. Image data URIs dominate, so this is close enough. */
export function estimateDocumentBytes(document: ArtworkDocument): number {
  let bytes = 0;
  document.layers.forEach((layer) => {
    if (layer.type === 'image' && layer.src) bytes += layer.src.length;
    else bytes += 256;
  });
  return bytes;
}

export function toSummary(stored: StoredCoverDocument): CoverDocumentSummary {
  return {
    id: stored.id,
    name: stored.name,
    updatedAt: stored.updatedAt,
    layerCount: stored.document.layers.length,
    imageCount: stored.document.layers.filter((layer) => layer.type === 'image' && layer.src).length,
    bytes: estimateDocumentBytes(stored.document),
  };
}

/** Newest first — the list is a "pick up where you left off" list. */
export function sortSummaries(summaries: CoverDocumentSummary[]): CoverDocumentSummary[] {
  return [...summaries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * A name not already taken, by appending a counter.
 *
 * Duplicating "Night Drive" three times should read 2, 3, 4 rather than
 * "Night Drive copy copy copy".
 */
export function uniqueDocumentName(base: string, taken: string[]): string {
  const trimmed = base.trim() || 'Untitled cover';
  const existing = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!existing.has(trimmed.toLowerCase())) return trimmed;

  // Strip a trailing counter so "Cover 2" duplicated becomes "Cover 3".
  const stem = trimmed.replace(/\s+\d+$/, '');
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} ${n}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} ${Date.now()}`;
}

/**
 * A document id unique to this save.
 *
 * `createArtworkDocument` derives its id from the direction and source slug, so
 * two covers started blank from the same direction collide on id — and the
 * second save would silently overwrite the first. Every document entering
 * storage gets a fresh id instead.
 */
export function withFreshId(document: ArtworkDocument, id?: string): ArtworkDocument {
  return {
    ...document,
    id: id ?? `cover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

export function toStored(document: ArtworkDocument, createdAt?: string): StoredCoverDocument {
  const now = new Date().toISOString();
  return {
    id: document.id,
    name: document.name,
    updatedAt: now,
    createdAt: createdAt ?? now,
    document,
  };
}

/* ── IndexedDB ─────────────────────────────────────────────────────────── */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB not available'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  // A failed open must not wedge every later call on a rejected promise.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function request<T>(factory: (db: IDBDatabase) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const req = factory(db);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function saveCoverDocument(stored: StoredCoverDocument): Promise<void> {
  await request((db) => db
    .transaction(STORE_DOCUMENTS, 'readwrite')
    .objectStore(STORE_DOCUMENTS)
    .put(stored));
}

export async function loadCoverDocument(id: string): Promise<StoredCoverDocument | null> {
  const value = await request<unknown>((db) => db
    .transaction(STORE_DOCUMENTS, 'readonly')
    .objectStore(STORE_DOCUMENTS)
    .get(id));
  return isStoredCoverDocument(value) ? value : null;
}

export async function listCoverDocuments(): Promise<CoverDocumentSummary[]> {
  const values = await request<unknown[]>((db) => db
    .transaction(STORE_DOCUMENTS, 'readonly')
    .objectStore(STORE_DOCUMENTS)
    .getAll());
  return sortSummaries(values.filter(isStoredCoverDocument).map(toSummary));
}

export async function deleteCoverDocument(id: string): Promise<void> {
  await request((db) => db
    .transaction(STORE_DOCUMENTS, 'readwrite')
    .objectStore(STORE_DOCUMENTS)
    .delete(id));
}

export async function setLastOpenedId(id: string): Promise<void> {
  await request((db) => db
    .transaction(STORE_META, 'readwrite')
    .objectStore(STORE_META)
    .put(id, LAST_OPENED_KEY));
}

export async function getLastOpenedId(): Promise<string | null> {
  const value = await request<unknown>((db) => db
    .transaction(STORE_META, 'readonly')
    .objectStore(STORE_META)
    .get(LAST_OPENED_KEY));
  return typeof value === 'string' ? value : null;
}
