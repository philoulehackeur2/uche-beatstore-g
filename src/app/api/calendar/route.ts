import { NextRequest, NextResponse } from 'next/server';
import { scopedList, insertOwned, isErrorResponse } from '@/lib/db';

/**
 * Calendar events list + create — through the storage facade.
 *
 * GET  /api/calendar → caller's events, earliest-first.
 *                       Null-owner legacy rows included (matches the
 *                       loosened RLS posture for other tables).
 * POST /api/calendar → create with user_id auto-stamped.
 */
export async function GET(_req: NextRequest) {
  const rows = await scopedList('calendar_events', { orderBy: 'date', ascending: true });
  if (isErrorResponse(rows)) return rows;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { title, date, end_date, type, track_ids, notes, color } = body || {};

  if (!title || !date) {
    return NextResponse.json({ error: 'Title and date required' }, { status: 400 });
  }

  const result = await insertOwned('calendar_events', {
    title: String(title).trim(),
    date,
    end_date: end_date ?? null,
    type: type ?? null,
    track_ids: track_ids ?? null,
    notes: notes ?? null,
    color: color ?? null,
  });
  if (isErrorResponse(result)) return result;
  return NextResponse.json(result);
}
