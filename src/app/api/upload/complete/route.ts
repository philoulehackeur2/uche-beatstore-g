import { NextRequest, NextResponse } from 'next/server';
import { completeMultipart, readAssembledBuffer } from '@/lib/storage/multipart';
import { getSession, markStatus, deleteSession } from '@/lib/storage/upload-sessions';
import { analyzeAudio } from '@/lib/audio/analyze.server';
import { getAuddFeatures } from '@/lib/audio/audd';
import { mergeFeatures } from '@/lib/audio/merge';
import { extractPeaks } from '@/lib/audio/peaks';
import { uploadPeaksSidecar } from '@/lib/storage/upload';
import { isSupabaseConfigured, insert, update, getAll } from '@/lib/local-store';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { titleFromFilename, nextVersionLabel } from '@/lib/naming';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId: string = body.sessionId;
    const clientAnalysis = body.analysis ?? null;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }
    const session = getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'unknown session' }, { status: 404 });
    }
    if (session.status === 'completed') {
      return NextResponse.json({ error: 'already completed' }, { status: 409 });
    }
    if (session.parts.length !== session.totalParts) {
      return NextResponse.json(
        { error: `Missing parts (${session.parts.length}/${session.totalParts})` },
        { status: 409 }
      );
    }

    // 1. Finalize the multipart upload
    let audioUrl = '';
    try {
      audioUrl = await completeMultipart({
        uploadId: session.uploadId,
        key: session.key,
        fileName: session.fileName,
        parts: session.parts,
      });
    } catch (err: any) {
      console.error('completeMultipart failed:', err);
      return NextResponse.json(
        { error: `Storage finalize failed: ${err?.message || 'unknown'}` },
        { status: 500 }
      );
    }

    markStatus(sessionId, 'completed');

    // 2. Run analysis (client > server fallback). Pull bytes back only if needed.
    let analysis: any = clientAnalysis;
    let audioBuffer: Buffer | null = null;

    if (!analysis) {
      try {
        audioBuffer = await readAssembledBuffer(audioUrl);
        analysis = await analyzeAudio(audioBuffer);
      } catch (err) {
        console.warn('Server analysis failed, using nulls:', err);
        analysis = { bpm: null, key: null, scale: null, loudness: null, duration: null };
      }
    }

    let audd = { danceability: 0, energy: 0, valence: 0, acousticness: 0, tempo: 0 };
    try {
      if (!audioBuffer) audioBuffer = await readAssembledBuffer(audioUrl);
      audd = await getAuddFeatures(audioBuffer, session.fileName);
    } catch (err) {
      console.warn('AudD features failed, using zeros:', err);
    }

    // Extract waveform peaks and upload as a JSON sidecar.
    // Failure is non-fatal — WavePlayer falls back to client decode if
    // peaks_url is null. Done after audd so a slow Audd request doesn't
    // block peaks generation, but before DB insert so we can stamp the URL.
    let peaksUrl: string | null = null;
    try {
      if (!audioBuffer) audioBuffer = await readAssembledBuffer(audioUrl);
      const peaks = await extractPeaks(audioBuffer);
      if (peaks) {
        peaksUrl = await uploadPeaksSidecar(audioUrl, JSON.stringify(peaks));
      }
    } catch (err) {
      console.warn('Peaks extraction/upload failed, continuing without:', err);
    }

    const merged = mergeFeatures({ client: clientAnalysis, server: analysis, audd });
    const trackData = {
      title: titleFromFilename(session.fileName),
      type: session.type,
      audio_url: audioUrl,
      peaks_url: peaksUrl,
      ...merged,
      stems_status: 'none' as const,
    };

    // 3. Persist track row (replace-with-versioning OR insert new)
    let track: any;

    if (isSupabaseConfigured()) {
      try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || session.userId || null;

        if (session.replaceTrackId) {
          // Same auth gate as /api/upload/route.ts — verify the caller
          // owns the target before overwriting. Without this, a
          // legitimate multipart session id paired with a forged
          // `replaceTrackId` from a different user lets an attacker
          // replace audio they don't own.
          const { requireRowOwnership } = await import('@/lib/db');
          const owner = await requireRowOwnership('tracks', session.replaceTrackId);
          if (!owner.ok) return owner.res;

          const { data: existing } = await supabase
            .from('tracks')
            .select('*')
            .eq('id', session.replaceTrackId)
            .single();
          if (existing) {
            const { data: vs } = await supabase
              .from('track_versions')
              .select('version_number')
              .eq('track_id', session.replaceTrackId);
            const { number, label } = nextVersionLabel(vs ?? []);
            await supabase.from('track_versions').insert({
              track_id: session.replaceTrackId,
              version_number: number,
              version_label: label,
              audio_url: existing.audio_url,
              duration_seconds: existing.duration_seconds,
              bpm: existing.bpm,
              key: existing.key,
              scale: existing.scale,
              loudness: existing.loudness,
              energy: existing.energy,
              danceability: existing.danceability,
              valence: existing.valence,
              acousticness: existing.acousticness,
              notes: existing.notes,
              created_by: userId,
            });
          }
          const { data, error } = await supabase
            .from('tracks')
            .update({ ...trackData, stems_status: 'none' })
            .eq('id', session.replaceTrackId)
            .select()
            .single();
          if (error) throw new Error(error.message);
          track = data;
        } else {
          const { data, error } = await supabase
            .from('tracks')
            .insert({ user_id: userId, ...trackData })
            .select()
            .single();
          if (error) throw new Error(`DB Insert Error: ${error.message}`);
          track = data;

          if (session.projectId) {
            const { data: proj } = await supabase
              .from('projects')
              .select('id')
              .eq('id', session.projectId)
              .maybeSingle();
            if (proj) {
              await supabase.from('project_tracks').insert({
                project_id: session.projectId,
                track_id: track.id,
                role: 'main',
                position: 0,
              });
            } else {
              await supabase.from('playlist_tracks').insert({
                playlist_id: session.projectId,
                track_id: track.id,
                position: 0,
              });
            }
          }
        }
      } catch (err: any) {
        console.error('Supabase op failed, falling back to local store:', err);
        track = writeLocal(trackData, session.replaceTrackId, session.projectId);
      }
    } else {
      track = writeLocal(trackData, session.replaceTrackId, session.projectId);
    }

    deleteSession(sessionId);
    return NextResponse.json({ success: true, track });
  } catch (err: any) {
    console.error('upload/complete error:', err);
    return NextResponse.json({ error: err?.message || 'complete failed' }, { status: 500 });
  }
}

