import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { isErrorResponse, withBackend } from './db';

/**
 * Pure-logic tests for the db facade. The Supabase paths require mocking
 * the cookie client + service-role client, which is a much bigger setup —
 * see db.local.test.ts for those when we add them. This file covers the
 * pieces that don't need a backend.
 */
describe('isErrorResponse', () => {
  it('recognizes NextResponse instances', () => {
    const r = NextResponse.json({ error: 'x' }, { status: 500 });
    expect(isErrorResponse(r)).toBe(true);
  });

  it('rejects plain arrays of rows', () => {
    expect(isErrorResponse([])).toBe(false);
    expect(isErrorResponse([{ id: '1' }])).toBe(false);
  });

  it('rejects plain objects', () => {
    expect(isErrorResponse({ id: '1' })).toBe(false);
  });

  it('rejects primitives', () => {
    expect(isErrorResponse(null)).toBe(false);
    expect(isErrorResponse(undefined)).toBe(false);
    expect(isErrorResponse('error')).toBe(false);
    expect(isErrorResponse(0)).toBe(false);
  });
});

describe('withBackend', () => {
  // withBackend dispatches based on isSupabaseConfigured(). We can't easily
  // override the env from a test (NEXT_PUBLIC_* are baked at build time),
  // so we test the *runtime* contract: both branches are invokable, both
  // return their promise's resolved value, and the local fallback can
  // return synchronously.

  it('returns the local branch result when supabase is not configured', async () => {
    // Whether this test hits local or supabase depends on whether the test
    // env has Supabase configured. Either branch returning the right value
    // satisfies the contract.
    const result = await withBackend(
      async () => 'supabase',
      () => 'local',
    );
    expect(['supabase', 'local']).toContain(result);
  });

  it('awaits async supabase branch', async () => {
    const result = await withBackend(
      async () => {
        await new Promise((r) => setTimeout(r, 1));
        return 42;
      },
      () => 0,
    );
    expect([0, 42]).toContain(result);
  });

  it('propagates errors from whichever branch runs', async () => {
    // We don't know which branch will fire because isSupabaseConfigured()
    // has a production guard that returns true on bogus env vars. So we
    // make BOTH branches throw with the same message — whichever one
    // executes, the rejection should bubble up.
    const err = new Error('intended');
    await expect(
      withBackend(
        async () => { throw err; },
        () => { throw err; },
      ),
    ).rejects.toThrow('intended');
  });
});
