import { NextResponse } from 'next/server';
import { isSupabaseConfigured, getAll } from '@/lib/local-store';
import { createServiceClient } from '@/lib/auth/ownership';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
// force-dynamic: no static pre-render; every request hits the DB so
// newly listed tracks appear immediately.
export const dynamic = 'force-dynamic';

/**
 * GET /api/store
 *
 * Public-by-design endpoint that powers the /store page. Returns
 * the producer's creator profile + every track flagged with
 * `tracks.store_listed = true`. Bypasses RLS via the service-role
 * client because the visitor has no auth session of their own.
 *
 * Resilient to partially-applied migrations: columns added in
 * migrations 033-035 (store_sort_order, store_enabled, store_featured,
 * store_order, accent_color, font_style) are fetched with try-catch
 * fallbacks so the store works even if those migrations haven't been
 * applied yet.
 *
 * Response shape:
 *   {
 *     creator:           CreatorProfile | null,
 *     tracks:            Array<Track>,
 *     featuredPlaylists: Array<{ id, name, cover_url }>,
 *   }
 */
export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      // Local-store fallback so the demo deploy stays functional.
      const tracks = (getAll('tracks') as any[]).filter((t) => t.store_listed === true);
      const profiles = (getAll('creator_profiles' as any) as any[]) || [];
      const creator = profiles[0] ?? null;
      return NextResponse.json({ creator, tracks, featuredPlaylists: [] });
    }

    const admin = createServiceClient();

    // ── Tracks ─────────────────────────────────────────────────────────────
    // Try with store_sort_order first (migration 033). If the column
    // doesn't exist yet, fall back to a query without it.
    let tracksAny: any[] = [];

    const withSortOrder = await admin
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
      .order('store_sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (withSortOrder.error) {
      // store_sort_order column is missing — fall back without it
      const fallback = await admin
        .from('tracks')
        .select([
          'id', 'user_id', 'title', 'type',
          'audio_url', 'peaks_url', 'cover_url',
          'duration_seconds', 'bpm', 'key', 'scale',
          'rating', 'description',
          'lease_price_usd', 'exclusive_price_usd',
          'store_listed', 'free_download_enabled', 'created_at',
        ].join(', '))
        .eq('store_listed', true)
        .order('created_at', { ascending: false });

      if (fallback.error) throw fallback.error;
      tracksAny = (fallback.data as any[]) ?? [];
    } else {
      tracksAny = (withSortOrder.data as any[]) ?? [];
    }

    // ── Creator profile ─────────────────────────────────────────────────────
    // Fallback: if no listed tracks, still try to get a profile so
    // store_enabled / hero / social data can be shown to the creator.
    const sellerId =
      tracksAny.find((t: any) => !!t.user_id)?.user_id ??
      (await admin.from('creator_profiles').select('user_id').limit(1).maybeSingle())
        .data?.user_id;

    let creator: Record<string, unknown> | null = null;
    let featuredPlaylists: Record<string, unknown>[] = [];

    if (sellerId) {
      // Try fetching with the newer columns (migration 034+035).
      // If those columns don't exist, fall back to the base set.
      const profileWithNew = await admin
        .from('creator_profiles')
        .select([
          'display_name', 'bio', 'hero_image_url', 'credits',
          'license_lease_price_usd', 'license_exclusive_price_usd', 'license_notes',
          'instagram_handle', 'twitter_handle', 'spotify_url',
          'soundcloud_url', 'website_url', 'contact_email',
          'accent_color', 'font_style', 'store_enabled',
        ].join(', '))
        .eq('user_id', sellerId)
        .maybeSingle();

      if (profileWithNew.error) {
        // accent_color / font_style / store_enabled columns are missing — use base set
        const profileBase = await admin
          .from('creator_profiles')
          .select([
            'display_name', 'bio', 'hero_image_url', 'credits',
            'license_lease_price_usd', 'license_exclusive_price_usd', 'license_notes',
            'instagram_handle', 'twitter_handle', 'spotify_url',
            'soundcloud_url', 'website_url', 'contact_email',
          ].join(', '))
          .eq('user_id', sellerId)
          .maybeSingle();
        creator = (profileBase.data as Record<string, unknown> | null) ?? null;
      } else {
        creator = (profileWithNew.data as Record<string, unknown> | null) ?? null;
      }

      // Featured playlists (migration 035: store_featured + store_order).
      // Silently skip if the columns don't exist yet.
      try {
        const playlistsResult = await admin
          .from('playlists')
          .select('id, name, cover_url, store_order')
          .eq('user_id', sellerId)
          .eq('store_featured', true)
          .order('store_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false });

        if (!playlistsResult.error) {
          featuredPlaylists = (playlistsResult.data as Record<string, unknown>[]) ?? [];
        }
        // If error (columns missing), featuredPlaylists stays []
      } catch {
        // swallow — featured playlists are optional UI chrome
      }
    }

    // Strip the owner's auth uuid off every track before responding.
    const safeTracks = tracksAny.map(({ user_id: _u, ...rest }: any) => rest);

    return NextResponse.json({ creator, tracks: safeTracks, featuredPlaylists });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
