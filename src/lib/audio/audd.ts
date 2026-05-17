import { clamp01 } from './format';

export interface AuddFeatures {
  danceability: number;
  energy: number;
  valence: number;
  acousticness: number;
  tempo: number;
}

const ZERO: AuddFeatures = {
  danceability: 0, energy: 0, valence: 0, acousticness: 0, tempo: 0,
};

/**
 * Fetches audio features from AudD API.
 * All normalized-range values are clamped to [0, 1] at the boundary.
 */
export async function getAuddFeatures(file: File | Buffer, fileName: string): Promise<AuddFeatures> {
  const apiToken = process.env.NEXT_PUBLIC_AUDD_API_TOKEN;
  if (!apiToken || apiToken === 'dummy') {
    return ZERO;
  }

  try {
    const formData = new FormData();
    if (Buffer.isBuffer(file)) {
      formData.append('file', new Blob([new Uint8Array(file)]), fileName);
    } else {
      formData.append('file', file);
    }
    formData.append('api_token', apiToken);
    formData.append('return', 'spotify');

    const res = await fetch('https://api.audd.io/', { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`AudD API error: ${res.statusText}`);

    const data = await res.json();
    const sf = data.result?.spotify?.audio_features;
    if (!sf) return ZERO;

    return {
      danceability: +clamp01(sf.danceability || 0).toFixed(2),
      energy:       +clamp01(sf.energy || 0).toFixed(2),
      valence:      +clamp01(sf.valence || 0).toFixed(2),
      acousticness: +clamp01(sf.acousticness || 0).toFixed(2),
      tempo:        +(sf.tempo || 0).toFixed(2),
    };
  } catch (error) {
    console.error('AudD Analysis Error:', error);
    return ZERO;
  }
}
