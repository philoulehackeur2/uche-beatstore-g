import { NextResponse } from 'next/server';
import { pickBackend } from '@/lib/stems/dispatch';

export const runtime = 'nodejs';

/**
 * GET /api/stems/health
 *
 * Reports which stem-separation backend (if any) is currently available.
 * Used at app boot to warm the connection — when Demucs answers, the
 * model is loaded into memory so the first user-initiated split doesn't
 * pay the full cold-start cost.
 *
 * Response shape:
 *   { ok: true, backend: 'demucs' | 'moises' }   // ready
 *   { ok: false, error: '<combined message>' }   // neither available
 */
export async function GET() {
  const pick = await pickBackend();
  if (pick.ok) {
    return NextResponse.json({ ok: true, backend: pick.backend });
  }
  return NextResponse.json({ ok: false, error: pick.reason });
}
