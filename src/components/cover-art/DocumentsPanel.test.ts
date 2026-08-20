import { describe, expect, it } from 'vitest';
import { formatBytes, formatRelativeTime } from './DocumentsPanel';

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2 KB'],
    [1024 * 1024 * 3.5, '3.5 MB'],
  ])('formats %i as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-20T12:00:00.000Z').getTime();

  it.each([
    ['2026-08-20T11:59:40.000Z', 'just now'],
    ['2026-08-20T11:45:00.000Z', '15m ago'],
    ['2026-08-20T09:00:00.000Z', '3h ago'],
    ['2026-08-16T12:00:00.000Z', '4d ago'],
  ])('formats %s as %s', (iso, expected) => {
    expect(formatRelativeTime(iso, now)).toBe(expected);
  });

  it('falls back to a date for anything old', () => {
    expect(formatRelativeTime('2024-01-01T00:00:00.000Z', now)).toMatch(/\d/);
  });

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });

  it('never reports a negative age for a clock skewed into the future', () => {
    expect(formatRelativeTime('2026-08-20T12:05:00.000Z', now)).toBe('just now');
  });
});
