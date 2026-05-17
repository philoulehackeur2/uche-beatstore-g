import { NextRequest, NextResponse } from 'next/server';
import {
  getOwned,
  updateOwned,
  deleteOwned,
  isErrorResponse,
  isSupabaseConfigured,
  query,
} from '@/lib/db';
import { readBody } from '@/lib/validate';
import { TrackPatchBodySchema } from '@/lib/contracts';

/**
 * Single-track CRUD through the storage facade.
 *
 *   GET    → row + track_tags + stems joins
 *   PATCH  → whitelisted-by-facade update (id / user_id never trusted)
 *   DELETE → hard delete (parent project / playlist junctions cascade via FK)
 *
 * All three call ownership-gating helpers under the hood, so adding a new
 * mutation route in the future is one line + the patch body.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getOwned('tracks', id, {
    select: '*, track_tags(tag, category), stems(status)',
  });
  if (isErrorResponse(row)) return row;
  // Local-store path: the facade returns a bare row — manually attach tags/stems.
  if (!isSupabaseConfigured()) {
    const tags = query('track_tags', (t) => (t as { track_id: string }).track_id === id);
    const stems = query('stems', (s) => (s as { track_id: string }).track_id === id);
    return NextResponse.json({ ...(row as object), track_tags: tags, stems });
  }
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Validate against an allow-list of editable columns before hitting the
  // facade. Stops callers from writing to internal/computed columns and
  // surfaces field-level errors instead of opaque 500s from Postgres.
  const parsed = await readBody(req, TrackPatchBodySchema);
  if (!parsed.ok) return parsed.res;
  const result = await updateOwned('tracks', id, parsed.data);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ track: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteOwned('tracks', id);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ success: true });
}
