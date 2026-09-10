import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/ownership';
import { createServiceClient } from '@/lib/auth/ownership';
import { isSupabaseConfigured } from '@/lib/local-store';
import { errorMessage } from '@/lib/errors';
import { NotificationReadBodySchema } from '@/lib/contracts';

export const dynamic = 'force-dynamic';

interface NotificationRow {
  read: boolean | null;
}

export async function GET() {
  try {
    const result = await requireUser();
    if (!result.ok) return result.res;
    const { userId } = result;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ notifications: [], unread: 0 });
    }

    const admin = createServiceClient();
    const { data, error } = await admin
      .from('notifications')
      .select('id, kind, title, body, data, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    const notifications = data ?? [];
    const unread = (notifications as NotificationRow[]).filter((n) => !n.read).length;
    return NextResponse.json({ notifications, unread });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

/**
 * Mark notifications read.
 *
 *   ?action=read       body { ids: [...] }  — the rows the producer acted on
 *   ?action=read_all                        — an explicit "Mark all read"
 *
 * `read_all` stays, but it is now only reachable from a button the producer
 * presses. It used to fire whenever the bell panel opened, which meant looking
 * at one notification silently cleared every other one.
 *
 * Both paths filter on `user_id` as well as the ids, so a guessed id belonging
 * to another account updates zero rows rather than someone else's.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    if (action !== 'read_all' && action !== 'read') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    let ids: string[] = [];
    if (action === 'read') {
      const parsed = NotificationReadBodySchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });
      }
      ids = parsed.data.ids;
    }

    const result = await requireUser();
    if (!result.ok) return result.res;
    const { userId } = result;

    if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

    const admin = createServiceClient();
    let q = admin
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (action === 'read') q = q.in('id', ids);

    const { error } = await q;

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
