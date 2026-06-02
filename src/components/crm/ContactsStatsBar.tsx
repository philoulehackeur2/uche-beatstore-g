'use client';

import { ChevronDown, BarChart3 } from 'lucide-react';
import { Popover } from '@/components/ui/Popover';

export interface ContactsStats {
  total: number;
  active: number;
  needNudge: number;
  responseRate: number;
  openedCount: number;
  sends: number;
  pipeline: Record<string, number>;
}

const PIPELINE_ROWS: [string, string][] = [
  ['placed', '#6DC6A4'],
  ['negotiating', '#e8a86a'],
  ['interested', '#D4BFA0'],
  ['opened', '#7aa8e8'],
  ['sent', '#6a5d4a'],
];

/** Single compact stats line. Pipeline funnel tucked behind a Popover. */
export function ContactsStatsBar({ stats }: { stats: ContactsStats }) {
  const Metric = ({ color, value, label }: { color: string; value: string | number; label: string }) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-[12px] text-[#E8DCC8] font-medium tabular-nums">{value}</span>
      <span className="text-[11px] text-[#5a5142]">{label}</span>
    </span>
  );

  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mb-5 px-1">
      <Metric color="#a08a6a" value={stats.total.toLocaleString()} label="contacts" />
      <span className="text-[#2d2620]">·</span>
      <Metric color="#6DC6A4" value={stats.active} label="active" />
      <span className="text-[#2d2620]">·</span>
      <Metric color="#e8a86a" value={stats.needNudge} label="need nudge" />
      <span className="text-[#2d2620]">·</span>
      <Metric color="#7aa8e8" value={`${stats.responseRate}%`} label="response" />

      <Popover
        align="left"
        width={240}
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref as any}
            onClick={toggle}
            className={`ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[11px] font-medium border transition-colors ${
              open ? 'bg-[var(--accent-tint)] border-[var(--accent-dim)]/40 text-[#E8D8B8]' : 'border-[var(--border)] text-[#a08a6a] hover:text-[#E8DCC8] hover:border-[var(--border-hover)]'
            }`}
          >
            <BarChart3 size={12} /> Pipeline <ChevronDown size={11} className={open ? 'rotate-180' : ''} />
          </button>
        )}
      >
        <div className="p-3 space-y-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a5142] mb-1">Send pipeline</p>
          {stats.sends === 0 ? (
            <p className="text-[11px] text-[#3a3328]">No sends yet</p>
          ) : (
            PIPELINE_ROWS.map(([stage, color]) => {
              const n = stats.pipeline[stage] ?? 0;
              const pct = stats.sends > 0 ? Math.round((n / stats.sends) * 100) : 0;
              return (
                <div key={stage} className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-[#1a160f] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[10px] font-mono capitalize text-[#5a5142] flex-1">{stage}</span>
                  <span className="text-[10px] font-mono text-[#a08a6a] tabular-nums">{n}</span>
                </div>
              );
            })
          )}
          <div className="pt-2 mt-1 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5a5142]">Opened</span>
            <span className="text-[10px] font-mono text-[#a08a6a]">
              {stats.openedCount > 0 ? `${stats.openedCount} · ${Math.round((stats.openedCount / Math.max(1, stats.sends)) * 100)}%` : 'pending'}
            </span>
          </div>
        </div>
      </Popover>
    </div>
  );
}
