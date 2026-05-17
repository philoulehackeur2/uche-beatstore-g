import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, getById, getAll } from '@/lib/local-store';
import { requireRowOwnership } from '@/lib/auth/ownership';
import { findSimilar } from '@/lib/audio/similarity';
import type { Track } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * GET /api/tracks/[id]/similar?limit=5
 *
 * Returns the most acoustically similar tracks in the caller's library to
 * the target track, ranked by combined BPM + key + vibe distance (see
 * lib/audio/similarity.ts for the math).
 *
 * Owner-gated: we use requireRowOwnership both to verify the caller can
 * see the target and to scope the candidate pool to *their* tracks.
 * Cross-user discovery would need a separate endpoint with explicit
 * sharing rules.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? 5);
  const limit = Math.max(1, Math.min(20, isFinite(limitParam) ? limitParam : 5));

  try {
    let target: Track | null = null;
    let pool: Track[] = [];

    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('tracks', id);
      if (!owner.ok) return owner.res;

      const { data: targetRow, error: tErr } = await owner.admin
        .from('tracks')
        .select('*')
        .eq('id', id)
        .single();
      if (tErr) throw tErr;
      target = targetRow as Track;

      // Pool = caller's tracks (incl. legacy null-owner rows, matching the
      // loosened RLS semantics elsewhere). Service-role + manual filter.
      const { data: rows, error: pErr } = await owner.admin
        .from('tracks')
        .select('*')
        .or(`user_id.eq.${owner.userId},user_id.is.null`);
      if (pErr) throw pErr;
      pool = (rows ?? []) as Track[];
    } else {
      target = (getById('tracks', id) as Track | null) ?? null;
      pool = getAll('tracks') as Track[];
    }

    if (!target) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    const similar = findSimilar(target, pool, limit);
    return NextResponse.json({
      target_id: target.id,
      results: similar.map((s) => ({
        track: s.track,
        distance: Number(s.distance.toFixed(4)),
        breakdown: {
          bpm: Number(s.breakdown.bpm.toFixed(3)),
          key: Number(s.breakdown.key.toFixed(3)),
          vibe: Number(s.breakdown.vibe.toFixed(3)),
          type: Number(s.breakdown.type.toFixed(3)),
        },
      })),
    });
  } catch (error: any) {
    console.error('Similar tracks error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
