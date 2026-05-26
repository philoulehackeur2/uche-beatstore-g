/**
 * Pure helpers used across /store sub-components.
 */
import type { StoreTrack } from './types';

export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)+/, 'https://');
}

export function fmtDur(s: number | null | undefined): string {
  if (!s) return '—';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

export function getSimilarTracks(
  track: StoreTrack,
  pool: StoreTrack[],
  limit = 4,
): StoreTrack[] {
  const myTags = new Set(
    (track.tags ?? [])
      .filter((t) => t.category === 'genre' || t.category === 'mood')
      .map((t) => t.tag.toLowerCase()),
  );
  if (myTags.size === 0) return [];
  return pool
    .filter((t) => t.id !== track.id)
    .map((t) => ({
      track: t,
      score: (t.tags ?? []).filter(
        (tag) =>
          (tag.category === 'genre' || tag.category === 'mood') &&
          myTags.has(tag.tag.toLowerCase()),
      ).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ track: t }) => t);
}
