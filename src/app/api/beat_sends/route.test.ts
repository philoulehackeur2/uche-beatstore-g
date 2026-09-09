/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsSupabaseConfigured = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/db', () => ({
  isSupabaseConfigured: () => mockIsSupabaseConfigured(),
  createServiceClient: () => mockCreateServiceClient(),
  getAll: vi.fn(() => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => mockGetUser() } }),
}));

/**
 * PostgREST serialises `.in()` into the request URL. Undici rejects a request
 * line past roughly 16KB, and the failure surfaces as a bare
 * `TypeError: fetch failed` — a 500 with no hint that the id list was the
 * cause. This fake reproduces that ceiling so a route that stops chunking
 * fails the test the same way it failed in production.
 */
const URL_LIMIT_BYTES = 16 * 1024;

type RowsByTable = Record<string, any[]>;

function adminClient(rows: RowsByTable, seen: number[]) {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: (column: string, value: unknown) =>
            Promise.resolve({
              data: (rows[table] ?? []).filter((r) => r[column] === value),
              error: null,
            }),
          in: (column: string, values: string[]) => {
            seen.push(values.length);
            const url = `https://project.supabase.co/rest/v1/${table}?select=*&${column}=in.(${values.join(',')})`;
            if (url.length > URL_LIMIT_BYTES) {
              return Promise.reject(new TypeError('fetch failed'));
            }
            return Promise.resolve({
              data: (rows[table] ?? []).filter((r) => values.includes(r[column])),
              error: null,
            });
          },
        }),
      };
    },
  };
}

// 429 contacts is the reported account size; uuid-length ids are what makes
// the URL long, so the test uses real-width ids rather than `id-1`.
const CONTACT_COUNT = 429;
const contactId = (i: number) => `0000${String(i).padStart(4, '0')}-aaaa-4bbb-8ccc-ddddeeeeffff`;

function seed() {
  const contacts = Array.from({ length: CONTACT_COUNT }, (_, i) => ({
    id: contactId(i),
    user_id: 'owner-1',
  }));
  // Deliberately interleaved so the newest row lives in the LAST batch: a
  // route that sorted per-batch instead of across all rows would pass a
  // "count" assertion and still show the wrong send at the top.
  const beat_sends = contacts.map((c, i) => ({
    id: `send-${i}`,
    contact_id: c.id,
    sent_at: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
  }));
  return { contacts: [...contacts, { id: 'other', user_id: 'owner-2' }], beat_sends };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSupabaseConfigured.mockReturnValue(true);
  mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
});

describe('GET /api/beat_sends', () => {
  it('returns the full send history for a CRM with hundreds of contacts', async () => {
    const seen: number[] = [];
    mockCreateServiceClient.mockReturnValue(adminClient(seed(), seen));

    const { GET } = await import('./route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sends).toHaveLength(CONTACT_COUNT);
    expect(seen.length).toBeGreaterThan(1);
    expect(Math.max(...seen)).toBeLessThanOrEqual(200);
  });

  it('sorts newest-first across batch boundaries, not within each batch', async () => {
    mockCreateServiceClient.mockReturnValue(adminClient(seed(), []));

    const { GET } = await import('./route');
    const body = await (await GET()).json();

    const sentAt = body.sends.map((s: any) => s.sent_at);
    expect(sentAt).toEqual([...sentAt].sort().reverse());
    expect(body.sends[0].id).toBe(`send-${CONTACT_COUNT - 1}`);
  });

  it('scopes to the signed-in owner and never leaks another account', async () => {
    const rows = seed();
    rows.beat_sends.push({ id: 'foreign', contact_id: 'other', sent_at: '2030-01-01T00:00:00.000Z' });
    mockCreateServiceClient.mockReturnValue(adminClient(rows, []));

    const { GET } = await import('./route');
    const body = await (await GET()).json();

    expect(body.sends.some((s: any) => s.id === 'foreign')).toBe(false);
  });

  it('returns an empty list for a signed-out visitor without querying', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { GET } = await import('./route');
    const body = await (await GET()).json();

    expect(body.sends).toEqual([]);
    expect(mockCreateServiceClient).not.toHaveBeenCalled();
  });
});
