/**
 * Home page section configuration.
 *
 * This is the single place to define which rows appear on the dashboard
 * Home page and what data they show. Each entry maps to a horizontal
 * scrollable row of cards on the page.
 *
 * Later this can be exposed in the Store Editor so the producer can
 * reorder/hide/rename rows without touching code.
 */

import type { TrackStatus, TrackType } from '@/lib/types';

// ── Data source for a row ─────────────────────────────────────────
export type HomeRowSource = 'tracks' | 'playlists' | 'projects' | 'recent';

export type HomeSortMode =
  | 'newest'       // by created_at desc
  | 'plays'        // by play count desc (requires analytics join)
  | 'rating'       // by rating desc
  | 'alphabetical'; // by title asc

export interface HomeRowFilter {
  /** Genre tags to match (OR logic — any match qualifies the track) */
  genres?: string[];
  /** Track states to match (OR logic) */
  statuses?: TrackStatus[];
  /** Track types to match (OR logic) */
  types?: TrackType[];
  /** Only include tracks listed in the store */
  storeListed?: boolean;
  /** Only include tracks NOT listed in the store */
  notStoreListed?: boolean;
  /** Tracks with a rating ≥ this value */
  minRating?: number;
}

export interface HomeRowConfig {
  /** Stable unique id used as React key and for user preference storage */
  id: string;
  /** Row heading shown above the card strip */
  title: string;
  /** Optional sub-label shown below the title in smaller text */
  subtitle?: string;
  /** Where the cards come from */
  source: HomeRowSource;
  /** Filter criteria (only applies to 'tracks' source) */
  filter?: HomeRowFilter;
  /** Sort order for the row cards */
  sortBy?: HomeSortMode;
  /** Max number of cards in the strip (default 10) */
  maxItems?: number;
  /** If true, this row is hidden when home filters are active and nothing matches */
  hideWhenEmpty?: boolean;
}

// ── Default rows ──────────────────────────────────────────────────
// Edit this array to reorder/add/remove rows without touching any
// rendering code. Each entry is one horizontal strip.

export const DEFAULT_HOME_ROWS: HomeRowConfig[] = [
  {
    id: 'recent',
    title: 'Recently played',
    source: 'recent',
    maxItems: 8,
  },
  {
    id: 'maq_ideas',
    title: 'MAQ — Maquette ideas',
    subtitle: 'Stripped demos to develop',
    source: 'tracks',
    filter: { statuses: ['maq'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'wip',
    title: 'WIP',
    subtitle: 'In progress',
    source: 'tracks',
    filter: { statuses: ['needs_work'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'finished_for_sale',
    title: 'Finished beats',
    subtitle: 'Ready to sell',
    source: 'tracks',
    filter: { statuses: ['finished'] },
    sortBy: 'rating',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'playlists',
    title: 'Your playlists',
    source: 'playlists',
    sortBy: 'newest',
    maxItems: 8,
  },
  {
    id: 'projects',
    title: 'Projects',
    subtitle: 'Active sessions',
    source: 'projects',
    sortBy: 'newest',
    maxItems: 8,
  },
  {
    id: 'genre_drill',
    title: 'Drill',
    source: 'tracks',
    filter: { genres: ['Drill'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'genre_trap',
    title: 'Trap',
    source: 'tracks',
    filter: { genres: ['Trap'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'genre_rnb',
    title: 'R&B',
    source: 'tracks',
    filter: { genres: ['R&B'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'genre_afrobeats',
    title: 'Afrobeats',
    source: 'tracks',
    filter: { genres: ['Afrobeats'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'genre_amapiano',
    title: 'Amapiano',
    source: 'tracks',
    filter: { genres: ['Amapiano'] },
    sortBy: 'newest',
    maxItems: 10,
    hideWhenEmpty: true,
  },
  {
    id: 'store',
    title: 'In your store',
    source: 'tracks',
    filter: { storeListed: true },
    sortBy: 'plays',
    maxItems: 10,
  },
  {
    id: 'top_rated',
    title: 'Top rated',
    source: 'tracks',
    filter: { minRating: 4 },
    sortBy: 'rating',
    maxItems: 10,
    hideWhenEmpty: true,
  },
];
