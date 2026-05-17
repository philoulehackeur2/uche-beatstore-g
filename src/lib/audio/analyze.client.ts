/**
 * Browser-only audio analysis using Essentia.js WASM.
 * Safe to import in client components — does NOT pull in audio-decode/music-tempo.
 *
 * Two entry points:
 *   - `analyzeAudio(file)`         → during upload (we already have the File)
 *   - `analyzeAudioFromUrl(url)`   → for Re-analyze on existing tracks
 *
 * Both share a single Essentia pipeline. The server route at
 * /api/tracks/[id]/analyze prioritizes client-provided features over its
 * own server-side decode — Essentia in the browser is more accurate than
 * the Node-side music-tempo / Krumhansl heuristics, so this is the
 * preferred path when the browser can read the audio.
 *
 * When the browser can't decode (CORS / unsupported codec / very large
 * file), the caller falls back to the server endpoint without features
 * and lets the server's pipeline take a swing.
 */

export interface AudioFeatures {
  bpm: number | null;
  key: string | null;
  scale: string | null;
  loudness: number | null;
  duration: number | null;
}

const EMPTY: AudioFeatures = { bpm: null, key: null, scale: null, loudness: null, duration: null };

export async function analyzeAudio(file: File): Promise<AudioFeatures> {
  if (typeof window === 'undefined') return { ...EMPTY };
  return runEssentia(await file.arrayBuffer());
}

/**
 * Fetch an audio URL and analyze it in the browser. We route through the
 * same-origin /api/audio proxy so cross-origin R2 URLs don't trip CORS,
 * and so any signed-URL logic on the server (presigning, allowlist) is
 * applied transparently.
 */
export async function analyzeAudioFromUrl(rawUrl: string): Promise<AudioFeatures> {
  if (typeof window === 'undefined') return { ...EMPTY };

  // Same-origin local paths go direct; everything else proxies through
  // /api/audio so we never have to fight R2 CORS in the browser.
  const url = rawUrl.startsWith('/')
    ? rawUrl
    : `/api/audio?src=${encodeURIComponent(rawUrl)}`;

  let buffer: ArrayBuffer;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Audio fetch ${res.status}`);
    buffer = await res.arrayBuffer();
  } catch (err) {
    console.warn('Audio fetch for analysis failed:', err);
    return { ...EMPTY };
  }
  return runEssentia(buffer);
}

async function runEssentia(buffer: ArrayBuffer): Promise<AudioFeatures> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { EssentiaWASM } = (await import('essentia.js')) as any;
    const factory = EssentiaWASM.EssentiaWASM ?? EssentiaWASM;
    const essentia = await factory();

    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const signal = essentia.arrayToVector(decoded.getChannelData(0));

    // RhythmExtractor2013 is Essentia's most reliable BPM detector — same
    // algorithm Spotify et al use for tempo. KeyExtractor handles both
    // key (C, D#, etc.) and scale (major/minor).
    const rhythm = essentia.RhythmExtractor2013(signal);
    const keyData = essentia.KeyExtractor(signal);

    let loudness: number | null = null;
    try {
      const l = essentia.LoudnessEBUR128(signal, signal);
      loudness = +l.integratedLoudness.toFixed(1);
    } catch {
      // LoudnessEBUR128 may not be available in all builds; non-fatal.
    }

    essentia.delete();
    await ctx.close();

    return {
      bpm: Math.round(rhythm.bpm),
      key: keyData.key || null,
      scale: keyData.scale || null,
      loudness,
      duration: Math.round(decoded.duration),
    };
  } catch (err) {
    console.warn('Essentia.js analysis failed:', err);
    // Even if Essentia fails, try to at least return duration so the
    // server has something to merge instead of throwing 422.
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buffer.slice(0));
      const duration = Math.round(decoded.duration);
      await ctx.close();
      return { bpm: null, key: null, scale: null, loudness: null, duration };
    } catch {
      return { ...EMPTY };
    }
  }
}
