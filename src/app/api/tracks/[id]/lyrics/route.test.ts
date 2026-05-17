/**
 * Route tests for /api/tracks/[id]/lyrics.
 *
 * Pins the auto-snapshot heuristic (large diff OR stale-by-60s) and the
 * ownership-gated read/write through getOwned/updateOwned.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockGetOwned = vi.fn();
const mockUpdateOwned = vi.fn();
// isErrorResponse from @/lib/db distinguishes NextResponse from raw rows.
// We mirror its behaviour here: anything with a non-numeric status that
// also exposes .json() is treated as an error response in production.
const isErr = (v: unknown): v is NextResponse =>
  typeof v === 'object' && v !== null && typeof (v as { status?: number }).status === 'number' && typeof (v as { json?: unknown }).json === 'function';

vi.mock('@/lib/db', () => ({
  getOwned: (...args: unknown[]) => mockGetOwned(...args),
  updateOwned: (...args: unknown[]) => mockUpdateOwned(...args),
  isErrorResponse: (v: unknown) => isErr(v),
}));

function buildPut(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/tracks/t-1/lyrics', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callPut(body: unknown) {
  const mod = await import('./route');
  return mod.PUT(buildPut(body), { params: Promise.resolve({ id: 't-1' }) });
}

describe('PUT /api/tracks/[id]/lyrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects malformed body with 400', async () => {
    const res = await callPut({ foo: 'bar' });
    expect(res.status).toBe(400);
    expect(mockGetOwned).not.toHaveBeenCalled();
  });

  it('propagates ownership 401 from getOwned', async () => {
    mockGetOwned.mockResolvedValueOnce(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
    const res = await callPut({ content: 'verse one' });
    expect(res.status).toBe(401);
    expect(mockUpdateOwned).not.toHaveBeenCalled();
  });

  it('does NOT snapshot on a tiny edit close in time', async () => {
    mockGetOwned.mockResolvedValueOnce({
      lyrics: 'hello',
      lyrics_updated_at: new Date().toISOString(),
      lyrics_history: [],
    });
    mockUpdateOwned.mockResolvedValueOnce({
      lyrics: 'hello!',
      lyrics_updated_at: 'now',
      lyrics_history: [],
    });
    const res = await callPut({ content: 'hello!' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.snapshotted).toBe(false);
    // Confirm the history we passed to updateOwned was empty (no snapshot).
    const patch = mockUpdateOwned.mock.calls[0]?.[2] as { lyrics_history: unknown[] };
    expect(patch.lyrics_history).toEqual([]);
  });

  it('auto-snapshots when diff exceeds 40 chars', async () => {
    const prevAt = new Date().toISOString();
    mockGetOwned.mockResolvedValueOnce({
      lyrics: 'short',
      lyrics_updated_at: prevAt,
      lyrics_history: [],
    });
    mockUpdateOwned.mockImplementationOnce(async (_t, _id, patch: { lyrics_history: unknown[] }) => ({
      lyrics: 'x'.repeat(100),
      lyrics_updated_at: 'now',
      lyrics_history: patch.lyrics_history,
    }));
    const res = await callPut({ content: 'x'.repeat(100) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.snapshotted).toBe(true);
    expect(json.history).toHaveLength(1);
    expect(json.history[0]).toMatchObject({ content: 'short' });
  });

  it('honors explicit snapshot=true even on small edits', async () => {
    mockGetOwned.mockResolvedValueOnce({
      lyrics: 'a',
      lyrics_updated_at: new Date().toISOString(),
      lyrics_history: [],
    });
    mockUpdateOwned.mockImplementationOnce(async (_t, _id, patch: { lyrics_history: unknown[] }) => ({
      lyrics: 'b',
      lyrics_updated_at: 'now',
      lyrics_history: patch.lyrics_history,
    }));
    const res = await callPut({ content: 'b', snapshot: true });
    const json = await res.json();
    expect(json.snapshotted).toBe(true);
    expect(json.history).toHaveLength(1);
  });

  it('caps history at MAX_HISTORY=30 entries', async () => {
    const oldHistory = Array.from({ length: 30 }, (_, i) => ({ at: `t-${i}`, content: `v${i}` }));
    mockGetOwned.mockResolvedValueOnce({
      lyrics: 'previous',
      lyrics_updated_at: new Date().toISOString(),
      lyrics_history: oldHistory,
    });
    mockUpdateOwned.mockImplementationOnce(async (_t, _id, patch: { lyrics_history: unknown[] }) => ({
      lyrics: 'updated',
      lyrics_updated_at: 'now',
      lyrics_history: patch.lyrics_history,
    }));
    const res = await callPut({ content: 'updated', snapshot: true });
    const json = await res.json();
    // 1 new + 30 old → clipped to 30.
    expect(json.history).toHaveLength(30);
    expect(json.history[0].content).toBe('previous');
  });
});
