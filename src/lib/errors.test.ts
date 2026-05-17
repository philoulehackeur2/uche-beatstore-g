import { describe, it, expect } from 'vitest';
import { errorMessage, isError } from './errors';

/**
 * Tests for the error-coercion helpers.
 *
 * Why these matter:
 *   - Every API route's catch block runs `errorMessage(err)` to surface a
 *     stable error string. If this helper returned undefined or threw, the
 *     client would see a vague "Internal error" with no actionable detail.
 *   - The Supabase SDK throws objects shaped `{ message, code, hint }` —
 *     not Error instances. The naive `err.message` access works for those
 *     but breaks on `throw 'string'`, which we've actually hit in lib/audio
 *     when an upstream service rejected with a plain string.
 */
describe('errorMessage', () => {
  it('returns the .message of an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a thrown string as-is', () => {
    expect(errorMessage('plain string')).toBe('plain string');
  });

  it('extracts .message from Supabase-style objects', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' })).toBe('duplicate key');
  });

  it('JSON-stringifies arbitrary objects when no message present', () => {
    const out = errorMessage({ code: 'XYZ', details: 'something' });
    // Object key order is stable in modern JS; this assertion is precise.
    expect(out).toBe('{"code":"XYZ","details":"something"}');
  });

  it('falls back to String() for non-stringifiable input', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // JSON.stringify throws on circular refs; helper should still return something.
    const out = errorMessage(circular);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('handles null and undefined without returning undefined', () => {
    // Regression: previously `errorMessage(undefined)` returned the *value*
    // undefined because JSON.stringify(undefined) is undefined. The
    // function signature said it returns string — it didn't. Both must
    // now be coerced to readable strings.
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('handles thrown numbers', () => {
    expect(errorMessage(42)).toBe('42');
  });
});

describe('isError', () => {
  it('recognizes Error instances', () => {
    expect(isError(new Error('x'))).toBe(true);
    expect(isError(new TypeError('x'))).toBe(true);
  });

  it('rejects non-Error values', () => {
    expect(isError('string')).toBe(false);
    expect(isError({ message: 'fake' })).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError(undefined)).toBe(false);
  });
});
