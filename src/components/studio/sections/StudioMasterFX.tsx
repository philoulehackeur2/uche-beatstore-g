'use client';

import { Headphones } from 'lucide-react';
import { Slider } from '@/components/ui/Slider';

interface Props {
  masterVol: number;
  setMasterVol: (v: number) => void;
  reverbReturn: number;
  setReverbReturn: (v: number) => void;
  delayReturn: number;
  setDelayReturn: (v: number) => void;
  delayTime: number;
  setDelayTime: (v: number) => void;
  delayFeedback: number;
  setDelayFeedback: (v: number) => void;
}

/**
 * Master volume + send returns + delay tuning — extracted from
 * StudioWorkstation.
 *
 * Every knob is a stock <input type="range"> with shared styling.
 * The audio engine listens to the parent's setters via useEffect so
 * adjustments take effect immediately. No state of its own.
 */
export function StudioMasterFX({
  masterVol, setMasterVol,
  reverbReturn, setReverbReturn,
  delayReturn, setDelayReturn,
  delayTime, setDelayTime,
  delayFeedback, setDelayFeedback,
}: Props) {
  return (
    <div className="border border-[#16130e] rounded-lg p-5 bg-[#0a0907]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Headphones size={12} className="text-[#E8D8B8]" />
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#E8DCC8]">Master + FX</p>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Knob label="Master" value={`${Math.round(masterVol * 100)}`}>
          <Slider value={masterVol} onChange={setMasterVol} min={0} max={1} step={0.01}
            accent="#E8DCC8" showTooltip variant="studio"
            formatTooltip={(v) => `${Math.round(v * 100)}`} aria-label="Master" />
        </Knob>
        <Knob label="Reverb return" value={`${Math.round(reverbReturn * 100)}`}>
          <Slider value={reverbReturn} onChange={setReverbReturn} min={0} max={1.5} step={0.01}
            showTooltip variant="studio"
            formatTooltip={(v) => `${Math.round(v * 100)}`} aria-label="Reverb return" />
        </Knob>
        <Knob label="Delay return" value={`${Math.round(delayReturn * 100)}`}>
          <Slider value={delayReturn} onChange={setDelayReturn} min={0} max={1.5} step={0.01}
            showTooltip variant="studio"
            formatTooltip={(v) => `${Math.round(v * 100)}`} aria-label="Delay return" />
        </Knob>
        <Knob label="Delay time" value={`${Math.round(delayTime * 1000)}ms`}>
          <Slider value={delayTime} onChange={setDelayTime} min={0.05} max={1.5} step={0.005}
            showTooltip variant="studio"
            formatTooltip={(v) => `${Math.round(v * 1000)}ms`} aria-label="Delay time" />
        </Knob>
        <Knob label="Delay feedback" value={`${Math.round(delayFeedback * 100)}`}>
          <Slider value={delayFeedback} onChange={setDelayFeedback} min={0} max={0.95} step={0.01}
            showTooltip variant="studio"
            formatTooltip={(v) => `${Math.round(v * 100)}`} aria-label="Delay feedback" />
        </Knob>
      </div>
    </div>
  );
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
