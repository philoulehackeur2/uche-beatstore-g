import { NextRequest, NextResponse } from 'next/server';
import { scopedList, insertOwned, isErrorResponse, isSupabaseConfigured, createServiceClient, getAll } from '@/lib/db';

/**
 * Contacts list + create — runs through the storage facade so the
 * `if (supabase) else (local)` boilerplate is centralized.
 *
 * GET  /api/contacts → caller's contacts, oldest-name-first, with tags attached
 *                       (mig 091). Null-owner legacy rows included by default.
 * POST /api/contacts → create with user_id auto-stamped from session.
 */
export async function GET(_req: NextRequest) {
  const rows = await scopedList<{ id: string; [k: string]: unknown }>('contacts', { orderBy: 'name', ascending: true });
  if (isErrorResponse(rows)) return rows;

  // Batch-attach tags so the CRM can filter/group by them client-side.
  const ids = rows.map((r) => r.id);
  const tagsByContact = new Map<string, { tag: string; category: string | null }[]>();
  if (ids.length) {
    if (isSupabaseConfigured()) {
      const admin = createServiceClient();
      const { data: tagRows } = await admin.from('contact_tags').select('contact_id, tag, category').in('contact_id', ids);
      (tagRows ?? []).forEach((r: any) => {
        const arr = tagsByContact.get(r.contact_id) ?? [];
        arr.push({ tag: r.tag, category: r.category });
        tagsByContact.set(r.contact_id, arr);
      });
    } else {
      (getAll('contact_tags') as any[]).forEach((r) => {
        const arr = tagsByContact.get(r.contact_id) ?? [];
        arr.push({ tag: r.tag, category: r.category ?? null });
        tagsByContact.set(r.contact_id, arr);
      });
    }
  }

  const withTags = rows.map((r) => ({ ...r, tags: tagsByContact.get(r.id) ?? [] }));
  return NextResponse.json(withTags);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, email, role, label, instagram, twitter, notes } = body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const result = await insertOwned('contacts', {
    name: name.trim(),
    email: email ?? null,
    role: role ?? null,
    label: label ?? null,
    instagram: instagram ?? null,
    twitter: twitter ?? null,
    notes: notes ?? null,
  });
  if (isErrorResponse(result)) return result;
  return NextResponse.json(result);
}
