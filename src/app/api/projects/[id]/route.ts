import { NextRequest, NextResponse } from 'next/server';
import {
  getOwned,
  updateOwned,
  deleteOwned,
  isErrorResponse,
  isSupabaseConfigured,
  createServiceClient,
  query,
} from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { readBody } from '@/lib/validate';
import { ProjectPatchBodySchema } from '@/lib/contracts';

/**
 * Single-project CRUD through the facade.
 *
 * Pre-facade ~90 lines split across three handlers, each re-implementing
 * cookie-resolve + service-role + ownership match + patch sanitization.
 * Now: each handler is 3-6 lines.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const project = await getOwned<Record<string, unknown>>('projects', id);
    if (isErrorResponse(project)) return project;

    // Attach track_count from the project_tracks junction.
    let track_count = 0;
    if (isSupabaseConfigured()) {
      const admin = createServiceClient();
      const { data: pts } = await admin
        .from('project_tracks')
        .select('track_id')
        .eq('project_id', id);
      track_count = pts?.length ?? 0;
    } else {
      track_count = query('project_tracks', (j) => (j as { project_id: string }).project_id === id).length;
    }

    return NextResponse.json({ project: { ...project, track_count } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // See tracks/[id] PATCH: allow-list validation in front of the facade.
  const parsed = await readBody(req, ProjectPatchBodySchema);
  if (!parsed.ok) return parsed.res;
  const result = await updateOwned('projects', id, parsed.data, { stampUpdatedAt: true });
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ project: result });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Project_tracks has ON DELETE CASCADE in the schema, so deleting the
  // project automatically cleans up the junction. The defensive explicit
  // delete was a pre-FK habit; remove it now that we trust the schema.
  const result = await deleteOwned('projects', id);
  if (isErrorResponse(result)) return result;
  return NextResponse.json({ success: true });
}