function writeLocal(trackData: any, replaceTrackId: string | null, projectId: string | null) {
  if (replaceTrackId) {
    const existingTracks = getAll('tracks');
    const existing = existingTracks.find((t: any) => t.id === replaceTrackId);
    if (existing) {
      const vs = getAll('track_versions').filter((v: any) => v.track_id === replaceTrackId);
      const { number, label } = nextVersionLabel(vs);
      insert('track_versions', {
        track_id: replaceTrackId,
        version_number: number,
        version_label: label,
        audio_url: existing.audio_url,
        duration_seconds: existing.duration_seconds,
        bpm: existing.bpm,
        key: existing.key,
        scale: existing.scale,
        loudness: existing.loudness,
        energy: existing.energy,
        danceability: existing.danceability,
        valence: existing.valence,
        acousticness: existing.acousticness,
        notes: existing.notes,
        created_by: null,
      });
    }
    return update('tracks', replaceTrackId, { ...trackData, stems_status: 'none' });
  }

  const t = insert('tracks', {
    user_id: 'local-user',
    ...trackData,
    rating: null,
    cover_url: null,
    notes: '',
  });
  if (projectId) {
    const projects = getAll('projects');
    const isProject = projects.some((p: any) => p.id === projectId);
    if (isProject) {
      insert('project_tracks', {
        project_id: projectId,
        track_id: t.id,
        role: 'main',
        position: 0,
        added_at: new Date().toISOString(),
      });
    } else {
      insert('playlist_tracks', {
        playlist_id: projectId,
        track_id: t.id,
        position: 0,
      });
    }
  }
  return t;
}
