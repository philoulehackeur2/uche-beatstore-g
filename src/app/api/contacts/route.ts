import { NextRequest, NextResponse } from 'next/server';
import { scopedList, insertOwned, isErrorResponse } from '@/lib/db';

/**
 * Contacts list + create — runs through the storage facade so the
 * `if (supabase) else (local)` boilerplate is centralized.
 *
 * GET  /api/contacts → caller's contacts, oldest-name-first.
 *                       Null-owner legacy rows included by default.
 * POST /api/contacts → create with user_id auto-stamped from session.
 */
export async function GET(_req: NextRequest) {
  const rows = await scopedList('contacts', { orderBy: 'name', ascending: true });
  if (isErrorResponse(rows)) return rows;
  return NextResponse.json(rows);
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
