/**
 * Route tests for /api/tracks/[id]/rate.
 *
 * Pattern: mock `@/lib/db` so we control isSupabaseConfigured,
 * requireRowOwnership, and the admin chain (.from().update().eq().select()
 * .single()). The handler itself is a server module — we import its POST
 * function directly and call it with a constructed NextRequest.
 *
 * This is the model for every route test going forward. Adds a regression
 * net for the auth-gate class of bug: forgetting requireRowOwnership in
 * a new route handler makes the "rejects 401" / "rejects 403" tests fail
 * immediately.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mocks need to be declared before importing the route handler so vi
// rewrites the import resolution.
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSingle = vi.fn();
const mockHistoryInsert = vi.fn();
const mockRequireRowOwnership = vi.fn();
const mockIsSupabaseConfigured = vi.fn();
const mockLocalUpdate = vi.fn();
const mockLocalInsert = vi.fn();

vi.mock('@/lib/db', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  requireRowOwnership: (...args: unknown[]) => mockRequireRowOwnership(...args),
  update: (...args: unknown[]) => mockLocalUpdate(...args),
  insert: (...args: unknown[]) => mockLocalInsert(...args),
}));

// Helper to build a NextRequest with a JSON body — readBody parses
// `req.json()` so we just need a working Request.
function buildPost(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tracks/t-1/rate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Lazy import — module-level mocks must be in place first.
async function callRoute(req: NextRequest, id = 't-1') {
  const mod = await import('./route');
  return mod.POST(req, { params: Promise.resolve({ id }) });
}

describe('POST /api/tracks/[id]/rate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSupabaseConfigured.mockReturnValue(true);
    // Wire the supabase chain — .from(tracks).update().eq().select().single()
    // and .from(rating_history).insert(). We stash the chain leaves in
    // closures so each test can read the final calls.
    mockSingle.mockResolvedValue({ data: { id: 't-1', rating: 4 }, error: null });
    mockUpdate.mockReturnValue({
      eq: () => ({ select: () => ({ single: mockSingle }) }),
    });
    mockInsert.mockResolvedValue({ data: null, error: null });
    mockHistoryInsert.mockResolvedValue({ data: null, error: null });
  });

  it('rejects malformed body with 400 (Zod)', async () => {
    const res = await callRoute(buildPost({ rating: 'not-a-number' }));
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range rating with 400', async () => {
    const res = await callRoute(buildPost({ rating: 99 }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when requireRowOwnership says unauth', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: false,
      res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
    });
    const res = await callRoute(buildPost({ rating: 4 }));
    expect(res.status).toBe(401);
    expect(mockRequireRowOwnership).toHaveBeenCalledWith('tracks', 't-1');
  });

  it('returns 403 when requireRowOwnership says forbidden', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: false,
      res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const res = await callRoute(buildPost({ rating: 4 }));
    expect(res.status).toBe(403);
  });

  it('persists rating + history when ownership passes', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: true,
      userId: 'u-1',
      admin: {
        from: (table: string) => {
          if (table === 'tracks') return { update: mockUpdate };
          if (table === 'rating_history') return { insert: mockHistoryInsert };
          throw new Error(`unexpected table ${table}`);
        },
      },
    });
    const res = await callRoute(buildPost({ rating: 4 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 't-1', rating: 4 });
    // Real session user id should land in the history row — the previous
    // implementation used an all-zero placeholder UUID that broke FK
    // validation on prod.
    expect(mockHistoryInsert).toHaveBeenCalledWith({
      track_id: 't-1',
      user_id: 'u-1',
      rating: 4,
    });
  });

  it('rating 0 clears the field and skips history', async () => {
    mockRequireRowOwnership.mockResolvedValueOnce({
      ok: true,
      userId: 'u-1',
      admin: {
        from: (table: string) => {
          if (table === 'tracks') return { update: mockUpdate };
          if (table === 'rating_history') return { insert: mockHistoryInsert };
          throw new Error(`unexpected table ${table}`);
        },
      },
    });
    const res = await callRoute(buildPost({ rating: 0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rating).toBeNull();
    // Zero ratings are explicit "clear" actions — we don't want them
    // polluting the history stream.
    expect(mockHistoryInsert).not.toHaveBeenCalled();
  });

  it('falls through to local store when supabase not configured', async () => {
    mockIsSupabaseConfigured.mockReturnValue(false);
    const res = await callRoute(buildPost({ rating: 3 }));
    expect(res.status).toBe(200);
    expect(mockRequireRowOwnership).not.toHaveBeenCalled();
    expect(mockLocalUpdate).toHaveBeenCalledWith('tracks', 't-1', { rating: 3 });
    expect(mockLocalInsert).toHaveBeenCalledWith('rating_history', expect.objectContaining({ rating: 3 }));
  });
});
