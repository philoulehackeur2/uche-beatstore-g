'use client';

/**
 * /analytics — Engagement & plays dashboard.
 *
 * Strictly about how people interact with your music: plays, listeners,
 * and track popularity. Revenue and transactions live on /sales.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Loader2, Headphones, Music, AlertCircle, BarChart3,
  TrendingUp, Radio, ExternalLink,
} from 'lucide-react';

interface Totals { plays: number; sales_count: number; gross_usd: number }
interface ByTrack { track_id: string; title: string; plays: number; sales: number; gross: number }
interface ByDay { date: string; sales: number; gross: number }

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AnalyticsPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [byTrack, setByTrack] = useState<ByTrack[]>([]);
  const [byDay, setByDay] = useState<ByDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/analytics');
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setTotals(data.totals);
        setByTrack(data.by_track ?? []);
        setByDay(data.by_day ?? []);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Plays sparkline — use sales count per day as a proxy for activity
  // (the API doesn't have plays-per-day yet; when it does, swap byDay.plays in)
  const activityLine = useMemo(() => {
    if (byDay.length === 0) return null;
    const vals = byDay.map((d) => d.sales);
    const max = Math.max(1, ...vals);
    const w = 400; const h = 44;
    const step = w / Math.max(1, vals.length - 1);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
    return { pts, vals, max, w, h };
  }, [byDay]);

  // Top-track max plays (for bar widths)
  const maxPlays = useMemo(() => Math.max(1, ...byTrack.map((t) => t.plays)), [byTrack]);

  const isEmpty = !loading && !error && (totals?.plays ?? 0) === 0;

  return (
    <DashboardLayout>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-32">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#a08a6a] mb-1">Dashboard</p>
            <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight text-white leading-none font-heading">Analytics</h1>
            <p className="text-[12px] text-[#6a5d4a] mt-1.5">Plays, listeners, and track engagement — not revenue.</p>
          </div>
          <Link
            href="/sales"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#1f1a13] bg-[#14110d] text-[10px] font-mono text-[#6a5d4a] hover:text-[#E8DCC8] hover:border-[#2d2620] transition-all"
          >
            Revenue & sales
            <ExternalLink size={10} />
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#1f1a13] bg-[#14110d] py-20 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-[#4a4338]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-6 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] text-red-300 font-medium">Could not load analytics</p>
              <p className="text-[10px] text-[#a08a6a] mt-1 font-mono">{error}</p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-[#1f1a13] bg-[#14110d] px-6 py-16 text-center">
            <Radio size={28} className="text-[#3a3328] mx-auto mb-3" />
            <p className="text-[14px] text-[#E8DCC8] font-medium mb-1">No plays yet</p>
            <p className="text-[12px] text-[#6a5d4a] max-w-md mx-auto mb-5">
              Once someone streams a beat via a share link or your store, plays will appear here by track and by day.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/store-editor" className="text-[10px] font-mono uppercase tracking-wider px-3 py-2 rounded-md bg-[#D4BFA0] text-[#14110d] hover:bg-[#E8DCC8] transition-colors">
                List tracks for sale
              </Link>
              <Link href="/contacts" className="text-[10px] font-mono uppercase tracking-wider px-3 py-2 rounded-md border border-[#2d2620] text-[#a08a6a] hover:text-[#E8DCC8] hover:border-[#3a3328] transition-colors">
                Send a beat
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Engagement KPIs — plays only, no revenue */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
              <EngagementCard
                label="Total plays"
                value={String(totals?.plays ?? 0)}
                icon={<Headphones size={14} />}
                accent="#D4BFA0"
              />
              <EngagementCard
                label="Tracks played"
                value={String(byTrack.filter((t) => t.plays > 0).length)}
                icon={<Music size={14} />}
                accent="#9d95e8"
              />
              <EngagementCard
                label="Avg plays/track"
                value={byTrack.length > 0
                  ? (byTrack.reduce((a, t) => a + t.plays, 0) / byTrack.filter((t) => t.plays > 0).length || 0).toFixed(1)
                  : '—'}
                icon={<TrendingUp size={14} />}
                accent="#6DC6A4"
              />
            </div>

            {/* Activity chart (sales activity as proxy for engagement) */}
            {activityLine && activityLine.vals.some(Boolean) && (
              <div className="rounded-2xl border border-[#1f1a13] bg-[#14110d] px-5 py-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a5142]">Activity · last 30 days</p>
                  <p className="text-[9px] font-mono text-[#3a3328]">{byDay[0] ? fmtDate(byDay[0].date) : ''} → today</p>
                </div>
                <svg viewBox={`0 0 ${activityLine.w} ${activityLine.h}`} className="w-full" preserveAspectRatio="none" style={{ height: activityLine.h }}>
                  <defs>
                    <linearGradient id="engageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9d95e8" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#9d95e8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points={`0,${activityLine.h} ${activityLine.pts} ${activityLine.w},${activityLine.h}`} fill="url(#engageGrad)" stroke="none" />
                  <polyline points={activityLine.pts} fill="none" stroke="#9d95e8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </div>
            )}

            {/* Top tracks by plays — horizontal bar chart */}
            {byTrack.length > 0 && (
              <div className="rounded-2xl border border-[#1f1a13] bg-[#14110d] mb-5 overflow-hidden">
                <div className="px-5 py-3 border-b border-[#1a160f] flex items-center gap-2">
                  <BarChart3 size={12} className="text-[#a08a6a]" />
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#a08a6a]">Top tracks by plays</p>
                </div>
                <div className="divide-y divide-[#1a160f]">
                  {byTrack.slice(0, 10).map((t, rank) => (
                    <div key={t.track_id} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-[10px] font-mono text-[#3a3328] tabular-nums w-5 shrink-0">{rank + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <Link href={`/library/${t.track_id}`} className="text-[12px] text-[#E8DCC8] truncate hover:text-[#D4BFA0] transition-colors">
                            {t.title}
                          </Link>
                          <span className="text-[11px] font-mono font-bold text-[#D4BFA0] tabular-nums ml-3 shrink-0">{t.plays}</span>
                        </div>
                        {/* Play bar */}
                        <div className="h-[3px] rounded-full bg-[#1f1a13] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#D4BFA0]/60 transition-all duration-500"
                            style={{ width: `${Math.max(2, (t.plays / maxPlays) * 100).toFixed(1)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer note */}
            <p className="text-[9px] font-mono text-[#3a3328] text-center mt-6">
              For revenue and order history, visit{' '}
              <Link href="/sales" className="text-[#6a5d4a] hover:text-[#a08a6a] underline underline-offset-2 transition-colors">Sales →</Link>
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function EngagementCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent: string }) {
  return (
    <div className="rounded-xl border border-[#1f1a13] bg-[#14110d] px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color: accent }}>
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#5a5142]">{label}</span>
      </div>
      <p className="text-[22px] font-bold text-white tabular-nums leading-none">{value}</p>
    </div>
  );
}
