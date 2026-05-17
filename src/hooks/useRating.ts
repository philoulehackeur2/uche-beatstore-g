import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/useToast';

/**
 * Optimistic star-rating mutation hook.
 *
 * The earlier version was silently broken in two ways:
 *
 *  1. Errors were swallowed. If the rate API returned 401/403/500, the hook
 *     rolled back the optimistic value but didn't tell the user — so the
 *     star would fill, then quietly empty again, and the user concluded
 *     "ratings don't persist." We now surface errors via toast.
 *
 *  2. Cache invalidation only worked for callers that wrapped their list
 *     fetch in React Query. Most pages use plain useState + fetch and
 *     never see the invalidate event, so the rating stuck visually but
 *     the parent's local copy of the track was stale. The new `onChange`
 *     callback lets those parents refetch directly.
 */
export function useRating(
  trackId: string,
  initial: number,
  onChange?: (newRating: number) => void,
) {
  const [rating, setRating] = useState(initial);
  const qc = useQueryClient();

  // Sync local state when the track (or its rating) changes upstream.
  useEffect(() => {
    setRating(initial);
  }, [trackId, initial]);

  const { mutate: rate, isPending: loading } = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch(`/api/tracks/${trackId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Bubble the server's error string so onError can show it.
        throw new Error(body.error || `Rating failed (${res.status})`);
      }
      return res.json();
    },
    onMutate: async (newValue) => {
      setRating(newValue);
      await qc.cancelQueries({ queryKey: ['tracks'] });
      return { previousValue: initial };
    },
    onError: (err: Error, _newValue, context) => {
      if (context) setRating(context.previousValue);
      toast.error('Couldn’t save rating', err.message);
    },
    onSuccess: (_data, newValue) => {
      // Let plain-fetch parents know the canonical value so they can refetch
      // their own state instead of waiting on a React Query cache they
      // don't participate in.
      if (onChange) onChange(newValue);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['tracks'] });
    },
  });

  return { rating, rate, loading };
}
