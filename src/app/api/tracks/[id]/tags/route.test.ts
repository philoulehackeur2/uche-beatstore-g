/**
 * Route tests for /api/tracks/[id]/tags.
 *
 * Mirrors the rate-route pattern: mock @/lib/db, drive the supabase
 * chain via a stub admin object returned by requireRowOwnership.
 *
 * The tag table has no user_id of its own — ownership rides on the
 * parent track. These tests pin that contract: every method MUST call
 * requireRowOwnership('tracks', id) before touching `track_tags`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockIsSupabaseConfigured = vi.fn();
const mockRequireRowOwnership = vi.fn();
const mockQuery = vi.fn();
const mockInsert = vi.fn();
const mockGetAll = vi.fn();
const mockDeleteRow = vi.fn();

vi.mock('@/lib/db', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  requireRowOwnership: (...args: unknown[]) => mockRequireRowOwnership(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  insert: (...args: unknown[]) => mockInsert(...args),
  getAll: (...args: unknown[]) => mockGetAll(...args),
  deleteRow: (...args: unknown[]) => mockDeleteRow(...args),
}));

function buildReq(method: 'POST' | 'DELETE', body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tracks/t-1/tags', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function loadRoute() {
  return import('./route');
}

describe('POST /api/tracks/[id]/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
  });

  it('rejects malformed body with 400', async () => {
    const mod = await loadRoute();
    // TagCreateBodySchema requires `tag` string.
    const res = await mod.POST(buildReq('POST', { foo: 'bar' }), { params: Promise.resolve({ id: 't-1' }) });
    expect(res.status).toBe(400);
    expect(mockRequireRowOwnership).not.toHaveBeenCalled();
  });

  it('returns 401 when ownership check fails', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: false,
      res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    });
    const mod = await loadRoute();
    const res = await mod.POST(
      buildReq('POST', { tag: 'trap', category: 'genre' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(401);
    expect(mockRequireRowOwnership).toHaveBeenCalledWith('tracks', 't-1');
  });

  it('upserts the tag when ownership passes', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { tag: 'trap' }, error: null });
    const mockSelect = vi.fn(() => ({ single: mockSingle }));
    const mockUpsert = vi.fn(() => ({ select: mockSelect }));
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: true,
      userId: 'u-1',
      admin: { from: () => ({ upsert: mockUpsert }) },
    });
    const mod = await loadRoute();
    const res = await mod.POST(
      buildReq('POST', { tag: 'trap', category: 'genre' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      { track_id: 't-1', tag: 'trap', category: 'genre' },
      { onConflict: 'track_id,tag' },
    );
  });

  it('falls through to local store when supabase not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockQuery.mockReturnValue([]); // no existing tag
    const mod = await loadRoute();
    const res = await mod.POST(
      buildReq('POST', { tag: 'drill', category: 'genre' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockRequireRowOwnership).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith('track_tags', { track_id: 't-1', tag: 'drill', category: 'genre' });
  });

  it('local store: skips insert when tag already exists', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    mockQuery.mockReturnValue([{ id: 'tt-1', track_id: 't-1', tag: 'drill' }]);
    const mod = await loadRoute();
    const res = await mod.POST(
      buildReq('POST', { tag: 'drill', category: 'genre' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tracks/[id]/tags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
  });

  it('rejects malformed body with 400', async () => {
    const mod = await loadRoute();
    const res = await mod.DELETE(
      buildReq('DELETE', {}),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when ownership says forbidden', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const mod = await loadRoute();
    const res = await mod.DELETE(
      buildReq('DELETE', { tag: 'trap' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('removes the tag when ownership passes', async () => {
    const eqStep2 = vi.fn().mockResolvedValue({ error: null });
    const eqStep1 = vi.fn(() => ({ eq: eqStep2 }));
    const mockDelete = vi.fn(() => ({ eq: eqStep1 }));
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: true,
      userId: 'u-1',
      admin: { from: () => ({ delete: mockDelete }) },
    });
    const mod = await loadRoute();
    const res = await mod.DELETE(
      buildReq('DELETE', { tag: 'trap' }),
      { params: Promise.resolve({ id: 't-1' }) },
    );
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(eqStep1).toHaveBeenCalledWith('track_id', 't-1');
    expect(eqStep2).toHaveBeenCalledWith('tag', 'trap');
  });
});
