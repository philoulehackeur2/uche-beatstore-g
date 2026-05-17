import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, update, insert, requireRowOwnership } from '@/lib/db';
import { readBody } from '@/lib/validate';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';
import { RateBodySchema } from '@/lib/contracts';

const log = createLogger('api.tracks.rate');

/**
 * POST /api/tracks/[id]/rate — schema-validated rating endpoint.
 * Schema lives in `@/lib/contracts` so the client can import + parse
 * before sending, surfacing field-level errors in the UI.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, RateBodySchema);
  if (!parsed.ok) return parsed.res;
  const { rating } = parsed.data;

  // Rating 0 means clear — store as null
  const dbRating = rating === 0 ? null : rating;

  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('tracks', id);
      if (!owner.ok) return owner.res;

      const { error } = await owner.admin
        .from('tracks')
        .update({ rating: dbRating })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);

      // Log to rating_history (only for non-zero ratings) using the real
      // session user id.
      if (rating > 0) {
        await owner.admin.from('rating_history').insert({
          track_id: id,
          user_id: owner.userId,
          rating,
        });
      }

      return NextResponse.json({ id, rating: dbRating });
    }

    update('tracks', id, { rating: dbRating });
    if (rating > 0) {
      insert('rating_history', { track_id: id, user_id: 'local-user', rating });
    }
    return NextResponse.json({ id, rating: dbRating });
  } catch (error) {
    log.error('rate failed', { trackId: id, error: errorMessage(error) });
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
