-- Precomputed waveform peaks sidecar.
--
-- We store the *URL* of the JSON peaks file (sidecar in R2 / public/uploads),
-- not the peaks themselves. Keeps tracks rows light, lets the CDN serve the
-- peaks with long-cache immutable headers, and avoids hauling 8KB of float
-- numbers through every list query.
--
-- NULL means "no peaks computed yet" — WavePlayer falls back to decoding
-- the audio in the browser. Backfill via POST /api/tracks/[id]/peaks.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS peaks_url TEXT;
