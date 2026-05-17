/**
 * Unified audio metric formatters.
 * Every UI surface MUST use these so Vault output is consistent.
 */

export const fmtBpm = (v: number | null | undefined): string =>
  v == null ? '—' : `${Math.round(v)} BPM`;

export const fmtKey = (
  k: string | null | undefined,
  s: string | null | undefined
): string => {
  if (!k) return '—';
  const scale = s ? `${s.charAt(0).toUpperCase()}${s.slice(1).toLowerCase()}` : '';
  return scale ? `${k} ${scale}` : k;
};

export const fmtLUFS = (v: number | null | undefined): string =>
  v == null ? '—' : `${v.toFixed(1)} LUFS`;

/** 0..1 → percentage */
export const fmtPct = (v: number | null | undefined): string => {
  if (v == null) return '—';
  const clamped = Math.max(0, Math.min(1, v));
  return `${Math.round(clamped * 100)}%`;
};

export const fmtDuration = (s: number | null | undefined): string => {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};

export const fmtFileSize = (bytes: number | null | undefined): string => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Clamp to [0,1]; use at the storage boundary */
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
