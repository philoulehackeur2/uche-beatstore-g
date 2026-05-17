/**
 * Route tests for /api/projects/[id].
 *
 * Mirrors tracks/[id] — Zod allow-list + facade-gated ownership.
 * Important regressions pinned here: column names are `bpm_target` /
 * `key_target` (not target_bpm/target_key — a previous schema edit got
 * that wrong), and PATCH stamps updated_at via the facade option.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGetOwned = vi.fn();
const mockUpdateOwned = vi.fn();
const mockDeleteOwned = vi.fn();
const mockIsSupabaseConfigured = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
  getOwned: (...args: unknown[]) => mockGetOwned(...args),
  updateOwned: (...args: unknown[]) => mockUpdateOwned(...args),
  deleteOwned: (...args: unknown[]) => mockDeleteOwned(...args),
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  createServiceClient: () => mockCreateServiceClient(),
  query: (...args: unknown[]) => mockQuery(...args),
  isErrorResponse: (v: unknown) =>
    typeof v === 'object' && v !== null &&
    typeof (v as { status?: number }).status === 'number' &&
    typeof (v as { json?: unknown }).json === 'function',
}));

function buildReq(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/projects/p-1', {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function loadRoute() {
  return import('./route');
}

describe('PATCH /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unknown column with 400 (strict)', async () => {
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { random_unknown_col: 'x' }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
    expect(mockUpdateOwned).not.toHaveBeenCalled();
  });

  it('rejects invalid status enum', async () => {
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { status: 'whatever' }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('accepts bpm_target/key_target with correct column names', async () => {
    // Regression: an earlier schema attempt used `target_bpm`/`target_key`
    // which would silently no-op a save in production. This locks the
    // canonical column names.
    mockUpdateOwned.mockResolvedValueOnce({ id: 'p-1', bpm_target: 140, key_target: 'C minor' });
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { bpm_target: 140, key_target: 'C minor' }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockUpdateOwned).toHaveBeenCalledWith(
      'projects',
      'p-1',
      { bpm_target: 140, key_target: 'C minor' },
      { stampUpdatedAt: true },
    );
  });

  it('rejects target_bpm (old/wrong column name)', async () => {
    // Inverse of the above — a body using the wrong column name should
    // 400 immediately, not slip through to the DB and error there.
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { target_bpm: 140 }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns the updated project wrapped under .project', async () => {
    mockUpdateOwned.mockResolvedValueOnce({ id: 'p-1', name: 'Renamed' });
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { name: 'Renamed' }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ project: { id: 'p-1', name: 'Renamed' } });
  });

  it('propagates ownership 401 from updateOwned', async () => {
    mockUpdateOwned.mockResolvedValueOnce(
      NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    );
    const mod = await loadRoute();
    const res = await mod.PATCH(
      buildReq('PATCH', { name: 'x' }),
      { params: Promise.resolve({ id: 'p-1' }) },
    );
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/projects/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success and trusts cascade for project_tracks', async () => {
    mockDeleteOwned.mockResolvedValueOnce(true);
    const mod = await loadRoute();
    const res = await mod.DELETE(buildReq('DELETE'), { params: Promise.resolve({ id: 'p-1' }) });
    expect(res.status).toBe(200);
    expect(mockDeleteOwned).toHaveBeenCalledWith('projects', 'p-1');
  });
});
