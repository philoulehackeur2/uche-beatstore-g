/**
 * Storefront layout version history.
 *
 * Undo/redo covers the current session. This covers the rest: "what did the
 * storefront look like this morning, before I started rearranging it", which
 * is the question a producer actually asks after an afternoon of edits — and
 * the one an undo stack cannot answer once the tab has been closed.
 *
 * WHERE SNAPSHOTS LIVE. IndexedDB, in the browser, following the Cover Art
 * Studio's `document-store.ts`. That is a real limitation and worth stating
 * plainly rather than burying: history is per-browser, not per-account, so it
 * does not follow the producer to another machine. Server-side history would
 * need its own table and migration; this is the version that can ship without
 * one, and it is strictly better than the nothing that exists today.
 *
 * The pure half — pruning, labelling, deduplication — is here and tested. The
 * IndexedDB half below is a thin wrapper with no logic worth hiding in it.
 */

import { normalizeLayout, type StoreLayout } from './layout';

const DB_NAME = 'antigravity-store-editor';
const DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';

/** How many snapshots to keep. Beyond this the oldest are dropped. */
export const HISTORY_LIMIT = 30;

/**
 * Snapshots closer together than this are treated as the same sitting.
 *
 * Without it, autosave every 900ms during a slider drag would fill the history
 * with thirty near-identical entries and push out everything worth restoring —
 * the feature would actively destroy its own usefulness.
 */
export const SNAPSHOT_MIN_GAP_MS = 3 * 60 * 1000;

export type LayoutSnapshot = {
  id: string;
  takenAt: string;
  /** Short human description, e.g. "8 sections · 2 hidden on mobile". */
  label: string;
  layout: StoreLayout;
};

export type SnapshotSummary = Omit<LayoutSnapshot, 'layout'> & { sectionCount: number };

/* ── Pure helpers ───────────────────────────────────────────────────────── */

/**
 * Is this a snapshot we can actually restore?
 *
 * Stored data outlives the code that wrote it. A half-written record, or one
 * from an older shape, has to surface as "skip this entry" rather than
 * throwing somewhere inside the builder on next open.
 */
export function isLayoutSnapshot(value: unknown): value is LayoutSnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LayoutSnapshot>;
  return typeof record.id === 'string'
    && record.id.length > 0
    && typeof record.takenAt === 'string'
    && Boolean(record.layout)
    && typeof record.layout === 'object'
    && Array.isArray((record.layout as StoreLayout).sections);
}

