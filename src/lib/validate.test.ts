import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { readBody, z } from './validate';

/**
 * Tests for readBody — the Zod-validation entry point used by every
 * mutation route.
 *
 * We build a minimal NextRequest stand-in that only implements `.json()`.
 * `readBody` doesn't touch headers / URL / method, so the cast is safe.
 */
function fakeReq(body: unknown, malformed = false): NextRequest {
  return {
    json: async () => {
      if (malformed) throw new SyntaxError('Invalid JSON');
      return body;
    },
  } as unknown as NextRequest;
}

describe('readBody', () => {
  it('returns parsed data on a valid body', async () => {
    const Schema = z.object({ rating: z.number().int().min(0).max(5) });
    const res = await readBody(fakeReq({ rating: 4 }), Schema);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ rating: 4 });
  });

  it('responds 400 with structured issues on validation failure', async () => {
    const Schema = z.object({ rating: z.number().int().min(0).max(5) });
    const res = await readBody(fakeReq({ rating: 99 }), Schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.res.status).toBe(400);
      const body = await res.res.json();
      expect(body.error).toMatch(/less than or equal|<=|maximum/i);
      expect(Array.isArray(body.issues)).toBe(true);
      expect(body.issues[0].path).toBe('rating');
    }
  });

  it('responds 400 on malformed JSON', async () => {
    const Schema = z.object({ x: z.string() });
    const res = await readBody(fakeReq({}, true), Schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.res.status).toBe(400);
      const body = await res.res.json();
      expect(body.error).toMatch(/JSON/i);
    }
  });

  it('strips extra fields by default (no .strict() set)', async () => {
    const Schema = z.object({ name: z.string() });
    const res = await readBody(fakeReq({ name: 'ok', sneaky: 1 }), Schema);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.name).toBe('ok');
      // Default Zod object strips unknown keys silently — verifying so a
      // future opt-in to .strict() is a deliberate decision, not a surprise.
      expect((res.data as Record<string, unknown>).sneaky).toBeUndefined();
    }
  });

  it('handles nested object validation', async () => {
    const Schema = z.object({
      user: z.object({ id: z.string(), age: z.number().int().nonnegative() }),
    });
    const okRes = await readBody(fakeReq({ user: { id: 'u1', age: 30 } }), Schema);
    expect(okRes.ok).toBe(true);

    const badRes = await readBody(fakeReq({ user: { id: 'u1', age: -1 } }), Schema);
    expect(badRes.ok).toBe(false);
    if (!badRes.ok) {
      const body = await badRes.res.json();
      expect(body.issues[0].path).toBe('user.age');
    }
  });

  it('handles enum validation', async () => {
    const Schema = z.object({ role: z.enum(['viewer', 'commenter', 'editor']) });
    const okRes = await readBody(fakeReq({ role: 'editor' }), Schema);
    expect(okRes.ok).toBe(true);

    const badRes = await readBody(fakeReq({ role: 'admin' }), Schema);
    expect(badRes.ok).toBe(false);
  });
});
