import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/auth/ownership';
import { isSupabaseConfigured } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';

const log = createLogger('api.store.free-download');
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/store/free-download?track_id=xxx
 *
 * No auth required — free downloads are public.
 *
 * Validates:
 *   1. track exists and is store_listed
 *   2. free_download_enabled = true on the track
 *
 * Then 302-redirects to /api/audio?src=...&download=1 so the browser
 * triggers a file save. The raw R2 URL is never exposed.
 *
 * Future: insert a record into a download_plays table for analytics.
 */
export async function GET(req: NextRequest) {
  const trackId = new URL(req.url).searchParams.get('track_id');
  if (!trackId) {
    return NextResponse.json({ error: 'track_id required' }, { status: 400 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const admin = createServiceClient();

    const { data: track } = await admin
      .from('tracks')
      .select('id, title, audio_url, store_listed, free_download_enabled')
      .eq('id', trackId)
      .maybeSingle();

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }
    if (!track.store_listed) {
      return NextResponse.json({ error: 'Track is not listed' }, { status: 403 });
    }
    if (!track.free_download_enabled) {
      return NextResponse.json({ error: 'Free download not enabled for this track' }, { status: 403 });
    }
    if (!track.audio_url) {
      return NextResponse.json({ error: 'Audio not available' }, { status: 404 });
    }

    const extMatch = (track.audio_url as string).match(/\.(mp3|wav|flac|aiff|aif|m4a|ogg)(?:\?|$)/i);
    const ext = (extMatch?.[1] ?? 'mp3').toLowerCase();
    const filename = `${track.title || 'track'}.${ext}`;
    const proxied = `/api/audio?src=${encodeURIComponent(track.audio_url)}&download=1&filename=${encodeURIComponent(filename)}`;

    return NextResponse.redirect(new URL(proxied, req.url), 302);
  } catch (err) {
    log.error('free-download failed', { trackId, error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
