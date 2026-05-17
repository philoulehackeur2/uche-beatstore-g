import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabaseConfigured,
  update,
  createServiceClient,
} from '@/lib/db';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { readBody } from '@/lib/validate';
import { errorMessage } from '@/lib/errors';
import { createLogger } from '@/lib/log';
import { BeatSendPatchBodySchema } from '@/lib/contracts';

const log = createLogger('api.beat_sends.id');

export const runtime = 'nodejs';

/**
 * PATCH /api/beat_sends/[id]
 *
 * Updates the status (or message) of a beat send. Used by the contact-
 * history drawer to walk a send through its pipeline:
 *
 *   sent → opened → interested → negotiating → placed
 *                                            → pass
 *
 * beat_sends has no `user_id` of its own — ownership flows through
 * `contacts.user_id`. We resolve the contact_id of the send row, then
 * confirm the caller owns that contact before allowing the mutation.
 * Anything else lets an authenticated user mutate any other user's
 * pipeline.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, BeatSendPatchBodySchema);
  if (!parsed.ok) return parsed.res;
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  try {
    if (!isSupabaseConfigured()) {
      const row = update('beat_sends', id, patch);
      return NextResponse.json({ send: row });
    }

    const cookieClient = await createServerClient();
    const { data: { user } } = await cookieClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = createServiceClient();
    // Resolve the parent contact for ownership verification — same
    // pattern as project_shares/[shareId] uses to gate via parent rows.
    const { data: send, error: sErr } = await admin
      .from('beat_sends')
      .select('id, contact_id')
      .eq('id', id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!send) return NextResponse.json({ error: 'Send not found' }, { status: 404 });

    const { data: contact, error: cErr } = await admin
      .from('contacts')
      .select('user_id')
      .eq('id', send.contact_id)
      .maybeSingle();
    if (cErr) throw cErr;
    // Null user_id is the legacy/demo case — we permit it (matches the
    // pattern in requireRowOwnership for tracks etc).
    if (contact?.user_id && contact.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin
      .from('beat_sends')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ send: data });
  } catch (error) {
    log.error('PATCH failed', { id, error: errorMessage(error) });
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
