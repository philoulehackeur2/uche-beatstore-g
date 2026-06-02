import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, query, insert, getAll, deleteRow, requireRowOwnership } from '@/lib/db';
import { readBody } from '@/lib/validate';
import { errorMessage } from '@/lib/errors';
import { TagCreateBodySchema, TagDeleteBodySchema } from '@/lib/contracts';

/** Contact-tag CRUD (mig 091). Mirrors the playlist-tag route. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('contacts', id);
      if (!owner.ok) return owner.res;
      const { data, error } = await owner.admin.from('contact_tags').select('tag, category').eq('contact_id', id);
      if (error) throw new Error(error.message);
      return NextResponse.json(data || []);
    }
    const tags = query('contact_tags', (t) => (t as any).contact_id === id);
    return NextResponse.json((tags as any[]).map((t) => ({ tag: t.tag, category: t.category ?? null })));
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, TagCreateBodySchema);
  if (!parsed.ok) return parsed.res;
  const { tag, category } = parsed.data;
  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('contacts', id);
      if (!owner.ok) return owner.res;
      const { data, error } = await owner.admin.from('contact_tags').upsert({ contact_id: id, tag, category }, { onConflict: 'contact_id,tag' }).select().single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, tag: data });
    }
    const existing = query('contact_tags', (t) => (t as any).contact_id === id && (t as any).tag === tag);
    if (existing.length === 0) insert('contact_tags', { contact_id: id, tag, category });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, TagDeleteBodySchema);
  if (!parsed.ok) return parsed.res;
  const { tag } = parsed.data;
  try {
    if (isSupabaseConfigured()) {
      const owner = await requireRowOwnership('contacts', id);
      if (!owner.ok) return owner.res;
      const { error } = await owner.admin.from('contact_tags').delete().eq('contact_id', id).eq('tag', tag);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }
    const all = getAll('contact_tags') as any[];
    const target = all.find((t) => t.contact_id === id && t.tag === tag);
    if (target) deleteRow('contact_tags', target.id);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) }, { status: 500 }); }
}
