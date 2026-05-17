import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwned, updateOwned, deleteOwned, isErrorResponse } from '@/lib/db';
import { readBody } from '@/lib/validate';

/**
 * Per-contact CRUD.
 *
 *   GET    — full contact row, used by /contacts/[id] detail page
 *   PATCH  — inline field edits (notes, phone, role, etc) from the detail page
 *   DELETE — used by the batch-delete bar on /contacts
 *
 * Auth: rides the facade's owner-or-legacy-null gate (same as tracks /
 * projects / playlists). The contacts table has CASCADE on beat_sends
 * so deletion cleans up history automatically.
 */

const PatchBodySchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(60).nullable().optional(),
    role: z.string().max(120).nullable().optional(),
    label: z.string().max(120).nullable().optional(),
    category: z.string().max(60).nullable().optional(),
    genre: z.string().max(120).nullable().optional(),
    country: z.string().max(120).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    instagram: z.string().max(120).nullable().optional(),
    twitter: z.string().max(120).nullable().optional(),
    notes: z.string().max(10000).nullable().optional(),
  })
  .strict();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getOwned('contacts', id);
  if (isErrorResponse(row)) return row;
  return NextResponse.json({ contact: row });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, PatchBodySchema);
  if (!parsed.ok) return parsed.res;
  const result = await updateOwned('contacts', id, parsed.data);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ contact: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteOwned('contacts', id);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ success: true });
}
