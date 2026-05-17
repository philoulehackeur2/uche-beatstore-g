import { NextRequest, NextResponse } from 'next/server';
import {
  getOwned,
  updateOwned,
  deleteOwned,
  isErrorResponse,
  isSupabaseConfigured,
  createServiceClient,
  query,
} from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { readBody } from '@/lib/validate';
import { PlaylistPatchBodySchema } from '@/lib/contracts';

/**
 * Single-playlist CRUD through the facade. See projects/[id] for the
 * same shape; playlists differ only in the junction table name.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const playlist = await getOwned<Record<string, unknown>>('playlists', id);
    if (isErrorResponse(playlist)) return playlist;

    let track_count = 0;
    if (isSupabaseConfigured()) {
      const admin = createServiceClient();
      const { data: pts } = await admin
        .from('playlist_tracks')
        .select('track_id')
        .eq('playlist_id', id);
      track_count = pts?.length ?? 0;
    } else {
      track_count = query('playlist_tracks', (j) => (j as { playlist_id: string }).playlist_id === id).length;
    }

    return NextResponse.json({ playlist: { ...playlist, track_count } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // See tracks/[id] PATCH: allow-list validation in front of the facade.
  const parsed = await readBody(req, PlaylistPatchBodySchema);
  if (!parsed.ok) return parsed.res;
  const result = await updateOwned('playlists', id, parsed.data);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ playlist: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // playlist_tracks has ON DELETE CASCADE in the schema, so the junction
  // cleans up automatically.
  const result = await deleteOwned('playlists', id);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ success: true });
}
