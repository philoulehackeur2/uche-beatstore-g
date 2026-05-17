import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  query,
  insert,
  getAll,
  deleteRow,
  requireRowOwnership,
} from '@/lib/db';
import { readBody } from '@/lib/validate';
import { errorMessage } from '@/lib/errors';
import { TagCreateBodySchema, TagDeleteBodySchema } from '@/lib/contracts';

/**
 * Track-tag CRUD. The junction has no user_id column — ownership flows
 * through the parent track, so each handler runs requireRowOwnership on
 * `tracks` before touching `track_tags`.
 */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('tracks', id);
      if (!owner.ok) return owner.res;

      const { data, error } = await owner.admin
        .from('track_tags')
        .select('tag')
        .eq('track_id', id);
      if (error) throw new Error(error.message);
      return NextResponse.json((data || []).map((t: { tag: string }) => t.tag));
    }

    const tags = query('track_tags', (t) => (t as { track_id: string }).track_id === id);
    return NextResponse.json((tags as { tag: string }[]).map((t) => t.tag));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, TagCreateBodySchema);
  if (!parsed.ok) return parsed.res;
  const { tag, category } = parsed.data;

  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('tracks', id);
      if (!owner.ok) return owner.res;

      const { data: newTag, error } = await owner.admin
        .from('track_tags')
        .upsert({ track_id: id, tag, category }, { onConflict: 'track_id,tag' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, tag: newTag });
    }

    const existing = query('track_tags',
      (t) => (t as { track_id: string; tag: string }).track_id === id
        && (t as { track_id: string; tag: string }).tag === tag,
    );
    if (existing.length === 0) {
      insert('track_tags', { track_id: id, tag, category });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, TagDeleteBodySchema);
  if (!parsed.ok) return parsed.res;
  const { tag } = parsed.data;

  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('tracks', id);
      if (!owner.ok) return owner.res;

      const { error } = await owner.admin
        .from('track_tags')
        .delete()
        .eq('track_id', id)
        .eq('tag', tag);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    const allTags = getAll('track_tags') as { id: string; track_id: string; tag: string }[];
    const target = allTags.find((t) => t.track_id === id && t.tag === tag);
    if (target) deleteRow('track_tags', target.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
