import { NextRequest, NextResponse } from 'next/server';
import { pollJob, downloadStem } from '@/lib/stems/dispatch';
import { isSupabaseConfigured, getAll, update, getById, createServiceClient } from '@/lib/db';
import { uploadAudio } from '@/lib/storage/upload';
import { stemName } from '@/lib/naming';

/**
 * GET /api/stems/[jobId]
 *
 * Polls the Demucs service. When the job completes, downloads each stem
 * from the service and re-uploads to R2 with semantic filenames
 * (`{Track Title} — {Stem}.wav`), so final stem URLs are durable and meaningful.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  try {
    // pollJob() parses the prefix and routes to demucs/moises. Bare ids
    // (pre-dispatcher rows) are treated as demucs for back-compat.
    const job = await pollJob(jobId).catch(() => null);

    if (!job) {
      const allStems = getAll('stems');
      const localJob = allStems.find((s: any) => s.job_id === jobId);
      if (!localJob) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      return NextResponse.json({ job: localJob });
    }

    const appStatus =
      job.status === 'done'
        ? 'completed'
        : job.status === 'error'
          ? 'failed'
          : job.status;

    // If already persisted, short-circuit and return the stored URLs
    if (job.status === 'done') {
      const existing = await loadStemRow(jobId);
      if (existing && existing.vocals_url && !existing.vocals_url.startsWith('/api/stems/')) {
        return NextResponse.json({
          job: {
            job_id: jobId,
            status: 'completed',
            progress: 100,
            model: job.model,
            stems: {
              vocals: existing.vocals_url,
              drums: existing.drums_url,
              bass: existing.bass_url,
              other: existing.other_url,
            },
            error: null,
          },
        });
      }
    }

    let stemUrls: Record<string, string> = {};
    if (job.status === 'done') {
      // Resolve track title for semantic naming
      const trackTitle = await resolveTrackTitle(jobId);

      // Download each stem from whichever backend produced it and re-upload
      // to R2 so the final URLs are durable (Moises CDN links may rotate;
      // local Demucs paths only work while the service is running).
      for (const [name, cdnUrl] of Object.entries(job.stems)) {
        try {
          const buffer = await downloadStem(jobId, name, cdnUrl);
          const semantic = stemName(trackTitle, name);
          const filename = `${semantic.replace(/[^\w\-— ]+/g, '').trim() || `stem-${name}`}.wav`;
          const url = await uploadAudio(buffer, filename, 'audio/wav');
          stemUrls[name] = url;
        } catch (err) {
          console.warn(`Stem upload failed for ${name}:`, err);
        }
      }
    }

    if (job.status === 'done' && Object.keys(stemUrls).length > 0) {
      const dbUpdate = {
        status: 'completed',
        vocals_url: stemUrls['vocals'] ?? null,
        drums_url: stemUrls['drums'] ?? null,
        bass_url: stemUrls['bass'] ?? null,
        other_url: stemUrls['other'] ?? null,
      };

      if (isSupabaseConfigured()) {
        const supabase = createServiceClient();
        await supabase.from('stems').update(dbUpdate).eq('job_id', jobId);
      } else {
        const allStems = getAll('stems');
        const localJob = allStems.find((s: any) => s.job_id === jobId);
        if (localJob) update('stems', localJob.id, dbUpdate);
      }
    }

    return NextResponse.json({
      job: {
        job_id: jobId,
        status: appStatus,
        progress: job.progress,
        model: job.model,
        stems: stemUrls,
        error: job.error ?? null,
      },
    });
  } catch (error: any) {
    console.error('Stem poll error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function loadStemRow(jobId: string): Promise<any | null> {
  if (isSupabaseConfigured()) {
    const supabase = createServiceClient();
    const { data } = await supabase.from('stems').select('*').eq('job_id', jobId).maybeSingle();
    return data ?? null;
  }
  const all = getAll('stems');
  return all.find((s: any) => s.job_id === jobId) ?? null;
}

async function resolveTrackTitle(jobId: string): Promise<string> {
  try {
    if (isSupabaseConfigured()) {
      const supabase = createServiceClient();
      const { data: stemRow } = await supabase.from('stems').select('track_id').eq('job_id', jobId).maybeSingle();
      if (stemRow?.track_id) {
        const { data: track } = await supabase.from('tracks').select('title').eq('id', stemRow.track_id).maybeSingle();
        if (track?.title) return track.title;
      }
    } else {
      const stemRow = getAll('stems').find((s: any) => s.job_id === jobId);
      if (stemRow?.track_id) {
        const track = getById('tracks', stemRow.track_id);
        if (track?.title) return track.title;
      }
    }
  } catch (err) {
    console.warn('Resolve track title failed:', err);
  }
  return 'Track';
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
