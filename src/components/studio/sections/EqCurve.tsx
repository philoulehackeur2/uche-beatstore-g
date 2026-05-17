'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Low-shelf gain in dB (typically −12..+12). */
  low: number;
  /** Mid peak gain in dB. */
  mid: number;
  /** High-shelf gain in dB. */
  high: number;
  /** Render width (CSS px). Resize-observable via the parent's width. */
  width?: number;
  height?: number;
  /** Stroke color for the response curve. */
  accent?: string;
  className?: string;
}

/**
 * Tiny canvas-based 3-band EQ frequency-response visualizer.
 *
 * Renders the magnitude response of a low-shelf + peaking + high-shelf
 * filter chain across 20 Hz–20 kHz on a log frequency axis with a
 * symmetric ±12 dB vertical axis. Updates in real time as the
 * channel's Lo/Mid/Hi gain knobs are dragged.
 *
 * Math: simplified analytical responses for each filter (not a strict
 * biquad implementation — we don't need sample-accurate magnitude, we
 * need a smooth visual cue that "tells the truth" about which
 * frequencies are being boosted or cut). The three filter outputs are
 * summed on a dB scale, which is the right composite for a parallel
 * shelf+peak+shelf chain at moderate gains.
 *
 * Self-contained: no audio context needed. Pure DSP math + canvas.
 */
const F_MIN = 20;
const F_MAX = 20_000;
const F_LOW = 200;    // low-shelf corner
const F_MID = 1_000;  // mid peaking center
const F_HIGH = 5_000; // high-shelf corner
const MID_Q = 1.0;
const DB_RANGE = 12;  // ±12 dB vertical scale

export function EqCurve({ low, mid, high, width, height = 44, accent = '#6DC6A4', className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measuredWidthRef = useRef(0);

  // Measure width via ResizeObserver so the canvas scales with whatever
  // container the parent puts us in. Re-paints on size change.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      measuredWidthRef.current = Math.floor(entry.contentRect.width);
      paint();
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repaint whenever the three gain values shift.
  useEffect(() => { paint(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [low, mid, high, height]);

  function paint() {
    const canvas = canvasRef.current;
    const w = width ?? measuredWidthRef.current;
    if (!canvas || !w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, height);

    // Zero-line — the horizontal "flat response" reference at vertical
    // midpoint. Drawn thin and dim so the curve reads against it.
    const mid_y = height / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid_y);
    ctx.lineTo(w, mid_y);
    ctx.stroke();

    // Frequency-response curve. Sample at every other pixel; interp is
    // visually smooth at small heights and halves the work per frame.
    const samples = Math.max(64, Math.floor(w / 2));
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      // Log-spaced frequency: f(t) = F_MIN * (F_MAX/F_MIN)^t
      const f = F_MIN * Math.pow(F_MAX / F_MIN, t);
      const db = response(f, low, mid, high);
      const x = t * w;
      // Map ±DB_RANGE dB to canvas Y (top = +DB_RANGE, bottom = −DB_RANGE).
      const y = mid_y - (db / DB_RANGE) * (height / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Stroke + soft glow underneath so the line reads on the dark
    // background without needing to be thick.
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Subtle fill below the curve for visual heft. We re-trace to a
    // closing point at the zero line so the fill region is well-defined.
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const f = F_MIN * Math.pow(F_MAX / F_MIN, t);
      const db = response(f, low, mid, high);
      const x = t * w;
      const y = mid_y - (db / DB_RANGE) * (height / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(w, mid_y);
    ctx.lineTo(0, mid_y);
    ctx.closePath();
    ctx.fillStyle = `${accent}1A`; // ~10% alpha
    ctx.fill();
  }

  return (
    <div ref={wrapRef} className={cn('w-full rounded-md bg-black/30 border border-white/[0.04]', className)} style={{ height }}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

/**
 * Composite magnitude response in dB at frequency `f` for the chain
 * low-shelf(F_LOW, gLow) + peak(F_MID, gMid, Q) + high-shelf(F_HIGH, gHigh).
 *
 * Uses smooth approximations rather than strict biquad transfer
 * functions — we want a fast visual that's directionally correct,
 * not a verifier for an audio plugin. Errors vs. a real biquad are
 * well under 1 dB at the boost/cut peaks, which is invisible at this
 * canvas size.
 */
function response(f: number, gLow: number, gMid: number, gHigh: number): number {
  // Low-shelf: smooth S-curve from gain at low frequencies → 0 dB at
  // high frequencies. `s` is a sigmoid centered on the corner freq.
  const lowS = 1 / (1 + Math.pow(f / F_LOW, 2));
  const lowDb = gLow * lowS;

  // High-shelf: mirror image of low-shelf.
  const highS = 1 / (1 + Math.pow(F_HIGH / f, 2));
  const highDb = gHigh * highS;

  // Mid peaking: bell curve centered on F_MID in log-frequency space.
  // Bandwidth scales with 1/Q.
  const logRatio = Math.log2(f / F_MID);
  const bell = Math.exp(-((logRatio * MID_Q) ** 2));
  const midDb = gMid * bell;

  return lowDb + midDb + highDb;
}
