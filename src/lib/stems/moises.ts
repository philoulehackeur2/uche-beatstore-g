export interface MoisesJob {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  result?: {
    vocals: string;
    drums: string;
    bass: string;
    other: string;
  };
}

/**
 * Starts a stem splitting job on Moises AI.
 * Section 8.1 Requirement
 */
export async function startStemSplit(audioUrl: string): Promise<string> {
  const apiKey = process.env.MOISES_API_KEY;
  if (!apiKey) throw new Error('Missing MOISES_API_KEY');

  const res = await fetch('https://api.moises.ai/v1/stems-split', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      downloadUrl: audioUrl,
      workflow: 'moises/stems-4', // vocals, drums, bass, other
    }),
  });

  if (!res.ok) throw new Error(`Moises API error: ${res.statusText}`);
  const data = await res.json();
  return data.id;
}

/**
 * Polls status of a Moises job.
 * Section 8.2 Requirement
 */
export async function getStemSplitStatus(jobId: string): Promise<MoisesJob> {
  const apiKey = process.env.MOISES_API_KEY;
  if (!apiKey) throw new Error('Missing MOISES_API_KEY');

  const res = await fetch(`https://api.moises.ai/v1/stems-split/${jobId}`, {
    headers: { 'Authorization': apiKey },
  });

  if (!res.ok) throw new Error(`Moises API status error: ${res.statusText}`);
  const data = await res.json();

  return {
    id: data.id,
    status: data.status === 'completed' ? 'done' : data.status === 'error' ? 'failed' : data.status,
    result: data.status === 'completed' ? {
      vocals: data.result.vocals,
      drums: data.result.drums,
      bass: data.result.bass,
      other: data.result.other,
    } : undefined,
  };
}
