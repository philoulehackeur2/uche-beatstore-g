'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Guest wishlist — visitors save tracks without an account. Backed by
 * localStorage so the saved set survives reloads + new tabs on the
 * same browser. Stored as `string[]` because JSON can't serialize
 * `Set`; we re-hydrate into a Set on read for O(1) `.has()`.
 */

interface WishlistState {
  ids: string[];
  toggle: (trackId: string) => void;
  clear: () => void;
}

const store = create<WishlistState>()(
  persist(
    (set, get) => ({
      ids: [],
      toggle: (trackId) => {
        const ids = get().ids;
        set({ ids: ids.includes(trackId) ? ids.filter((x) => x !== trackId) : [...ids, trackId] });
      },
      clear: () => set({ ids: [] }),
    }),
    { name: 'antigravity-wishlist' },
  ),
);

export function useWishlist(): {
  ids: Set<string>;
  has: (trackId: string) => boolean;
  toggle: (trackId: string) => void;
  count: number;
} {
  const ids = store((s) => s.ids);
  const toggle = store((s) => s.toggle);
  const setIds = new Set(ids);
  return { ids: setIds, has: (id) => setIds.has(id), toggle, count: ids.length };
}
