import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isSupabaseConfigured, requireRowOwnership, createServiceClient } from '@/lib/db';
import { readBody } from '@/lib/validate';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';

const log = createLogger('api.tracks.arrangement');
export const runtime = 'nodejs';

/**
 * Per-(track, user) arrangement state.
 *
 *   GET  /api/tracks/[id]/arrangement   → { markers: number[], ordering: string[] }
 *   PUT  /api/tracks/[id]/arrangement   ← { markers: number[], ordering: string[] }
 *
 * Auth: the parent track is gated via `requireRowOwnership('tracks', id)`
 * so a viewer can't write someone else's arrangement. The row itself
 * is stamped with the caller's user_id; uniqueness is on
 * (track_id, user_id) so each collaborator gets their own.
 *
 * Empty/missing arrangement returns {markers:[], ordering:[]} — the
 * client treats that as "fresh start" rather than 404, avoiding a
 * spurious error on first load.
 */

const BodySchema = z.object({
  markers: z.array(z.number().nonnegative()).max(500),
  ordering: z.array(z.string().min(1).max(120)).max(500),
}).strict();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!isSupabaseConfigured()) {
      // Local-store fallback — no persistence between dev restarts. The
      // client already treats "fresh start" the same way, so a 200 with
      // empty arrays is the right answer here.
      return NextResponse.json({ markers: [], ordering: [] });
    }
    const owner = await requireRowOwnership('tracks', id);
    if (!owner.ok) return owner.res;

    const { data, error } = await owner.admin
      .from('arrangements')
      .select('markers, ordering, updated_at')
      .eq('track_id', id)
      .eq('user_id', owner.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({
      markers: data?.markers ?? [],
      ordering: data?.ordering ?? [],
      updated_at: data?.updated_at ?? null,
    });
  } catch (err) {
    log.error('arrangement get failed', { trackId: id, error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, BodySchema);
  if (!parsed.ok) return parsed.res;

  try {
    if (!isSupabaseConfigured()) {
      // No-op in local-store mode — the client's in-memory state IS
      // the source of truth. We still 200 so the save path "succeeds"
      // and the user doesn't see a misleading error toast.
      return NextResponse.json({ ok: true });
    }
    const owner = await requireRowOwnership('tracks', id);
    if (!owner.ok) return owner.res;

    // UPSERT against the (track_id, user_id) unique index. The
    // arrangements_touch trigger bumps updated_at automatically.
    const admin = createServiceClient();
    const { error } = await admin
      .from('arrangements')
      .upsert(
        {
          track_id: id,
          user_id: owner.userId,
          markers: parsed.data.markers,
          ordering: parsed.data.ordering,
        },
        { onConflict: 'track_id,user_id' },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('arrangement put failed', { trackId: id, error: errorMessage(err) });
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
