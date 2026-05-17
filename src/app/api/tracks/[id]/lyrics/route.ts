import { NextRequest, NextResponse } from 'next/server';
import { getOwned, updateOwned, isErrorResponse } from '@/lib/db';
import { readBody } from '@/lib/validate';
import { LyricsSaveBodySchema } from '@/lib/contracts';
import { errorMessage } from '@/lib/errors';

export const runtime = 'nodejs';

const MAX_HISTORY = 30;

interface HistoryEntry {
  at: string;
  content: string;
}

interface LyricsRow {
  lyrics: string | null;
  lyrics_updated_at: string | null;
  lyrics_history: HistoryEntry[] | null;
}

/**
 * GET — current lyrics + version history.
 * PUT — save new lyrics. Snapshots the previous version into history.
 *
 * Both routes ride the facade's ownership gate — guests get 401, owners
 * of legacy null-owner tracks still pass through.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const row = await getOwned<LyricsRow>('tracks', id, {
      select: 'lyrics, lyrics_updated_at, lyrics_history',
    });
    if (isErrorResponse(row)) return row;
    return NextResponse.json({
      lyrics: row?.lyrics ?? '',
      updatedAt: row?.lyrics_updated_at ?? null,
      history: row?.lyrics_history ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await readBody(req, LyricsSaveBodySchema);
  if (!parsed.ok) return parsed.res;
  const { content, snapshot } = parsed.data;
  const nowIso = new Date().toISOString();

  try {
    // Fetch current state to compute the new history. Same ownership check
    // applies via getOwned.
    const cur = await getOwned<LyricsRow>('tracks', id, {
      select: 'lyrics, lyrics_updated_at, lyrics_history',
    });
    if (isErrorResponse(cur)) return cur;

    const prevContent = cur?.lyrics ?? '';
    const prevAt = cur?.lyrics_updated_at ?? '';
    const history: HistoryEntry[] = Array.isArray(cur?.lyrics_history) ? cur!.lyrics_history! : [];

    // Snapshot when the user explicitly asked, OR auto-snapshot when the
    // edit is substantial (40+ char diff or 60+s since last save).
    const shouldSnapshot =
      Boolean(snapshot) ||
      Boolean(prevContent &&
        (Math.abs(content.length - prevContent.length) > 40 ||
          (prevAt && Date.now() - new Date(prevAt).getTime() > 60_000)));

    const newHistory: HistoryEntry[] = shouldSnapshot
      ? [{ at: prevAt || nowIso, content: prevContent }, ...history].slice(0, MAX_HISTORY)
      : history;

    const updated = await updateOwned<LyricsRow>('tracks', id, {
      lyrics: content,
      lyrics_updated_at: nowIso,
      lyrics_history: newHistory,
    }, { select: 'lyrics, lyrics_updated_at, lyrics_history' });
    if (isErrorResponse(updated)) return updated;

    return NextResponse.json({
      lyrics: updated?.lyrics ?? content,
      updatedAt: updated?.lyrics_updated_at ?? nowIso,
      history: updated?.lyrics_history ?? newHistory,
      snapshotted: shouldSnapshot,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
