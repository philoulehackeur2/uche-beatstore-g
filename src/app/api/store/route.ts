import { NextResponse } from 'next/server';
import { isSupabaseConfigured, getAll } from '@/lib/local-store';
import { createServiceClient } from '@/lib/auth/ownership';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
// force-dynamic: no static pre-render; every request hits the DB so
// newly listed tracks appear immediately (no 60-second stale window).
export const dynamic = 'force-dynamic';

/**
 * GET /api/store
 *
 * Public-by-design endpoint that powers the /store page. Returns
 * the producer's creator profile + every track flagged with
 * `tracks.store_listed = true`. Bypasses RLS via the service-role
 * client because the visitor has no auth session of their own.
 *
 * Response shape:
 *   {
 *     creator:  CreatorProfile | null,
 *     tracks:   Array<Track>,
 *   }
 *
 * The track rows include the per-track price overrides (lease /
 * exclusive) so the storefront can resolve prices client-side
 * without an extra hop. Profile-level defaults are included on the
 * creator object for tracks that didn't set their own.
 *
 * No personally-identifying data leaks beyond what the creator
 * already chose to surface on /settings (display_name, bio, hero
 * image, socials). The auth-user uuid and contact_email are
 * scrubbed unless contact_email is the public one the creator
 * filled in deliberately.
 */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      // Local-store fallback so the demo deploy stays functional.
      const tracks = (getAll('tracks') as any[]).filter((t) => t.store_listed === true);
      const profiles = (getAll('creator_profiles' as any) as any[]) || [];
      const creator = profiles[0] ?? null;
      return NextResponse.json({ creator, tracks });
    }

    const admin = createServiceClient();

    // Listed tracks. We pull everything the storefront's card needs
    // in one round-trip — title / type / cover / metadata + the
    // pricing overrides. `created_at desc` puts new drops at the
    // top, which is what 99% of beatstores do.
    const { data: tracks, error: tErr } = await admin
      .from('tracks')
      .select([
        'id', 'user_id', 'title', 'type',
        'audio_url', 'peaks_url', 'cover_url',
        'duration_seconds', 'bpm', 'key', 'scale',
        'rating', 'description',
        'lease_price_usd', 'exclusive_price_usd',
        'store_listed', 'free_download_enabled', 'store_sort_order', 'created_at',
      ].join(', '))
      .eq('store_listed', true)
      // Explicit sort order takes priority; new drops (created_at) are tiebreaker
      .order('store_sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (tErr) throw tErr;

    // Single-tenant app: the creator profile we surface belongs to
    // whichever owner has listed tracks. Pick from the most recent
    // track's user_id; if there are no listed tracks, the creator
    // ends up null and the page renders an empty-state.
    let creator: Record<string, unknown> | null = null;
    let featuredPlaylists: Record<string, unknown>[] = [];
    const tracksAny = (tracks as any[]) ?? [];

    // Fallback: if no listed tracks, still try to get a profile so
    // store_enabled / hero / social data can be shown to the creator.
    const sellerId =
      tracksAny.find((t: any) => !!t.user_id)?.user_id ??
      (await admin.from('creator_profiles').select('user_id').limit(1).maybeSingle())
        .data?.user_id;

    if (sellerId) {
      const [profileResult, playlistsResult] = await Promise.all([
        admin
          .from('creator_profiles')
          .select([
            'display_name', 'bio', 'hero_image_url', 'credits',
            'license_lease_price_usd', 'license_exclusive_price_usd', 'license_notes',
            'instagram_handle', 'twitter_handle', 'spotify_url',
            'soundcloud_url', 'website_url', 'contact_email',
            'accent_color', 'font_style', 'store_enabled',
          ].join(', '))
          .eq('user_id', sellerId)
          .maybeSingle(),
        admin
          .from('playlists')
          .select('id, name, cover_url, store_order')
          .eq('user_id', sellerId)
          .eq('store_featured', true)
          .order('store_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ]);
      creator = (profileResult.data as Record<string, unknown> | null) ?? null;
      featuredPlaylists = (playlistsResult.data as Record<string, unknown>[]) ?? [];
    }

    // Strip the owner's auth uuid off every track before responding
    // — recipients don't need it and it would be PII leakage if we
    // ever multi-tenanted.
    const safeTracks = tracksAny.map(({ user_id: _u, ...rest }: any) => rest);

    return NextResponse.json({ creator, tracks: safeTracks, featuredPlaylists });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
