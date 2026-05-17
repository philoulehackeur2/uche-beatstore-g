import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isSupabaseConfigured, getAll, query } from '@/lib/local-store';
import { createServiceClient } from '@/lib/auth/ownership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public reader for project shares.
 *
 *   GET /api/projects/share/[token]
 *     headers: x-share-password (optional)
 *
 * Returns the project + its track set + the role granted by the link.
 * Owner identity is never leaked; we only echo what the recipient already
 * had to know (project title, tracks they were sent).
 *
 * Role gates the rest of the API:
 *   - viewer    → can read this endpoint and stream audio
 *   - commenter → +POST comments
 *   - editor    → +(reserved for future write flows)
 *
 * `allow_downloads` is independent of role — an editor without downloads
 * still can't pull files; a viewer with downloads can.
 *
 * 401 with `requiresPassword: true` if a password is set and missing/wrong.
 * 410 if expired or revoked.
 * 404 if token is unknown.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const submittedPassword = req.headers.get('x-share-password') ?? '';

  try {
    if (!isSupabaseConfigured()) {
      const share = (getAll('project_shares') as any[]).find((s) => s.token === token);
      if (!share) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
      const tracks = resolveLocalTracks(share.project_id);
      return NextResponse.json({
        share: redactShare(share),
        project: resolveLocalProject(share.project_id),
        tracks,
      });
    }

    const admin = createServiceClient();
    const { data: share, error } = await admin
      .from('project_shares')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error) throw error;
    if (!share) return NextResponse.json({ error: 'Link not found' }, { status: 404 });

    if (share.revoked_at) {
      return NextResponse.json({ error: 'This link has been revoked.' }, { status: 410 });
    }
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This link has expired.' }, { status: 410 });
    }

    if (share.password_hash) {
      if (!submittedPassword) {
        return NextResponse.json({ requiresPassword: true }, { status: 401 });
      }
      const ok = await bcrypt.compare(submittedPassword, share.password_hash);
      if (!ok) {
        return NextResponse.json({ requiresPassword: true, error: 'Incorrect password' }, { status: 401 });
      }
    }

    // Hydrate project + tracks via the junction table.
    const { data: project } = await admin
      .from('projects')
      .select('id, name, cover_url, description, bpm_target, key_target, status')
      .eq('id', share.project_id)
      .maybeSingle();

    const { data: junction } = await admin
      .from('project_tracks')
      .select('track_id, role, position')
      .eq('project_id', share.project_id)
      .order('position', { ascending: true });

    const trackIds = (junction ?? []).map((j: any) => j.track_id);
    let tracks: any[] = [];
    if (trackIds.length) {
      const { data: trackRows } = await admin
        .from('tracks')
        .select('id, title, type, audio_url, peaks_url, cover_url, duration_seconds, bpm, key, scale')
        .in('id', trackIds);
      // Re-order by junction position so the share respects the project sequence.
      const byId = new Map((trackRows ?? []).map((t: any) => [t.id, t]));
      tracks = (junction ?? [])
        .map((j: any) => byId.get(j.track_id))
        .filter(Boolean);
    }

    // Best-effort play counter — fire-and-forget so a counter write never
    // blocks the share response.
    admin
      .from('project_shares')
      .update({ plays: (share.plays ?? 0) + 1 })
      .eq('id', share.id)
      .then(() => {});

    return NextResponse.json({
      share: redactShare(share),
      project,
      tracks,
    });
  } catch (error: any) {
    console.error('Project share read error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/projects/share/[token]
 *   body: { description?: string, name?: string }
 *   headers: x-share-password (if locked)
 *
 * Editor-role token holders can edit a small whitelist of project fields.
 * Viewer and commenter return 403. The whitelist is intentionally tight —
 * destructive operations (delete, transfer, change owner) stay owner-only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const submittedPassword = req.headers.get('x-share-password') ?? '';

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Edit flow requires Supabase' }, { status: 501 });
    }

    const admin = createServiceClient();
    const { data: share, error: sErr } = await admin
      .from('project_shares')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!share) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    if (share.revoked_at) return NextResponse.json({ error: 'Link revoked' }, { status: 410 });
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 });
    }
    if (share.password_hash) {
      if (!submittedPassword) return NextResponse.json({ requiresPassword: true }, { status: 401 });
      const ok = await bcrypt.compare(submittedPassword, share.password_hash);
      if (!ok) return NextResponse.json({ requiresPassword: true, error: 'Bad password' }, { status: 401 });
    }
    if (share.role !== 'editor') {
      return NextResponse.json(
        { error: 'This link does not grant edit access.' },
        { status: 403 },
      );
    }

    // Whitelist editable fields. Names like `user_id` / `created_at` are
    // explicitly excluded; we don't trust the share token for ownership
    // changes regardless of role.
    const body = await req.json().catch(() => ({}));
    const patch: Record<string, any> = {};
    if (typeof body.description === 'string') {
      const v = body.description.trim();
      if (v.length > 5000) {
        return NextResponse.json({ error: 'Description too long' }, { status: 400 });
      }
      patch.description = v || null;
    }
    if (typeof body.name === 'string') {
      const v = body.name.trim();
      if (!v || v.length > 200) {
        return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
      }
      patch.name = v;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
    }
    patch.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('projects')
      .update(patch)
      .eq('id', share.project_id)
      .select('id, name, cover_url, description, bpm_target, key_target, status')
      .single();
    if (error) throw error;
    return NextResponse.json({ project: data });
  } catch (error: any) {
    console.error('Editor PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function redactShare(s: any) {
  // Never echo password_hash or created_by — recipients have no business
  // seeing either.
  return {
    token: s.token,
    role: s.role,
    allow_downloads: s.allow_downloads,
    expires_at: s.expires_at,
    label: s.label,
  };
}

function resolveLocalProject(projectId: string) {
  const projects = getAll('projects') as any[];
  return projects.find((p) => p.id === projectId) || null;
}

function resolveLocalTracks(projectId: string) {
  const pt = query('project_tracks', (j: any) => j.project_id === projectId)
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  const ids = new Set(pt.map((j: any) => j.track_id));
  return (getAll('tracks') as any[]).filter((t) => ids.has(t.id));
}