/** A one-line description of what a layout contains, for the history list. */
export function describeLayout(layout: StoreLayout): string {
  const total = layout.sections.length;
  const hidden = layout.sections.filter((section) => (
    Object.values(section.overrides ?? {}).some((override) => override?.visible === false)
  )).length;
  const parts = [`${total} section${total === 1 ? '' : 's'}`];
  if (hidden > 0) parts.push(`${hidden} device override${hidden === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function createSnapshot(layout: StoreLayout, at = new Date()): LayoutSnapshot {
  return {
    id: `snap-${at.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    takenAt: at.toISOString(),
    label: describeLayout(layout),
    layout,
  };
}

/** Newest first — the order the list is read in. */
export function sortSnapshots<T extends { takenAt: string }>(snapshots: T[]): T[] {
  return [...snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/**
 * Should this layout be recorded?
 *
 * Two reasons to decline: nothing changed since the last snapshot, or the last
 * one is too recent to be a separate moment. Both exist to stop autosave churn
 * from evicting the entries a producer would actually want back.
 */
export function shouldSnapshot(
  layout: StoreLayout,
  latest: LayoutSnapshot | null,
  now = Date.now(),
): boolean {
  if (!latest) return true;
  if (sameLayout(layout, latest.layout)) return false;
  return now - Date.parse(latest.takenAt) >= SNAPSHOT_MIN_GAP_MS;
}

/**
 * Do two layouts describe the same storefront?
 *
 * `updatedAt` is excluded deliberately — it changes on every keystroke, so
 * comparing it would report "different" for a layout nobody actually altered
 * and defeat the deduplication entirely.
 */
export function sameLayout(a: StoreLayout, b: StoreLayout): boolean {
  const strip = (layout: StoreLayout) => JSON.stringify({
    sections: layout.sections,
    theme: layout.theme,
  });
  return strip(a) === strip(b);
}

/** Keep the newest `limit`, dropping the oldest. */
export function pruneSnapshots<T extends { takenAt: string }>(
  snapshots: T[],
  limit = HISTORY_LIMIT,
): T[] {
  return sortSnapshots(snapshots).slice(0, Math.max(0, limit));
}

export function toSummary(snapshot: LayoutSnapshot): SnapshotSummary {
  return {
    id: snapshot.id,
    takenAt: snapshot.takenAt,
    label: snapshot.label,
    sectionCount: snapshot.layout.sections.length,
  };
}

/** "just now" / "12m ago" / "3h ago" / "2d ago". */
export function formatSnapshotAge(takenAt: string, now = Date.now()): string {
  const elapsed = now - Date.parse(takenAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ── IndexedDB ──────────────────────────────────────────────────────────── */

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listSnapshots(): Promise<SnapshotSummary[]> {
  const db = await openDatabase();
  try {
    const records = await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(STORE_SNAPSHOTS, 'readonly')
        .objectStore(STORE_SNAPSHOTS)
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    return sortSnapshots(records.filter(isLayoutSnapshot).map(toSummary));
  } finally {
    db.close();
  }
}

export async function loadSnapshot(id: string): Promise<StoreLayout | null> {
  const db = await openDatabase();
  try {
    const record = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE_SNAPSHOTS, 'readonly')
        .objectStore(STORE_SNAPSHOTS)
        .get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    // Normalised on the way out: a snapshot taken before a new section kind or
    // theme key existed must still restore into something renderable.
    return isLayoutSnapshot(record) ? normalizeLayout(record.layout) : null;
  } finally {
    db.close();
  }
}

async function latestSnapshot(db: IDBDatabase): Promise<LayoutSnapshot | null> {
  const records = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(STORE_SNAPSHOTS, 'readonly')
      .objectStore(STORE_SNAPSHOTS)
      .getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  return sortSnapshots(records.filter(isLayoutSnapshot))[0] ?? null;
}

/**
 * Record a snapshot if this layout is worth keeping.
 *
 * Returns whether one was written, so the caller can refresh its list without
 * a second read. Failures are swallowed: history is an aid, and a producer
 * losing their afternoon's work because a snapshot write failed would be an
 * absurd trade.
 */
export async function recordSnapshot(layout: StoreLayout): Promise<boolean> {
  try {
    const db = await openDatabase();
    try {
      const latest = await latestSnapshot(db);
      if (!shouldSnapshot(layout, latest)) return false;

      const snapshot = createSnapshot(layout);
      await new Promise<void>((resolve, reject) => {
        const request = db.transaction(STORE_SNAPSHOTS, 'readwrite')
          .objectStore(STORE_SNAPSHOTS)
          .put(snapshot);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Prune after writing rather than before, so a crash mid-write can only
      // ever leave MORE history than intended, never less.
      const all = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(STORE_SNAPSHOTS, 'readonly')
          .objectStore(STORE_SNAPSHOTS)
          .getAll();
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () => reject(request.error);
      });
      const keep = new Set(pruneSnapshots(all.filter(isLayoutSnapshot)).map((item) => item.id));
      const doomed = all.filter(isLayoutSnapshot).filter((item) => !keep.has(item.id));
      if (doomed.length > 0) {
        const store = db.transaction(STORE_SNAPSHOTS, 'readwrite').objectStore(STORE_SNAPSHOTS);
        doomed.forEach((item) => store.delete(item.id));
      }
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_SNAPSHOTS, 'readwrite')
        .objectStore(STORE_SNAPSHOTS)
        .delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
