'use client';

import { Repeat } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface Props {
  currentTime: number;
  duration: number;
  seek: (t: number) => void;
  loopOn: boolean;
  setLoopOn: (fn: (v: boolean) => boolean) => void;
  loopA: number;
  setLoopA: (v: number) => void;
  loopB: number;
  setLoopB: (v: number) => void;
  tempo: number;
  setTempo: (v: number) => void;
  pitchSemis: number;
  setPitchSemis: (v: number) => void;
  preservePitch: boolean;
  setPreservePitch: (fn: (v: boolean) => boolean) => void;
}

/**
 * Transport bar with scrub + loop region + tempo / pitch knobs.
 *
 * Extracted from StudioWorkstation. Self-contained presentation; every
 * state value + setter is threaded through props so the parent retains
 * ownership of audio engine wiring. About 100 LOC removed from the
 * workstation file by lifting this out.
 */
export function StudioTransport({
  currentTime, duration, seek,
  loopOn, setLoopOn, loopA, setLoopA, loopB, setLoopB,
  tempo, setTempo, pitchSemis, setPitchSemis,
  preservePitch, setPreservePitch,
}: Props) {
  return (
    <div className="border border-[#16130e] rounded-lg p-5 bg-[#0a0907]">
      {/* Scrub bar — luxury Slider primitive. Loop region renders as a
          translucent band underneath via absolute overlay. */}
      <div className="flex items-center gap-3 mb-2 text-[10px] font-mono text-[#a08a6a]">
        <span className="tabular-nums">{fmtTime(currentTime)}</span>
        <div className="flex-1 relative">
          {/* Loop region overlay — drawn beneath the slider but on top
              of the track. Slider's own thumb / range sit above this via
              z-index ordering. */}
          {loopOn && duration > 0 && loopB > loopA && (
            <div
              className="absolute top-1/2 -translate-y-1/2 h-2 bg-[#E8D8B8]/15 border border-[#D4BFA0]/40 rounded pointer-events-none z-0"
              style={{
                left: `${(loopA / duration) * 100}%`,
                width: `${((loopB - loopA) / duration) * 100}%`,
              }}
            />
          )}
          <Slider
            value={currentTime}
            onChange={seek}
            min={0}
            max={duration || 0}
            step={0.01}
            showTooltip
            variant="studio"
            formatTooltip={fmtTime}
            aria-label="Scrub position"
          />
        </div>
        <span className="tabular-nums">{fmtTime(duration)}</span>
      </div>

      {/* Loop A / B sliders + "Set A" / "Set B" stamp buttons. */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setLoopOn((v) => !v)}
          className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${
            loopOn
              ? 'bg-[#2A2418] border-[#8A7A5C]/40 text-[#E8D8B8]'
              : 'bg-[#16130e] border-[#1a160f] text-[#6a5d4a]'
          }`}
        >
          <Repeat size={10} /> Loop
        </button>
        <span className="text-[10px] font-mono text-[#5a5142]">A</span>
        <div className="flex-1">
          <Slider
            value={loopA}
            onChange={(v) => setLoopA(Math.min(v, loopB))}
            min={0} max={duration || 0} step={0.01}
            accent="#E8D8B8" variant="studio"
            aria-label="Loop start"
          />
        </div>
        <span className="text-[10px] font-mono text-[#a08a6a] w-12 text-right tabular-nums">{fmtTime(loopA)}</span>
        <span className="text-[10px] font-mono text-[#5a5142] ml-2">B</span>
        <div className="flex-1">
          <Slider
            value={loopB}
            onChange={(v) => setLoopB(Math.max(v, loopA))}
            min={0} max={duration || 0} step={0.01}
            accent="#E8D8B8" variant="studio"
            aria-label="Loop end"
          />
        </div>
        <span className="text-[10px] font-mono text-[#a08a6a] w-12 text-right tabular-nums">{fmtTime(loopB)}</span>
        <span className="text-[10px] font-mono text-[#a08a6a] w-12 text-right">{fmtTime(loopB)}</span>
        <button
          onClick={() => setLoopA(currentTime)}
          className="text-[9px] font-mono uppercase text-[#5a5142] hover:text-white px-1.5"
        >Set A</button>
        <button
          onClick={() => setLoopB(currentTime)}
          className="text-[9px] font-mono uppercase text-[#5a5142] hover:text-white px-1.5"
        >Set B</button>
      </div>

      {/* Tempo + pitch + pitch-lock toggle. */}
      <div className="grid grid-cols-3 gap-5">
        <div>
          <Knob label="Tempo" value={`${(tempo * 100).toFixed(0)}%`}>
            <Slider
              value={tempo} onChange={setTempo}
              min={0.5} max={1.5} step={0.01}
              showTooltip variant="studio" bipolar
              formatTooltip={(v) => `${(v * 100).toFixed(0)}%`}
              aria-label="Tempo"
            />
          </Knob>
        </div>
        <div>
          <Knob
            label={`Pitch ${!preservePitch ? '(vinyl)' : ''}`}
            value={preservePitch ? '0st' : `${pitchSemis > 0 ? '+' : ''}${pitchSemis}st`}
          >
            <Slider
              value={pitchSemis} onChange={(v) => setPitchSemis(Math.round(v))}
              min={-12} max={12} step={1}
              disabled={preservePitch}
              showTooltip variant="studio" bipolar
              formatTooltip={(v) => `${v > 0 ? '+' : ''}${Math.round(v)}st`}
              aria-label="Pitch"
            />
          </Knob>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142]">Pitch lock</label>
            <button
              onClick={() => setPreservePitch((v) => !v)}
              className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${
                preservePitch
                  ? 'bg-[#2A2418] text-[#E8D8B8] border border-[#8A7A5C]/40'
                  : 'bg-[#16130e] text-[#6a5d4a] border border-[#1a160f]'
              }`}
            >{preservePitch ? 'On' : 'Off'}</button>
          </div>
          <p className="text-[10px] text-[#5a5142] leading-relaxed">
            {preservePitch
              ? 'Tempo without pitch shift.'
              : 'Tempo + pitch coupled (vinyl).'}
          </p>
        </div>
      </div>
    </div>
  );
}

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function Knob({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142]">{label}</label>
        <span className="text-[11px] text-[#E8D8B8] font-mono">{value}</span>
      </div>
      {children}
    </div>
  );
}
