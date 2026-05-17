import { NextRequest, NextResponse } from 'next/server';
import { uploadAudio, uploadPeaksSidecar } from '@/lib/storage/upload';
import { analyzeAudio } from '@/lib/audio/analyze.server';
import { getAuddFeatures } from '@/lib/audio/audd';
import { mergeFeatures } from '@/lib/audio/merge';
import { extractPeaks } from '@/lib/audio/peaks';
import { isSupabaseConfigured, insert, update, getAll } from '@/lib/local-store';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { titleFromFilename, nextVersionLabel } from '@/lib/naming';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = ['mp3', 'wav', 'flac', 'aiff', 'aif', 'm4a', 'ogg'];

function detectContentType(ext: string, fallback: string): string {
  switch (ext) {
    case 'mp3':  return 'audio/mpeg';
    case 'wav':  return 'audio/wav';
    case 'flac': return 'audio/flac';
    case 'aif':
    case 'aiff': return 'audio/aiff';
    case 'm4a':  return 'audio/mp4';
    case 'ogg':  return 'audio/ogg';
    default:     return fallback || 'application/octet-stream';
  }
}

/** Magic-byte check: confirms bytes look like a valid audio format. */
function sniffAudio(buf: Buffer): { ok: boolean; format: string } {
  if (buf.length < 12) return { ok: false, format: 'too-small' };
  const h = buf.subarray(0, 12);
  const s4 = (start: number) => h.subarray(start, start + 4).toString('latin1');
  const s3 = (start: number) => h.subarray(start, start + 3).toString('latin1');

  if (s4(0) === 'RIFF' && s4(8) === 'WAVE') return { ok: true, format: 'wav' };
  if (s3(0) === 'ID3') return { ok: true, format: 'mp3' };
  // MPEG frame sync (MP3 without ID3)
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return { ok: true, format: 'mp3' };
  if (s4(0) === 'fLaC') return { ok: true, format: 'flac' };
  if (s4(0) === 'FORM' && s4(8) === 'AIFF') return { ok: true, format: 'aiff' };
  if (s4(0) === 'OggS') return { ok: true, format: 'ogg' };
  // M4A: ftyp... at offset 4
  if (s4(4) === 'ftyp') return { ok: true, format: 'm4a' };
  return { ok: false, format: 'unknown' };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string) || 'instrumental';
    const projectId = (formData.get('projectId') as string | null) || (formData.get('playlistId') as string | null);
    const clientAnalysisRaw = formData.get('analysis') as string | null;
    const replaceTrackId = formData.get('trackId') as string | null;

    // 1. Basic validation
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${Math.round(file.size / 1024 / 1024)}MB, max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: `Unsupported extension ".${ext}". Supported: ${ALLOWED_EXT.join(', ')}` },
        { status: 415 }
      );
    }

    // 2. Read into buffer and sniff magic bytes
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sniff = sniffAudio(buffer);
    if (!sniff.ok) {
      return NextResponse.json(
        { error: `File does not look like a valid audio file (detected: ${sniff.format})` },
        { status: 415 }
      );
    }

    const safeContentType = detectContentType(ext, file.type);

    // 3. Parse optional client analysis
    let clientAnalysis: any = null;
    if (clientAnalysisRaw) {
      try { clientAnalysis = JSON.parse(clientAnalysisRaw); } catch {}
    }

    // 4. Upload to storage
    let audioUrl = '';
    try {
      audioUrl = await uploadAudio(buffer, file.name, safeContentType);
    } catch (err: any) {
      console.error('Storage upload failed:', err);
      return NextResponse.json(
        { error: `Storage error: ${err.message || 'could not save file'}` },
        { status: 500 }
      );
    }

    // 5. Analysis (client > server fallback)
    let analysis = clientAnalysis;
    if (!analysis) {
      try {
        analysis = await analyzeAudio(buffer);
      } catch (err) {
        console.warn('Server analysis failed, using nulls:', err);
        analysis = { bpm: null, key: null, scale: null, loudness: null, duration: null };
      }
    }

    let audd = { danceability: 0, energy: 0, valence: 0, acousticness: 0, tempo: 0 };
    try {
      audd = await getAuddFeatures(buffer, file.name);
    } catch (err) {
      console.warn('AudD features failed, using zeros:', err);
    }

    const titleFromName = titleFromFilename(file.name);

    // Waveform peaks (best-effort sidecar). Failures don't block upload.
    let peaksUrl: string | null = null;
    try {
      const peaks = await extractPeaks(buffer);
      if (peaks) {
        peaksUrl = await uploadPeaksSidecar(audioUrl, JSON.stringify(peaks));
      }
    } catch (err) {
      console.warn('Peaks extraction/upload failed, continuing without:', err);
    }

    const merged = mergeFeatures({ server: analysis, audd });
    const trackData = {
      title: titleFromName,
      type,
      audio_url: audioUrl,
      peaks_url: peaksUrl,
      ...merged,
      stems_status: 'none' as const,
    };

    // 6. Persist: replace-with-versioning OR insert new
    let track: any;

    if (isSupabaseConfigured()) {
      try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || null;

        if (replaceTrackId) {
          // Ownership gate before ANY mutation against the target track.
          // Pre-fix this branch only used the cookie client, which leaves
          // the actual write subject to whatever RLS happens to be —
          // and after migration 010, RLS allows owner OR null-owner.
          // Net effect: any authenticated user could overwrite any
          // null-owner track by submitting `trackId=<their-uuid>` in
          // the upload form. requireRowOwnership rejects mismatches
          // explicitly with a 403 before we touch storage or DB.
          const { requireRowOwnership } = await import('@/lib/db');
          const owner = await requireRowOwnership('tracks', replaceTrackId);
          if (!owner.ok) return owner.res;

          // Snapshot current state into track_versions BEFORE overwriting
          const { data: existing } = await supabase
            .from('tracks')
            .select('*')
            .eq('id', replaceTrackId)
            .single();

          if (existing) {
            const { data: vs } = await supabase
              .from('track_versions')
              .select('version_number')
              .eq('track_id', replaceTrackId);
            const { number, label } = nextVersionLabel(vs ?? []);

            await supabase.from('track_versions').insert({
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
              created_by: userId,
            });
          }

          const { data, error } = await supabase
            .from('tracks')
            .update({ ...trackData, stems_status: 'none' })
            .eq('id', replaceTrackId)
            .select()
            .single();
          if (error) throw new Error(error.message);
          track = data;
        } else {
          const { data, error: trackError } = await supabase
            .from('tracks')
            .insert({ user_id: userId, ...trackData })
            .select()
            .single();
          if (trackError) throw new Error(`DB Insert Error: ${trackError.message}`);
          track = data;

          if (projectId) {
            // Add to project if it's a project, else fall back to playlist_tracks
            const { data: proj } = await supabase
              .from('projects')
              .select('id')
              .eq('id', projectId)
              .maybeSingle();
            if (proj) {
              await supabase.from('project_tracks').insert({
                project_id: projectId,
                track_id: track.id,
                role: 'main',
                position: 0,
              });
            } else {
              await supabase.from('playlist_tracks').insert({
                playlist_id: projectId,
                track_id: track.id,
                position: 0,
              });
            }
          }
        }
      } catch (err: any) {
        console.error('Supabase op failed, falling back to local store:', err);
        track = writeLocal(trackData, replaceTrackId, projectId);
      }
    } else {
      track = writeLocal(trackData, replaceTrackId, projectId);
    }

    return NextResponse.json({ success: true, track }, { status: 200 });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Unknown upload error' },
      { status: 500 }
    );
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
    // Try project_tracks first, fall back to playlist_tracks
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
