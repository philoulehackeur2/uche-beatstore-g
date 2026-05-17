/**
 * Per-session metadata for in-flight chunked uploads.
 *
 * Stored in `data/upload-sessions.json` for dev / local mode. When Supabase
 * is configured the same shape can be persisted to a table — for now we use
 * a simple file-backed store so the feature works out-of-the-box without a
 * migration. Sessions are short-lived (TTL 24h) so size is not a concern.
 */

import fs from 'fs';
import path from 'path';
import type { PartRef } from './multipart';

const FILE = path.join(process.cwd(), 'data', 'upload-sessions.json');

export interface UploadSession {
  sessionId: string;       // our id, returned to client
  uploadId: string;        // R2 multipart UploadId (or local id)
  key: string;             // R2 object key (or "local:..." marker)
  fileName: string;
  fileSize: number;
  contentType: string;
  partSize: number;
  totalParts: number;
  parts: PartRef[];        // completed parts
  type: string;            // track type
  projectId: string | null;
  replaceTrackId: string | null;
  userId: string | null;
  createdAt: number;
  updatedAt: number;
  status: 'in_progress' | 'completed' | 'aborted';
}

function ensureDir() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadAll(): Record<string, UploadSession> {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8') || '{}');
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, UploadSession>) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
}

const TTL_MS = 24 * 60 * 60 * 1000;

function pruneStale(map: Record<string, UploadSession>) {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of Object.entries(map)) {
    if (s.status !== 'in_progress' && now - s.updatedAt > TTL_MS) {
      delete map[id];
      changed = true;
    }
  }
  return changed;
}

export function getSession(sessionId: string): UploadSession | null {
  const all = loadAll();
  if (pruneStale(all)) saveAll(all);
  return all[sessionId] || null;
}

export function createSession(s: Omit<UploadSession, 'createdAt' | 'updatedAt' | 'status' | 'parts'> & {
  parts?: PartRef[];
}): UploadSession {
  const all = loadAll();
  const now = Date.now();
  const session: UploadSession = {
    ...s,
    parts: s.parts || [],
    createdAt: now,
    updatedAt: now,
    status: 'in_progress',
  };
  all[session.sessionId] = session;
  pruneStale(all);
  saveAll(all);
  return session;
}

export function recordPart(sessionId: string, part: PartRef): UploadSession | null {
  const all = loadAll();
  const s = all[sessionId];
  if (!s) return null;
  const filtered = s.parts.filter((p) => p.PartNumber !== part.PartNumber);
  filtered.push(part);
  s.parts = filtered;
  s.updatedAt = Date.now();
  saveAll(all);
  return s;
}

export function markStatus(sessionId: string, status: UploadSession['status']): UploadSession | null {
  const all = loadAll();
  const s = all[sessionId];
  if (!s) return null;
  s.status = status;
  s.updatedAt = Date.now();
  saveAll(all);
  return s;
}

export function deleteSession(sessionId: string) {
  const all = loadAll();
  delete all[sessionId];
  saveAll(all);
}
