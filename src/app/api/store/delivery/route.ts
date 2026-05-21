import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/auth/ownership';
import { isSupabaseConfigured } from '@/lib/db';
import { getAppUrl } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';

const log = createLogger('api.store.delivery');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store/delivery?session_id=cs_xxx
 *
 * Public-ish endpoint (no auth, but requires a valid Stripe session_id
 * that matches a license_purchases row with download_unlocked=true).
 *
 * Returns everything the /store/download portal needs to render:
 *   {
 *     purchase: {
 *       id, buyer_email, amount_usd, created_at, status,
 *       line_items: [{track_id, license_type}]
 *     },
 *     tracks: [{id, title, type, cover_url, duration_seconds, bpm, key}],
 *     download_base: string  // base URL for download links
 *   }
 *
 * The download links themselves are constructed client-side as:
 *   /api/store/download-file?session_id=xxx&track_id=yyy
 * so the portal can show per-track buttons without extra round-trips.
 *
 * Security:
 *   - session_id is a Stripe cs_xxx — not guessable
 *   - download_unlocked=false rows (refunded/disputed) return 403
 *   - No PII beyond what the buyer themselves submitted at checkout
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const admin = createServiceClient();

    const { data: purchase, error: pErr } = await admin
      .from('license_purchases')
      .select('id, buyer_email, amount_usd, created_at, status, download_unlocked, track_ids, line_items, share_token, seller_user_id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();

    if (pErr) throw pErr;
    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });
    }
    if (!purchase.download_unlocked) {
      return NextResponse.json(
        { error: 'Download access revoked (refunded or disputed)' },
        { status: 403 },
      );
    }

    const trackIds: string[] = Array.isArray(purchase.track_ids) ? purchase.track_ids : [];
    let tracks: any[] = [];

    if (trackIds.length > 0) {
      const { data: trackRows } = await admin
        .from('tracks')
        .select('id, title, type, cover_url, audio_url, peaks_url, duration_seconds, bpm, key, scale')
        .in('id', trackIds);
      tracks = trackRows ?? [];
    }

    // Determine the file types each track was licensed under.
    // line_items is [{track_id, license_type}] from migration 029.
    const lineItems: Array<{ track_id: string; license_type: string }> =
      Array.isArray(purchase.line_items) ? purchase.line_items : [];

    // Build a richer tracks array that includes what the buyer licensed
    const tracksWithLicense = tracks.map((t) => {
      const item = lineItems.find((li) => li.track_id === t.id);
      const licenseType = item?.license_type ?? 'lease';
      return {
        ...t,
        license_type: licenseType,
        // What formats are included depends on the license tier
        file_types: licenseType === 'exclusive' ? ['MP3', 'WAV', 'STEMS'] : ['MP3'],
      };
    });

    const APP_URL = getAppUrl();

    return NextResponse.json({
      purchase: {
        id: purchase.id,
        buyer_email: purchase.buyer_email,
        amount_usd: purchase.amount_usd,
        created_at: purchase.created_at,
        status: purchase.status,
      },
      tracks: tracksWithLicense,
      // The download endpoint that gates file access by session_id
      download_base: `${APP_URL}/api/store/download-file`,
    });
  } catch (err) {
    log.error('delivery lookup failed', { sessionId, error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
