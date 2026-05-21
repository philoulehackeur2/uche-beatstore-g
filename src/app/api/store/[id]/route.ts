import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, getAll, getById } from '@/lib/local-store';
import { createServiceClient } from '@/lib/auth/ownership';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

const TRACK_FIELDS = [
  'id', 'user_id', 'title', 'type',
  'audio_url', 'peaks_url', 'cover_url',
  'duration_seconds', 'bpm', 'key', 'scale',
  'rating', 'description',
  'lease_price_usd', 'exclusive_price_usd',
  'store_listed', 'created_at',
].join(', ');

/**
 * GET /api/store/[id]
 *
 * Public endpoint for the /store/[id] product page. Returns:
 *   { track, creator, related: Track[] }
 *
 * - track must have store_listed = true or returns 404.
 * - related = up to 6 other store-listed tracks from same producer,
 *   same type first, sorted by created_at desc.
 * - creator fields are the same subset /api/store exposes.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    if (!isSupabaseConfigured()) {
      const track = getById('tracks', id) as any;
      if (!track || !track.store_listed) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const all = (getAll('tracks') as any[]).filter(
        (t) => t.store_listed === true && t.id !== id,
      );
      const profiles = (getAll('creator_profiles' as any) as any[]) || [];
      const creator = profiles[0] ?? null;
      return NextResponse.json({ track, creator, related: all.slice(0, 6) });
    }

    const admin = createServiceClient();

    const { data: track, error: tErr } = await admin
      .from('tracks')
      .select(TRACK_FIELDS)
      .eq('id', id)
      .eq('store_listed', true)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!track) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const sellerId = (track as any).user_id as string | undefined;

    // Creator profile + related tracks in parallel
    const [creatorRes, relatedRes] = await Promise.all([
      sellerId
        ? admin
            .from('creator_profiles')
            .select([
              'display_name', 'bio', 'hero_image_url', 'credits',
              'license_lease_price_usd', 'license_exclusive_price_usd', 'license_notes',
              'instagram_handle', 'twitter_handle', 'spotify_url',
              'soundcloud_url', 'website_url', 'contact_email',
            ].join(', '))
            .eq('user_id', sellerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Same type first — two queries unioned client-side is simpler than
      // a single ORDER BY that would require a generated column.
      admin
        .from('tracks')
        .select(TRACK_FIELDS)
        .eq('store_listed', true)
        .eq('type', (track as any).type)
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(6),
    ]);

    let related = (relatedRes.data as any[]) ?? [];

    // Top up with different-type tracks if same-type didn't fill the 6 slots
    if (related.length < 6) {
      const { data: more } = await admin
        .from('tracks')
        .select(TRACK_FIELDS)
        .eq('store_listed', true)
        .neq('type', (track as any).type)
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(6 - related.length);
      related = [...related, ...(more ?? [])];
    }

    // Strip user_id off every track before responding
    const stripUserId = ({ user_id: _u, ...rest }: any) => rest;
    const safeTrack = stripUserId(track);
    const safeRelated = related.map(stripUserId);

    return NextResponse.json({
      track: safeTrack,
      creator: creatorRes.data ?? null,
      related: safeRelated,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
