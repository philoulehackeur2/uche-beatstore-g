'use client';

/**
 * /store/projects/access/[token]
 *
 * Post-purchase delivery for project bundles, styled like a Spotify
 * album page. The 24-byte hex token in the URL acts as the access
 * code — anyone holding it can stream + download every track in the
 * bundle. Streaming uses the persistent PlayerBar mounted by the
 * /store layout (so the bottom transport is shared with the rest of
 * the storefront).
 */

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import {
  Loader2, Layers, Play, Pause, Music, Download, Lock, Mail,
  Globe, AtSign, Link2, ShieldCheck,
} from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import type { Track } from '@/lib/types';

interface AccessTrack {
  id: string;
  title: string;
  type: string;
  audio_url: string | null;
  wav_url: string | null;
  peaks_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  bpm: number | null;
  key: string | null;
  scale: string | null;
}

interface AccessProject {
  id: string;
  name: string;
  cover_url: string | null;
  description: string | null;
  price_usd: number | null;
}

interface AccessCreator {
  display_name?: string | null;
  contact_email?: string | null;
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  spotify_url?: string | null;
  soundcloud_url?: string | null;
  website_url?: string | null;
  accent_color?: string | null;
}

interface AccessInfo {
  granted_at: string;
}

function fmt(secs: number | null): string {
  if (!secs) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtTotal(secs: number): string {
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m} min ${s} sec`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h} hr ${m} min`;
}

export default function ProjectAccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [project, setProject] = useState<AccessProject | null>(null);
  const [tracks, setTracks] = useState<AccessTrack[]>([]);
  const [creator, setCreator] = useState<AccessCreator | null>(null);
  const [access, setAccess] = useState<AccessInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const { currentTrack, isPlaying, setTrack: playTrack, togglePlay, setQueue } = usePlayer();
  void access;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/store/projects/access/${token}`);
        if (res.status === 404) { setInvalid(true); return; }
        const data = await res.json();
        if (data.error) { setInvalid(true); return; }
        setProject(data.project);
        setTracks(data.tracks ?? []);
        setCreator(data.creator ?? null);
        setAccess(data.access ?? null);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0907] flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#5a5142]" />
      </div>
    );
  }

  if (invalid || !project) {
    return (
      <div className="min-h-screen bg-[#0a0907] flex flex-col items-center justify-center gap-4 text-[#5a5142] px-6">
        <Lock size={36} />
        <p className="text-[14px] text-center max-w-sm">
          This access link is invalid or has expired. Each link is one-buyer; check the email it came from for the latest code.
        </p>
        {creator?.contact_email && (
          <a
            href={`mailto:${creator.contact_email}`}
            className="text-[11px] underline hover:text-[#E8DCC8]"
          >
            Contact the producer
          </a>
        )}
      </div>
    );
  }

  const accent = creator?.accent_color || '#D4BFA0';
  const totalDuration = tracks.reduce((acc, t) => acc + (t.duration_seconds ?? 0), 0);
  const playAll = () => {
    if (tracks.length === 0) return;
    if (currentTrack && tracks.some((t) => t.id === currentTrack.id)) {
      togglePlay();
      return;
    }
    setQueue(tracks as unknown as Track[]);
    playTrack(tracks[0] as unknown as Track);
  };
  const anyOurTrackPlaying =
    isPlaying && currentTrack && tracks.some((t) => t.id === currentTrack.id);

  return (
    <div className="min-h-screen bg-[#0a0907] text-[#E8DCC8]">
      {/* ── Hero — cover bleed + gradient overlay ─────────────────── */}
      <div className="relative">
        {project.cover_url && (
          <div
            className="absolute inset-0 -z-10 bg-cover bg-center blur-3xl opacity-30 scale-110"
            style={{ backgroundImage: `url(${project.cover_url})` }}
            aria-hidden
          />
        )}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: `linear-gradient(180deg, ${accent}26 0%, rgba(10,9,7,0.6) 40%, #0a0907 100%)`,
          }}
          aria-hidden
        />

        <div className="max-w-6xl mx-auto px-4 md:px-10 pt-16 md:pt-24 pb-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-end">
            <div className="w-[180px] md:w-[230px] aspect-square rounded-md overflow-hidden bg-[#14110d] border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.7)] shrink-0">
              {project.cover_url ? (
                <img
                  src={project.cover_url}
                  alt={project.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2A2418] to-[#0a0907] text-[#5a5142]">
                  <Layers size={56} />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/70">
                Project bundle
              </p>
              <h1 className="mt-2 text-3xl md:text-6xl font-bold text-white leading-[1.05] tracking-tight font-heading break-words">
                {project.name}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/70">
                {creator?.display_name && (
                  <span className="text-white/95 font-semibold">{creator.display_name}</span>
                )}
                <span className="text-white/40">·</span>
                <span>{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
                {totalDuration > 0 && (
                  <>
                    <span className="text-white/40">·</span>
                    <span className="text-white/60">{fmtTotal(totalDuration)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Action bar ──────────────────────────────────────── */}
          <div className="mt-8 flex items-center gap-5">
            <button
              onClick={playAll}
              disabled={tracks.length === 0}
              className="w-14 h-14 rounded-full flex items-center justify-center text-black shadow-[0_8px_24px_rgba(0,0,0,0.5)] hover:scale-[1.04] active:scale-[0.97] transition-transform disabled:opacity-40"
              style={{ backgroundColor: accent }}
              aria-label={anyOurTrackPlaying ? 'Pause' : 'Play all'}
            >
              {anyOurTrackPlaying
                ? <Pause size={22} fill="currentColor" />
                : <Play size={22} fill="currentColor" className="ml-1" />}
            </button>

            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#6DC6A4]/30 bg-[#6DC6A4]/[0.08] text-[10px] font-mono uppercase tracking-[0.2em] text-[#6DC6A4]"
              title="You have full access to every track in this bundle"
            >
              <ShieldCheck size={12} />
              Owned
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 md:px-10 pb-32">
        {project.description && (
          <p className="text-[13px] text-[#a08a6a] leading-relaxed whitespace-pre-line max-w-3xl mb-10">
            {project.description}
          </p>
        )}

        {/* Track list */}
        {tracks.length === 0 ? (
          <div className="rounded-xl border border-[#1f1a13] bg-[#14110d] px-5 py-10 text-center">
            <Music size={20} className="text-[#3a3328] mx-auto mb-2" />
            <p className="text-[12px] text-[#6a5d4a]">No tracks in this project yet.</p>
          </div>
        ) : (
          <div>
            <div className="hidden md:grid grid-cols-[24px_minmax(0,1fr)_120px_60px_180px] gap-4 px-4 pb-2 mb-2 border-b border-white/[0.06] text-[10px] font-mono uppercase tracking-[0.15em] text-white/40">
              <span className="text-right">#</span>
              <span>Title</span>
              <span>Meta</span>
              <span className="text-right">Time</span>
              <span className="text-right pr-1">Download</span>
            </div>
            <ul>
              {tracks.map((t, i) => {
                const isCur = currentTrack?.id === t.id;
                const isCurPlaying = isCur && isPlaying;
                const isHovered = hoveredRow === t.id;
                return (
                  <li
                    key={t.id}
                    onMouseEnter={() => setHoveredRow(t.id)}
                    onMouseLeave={() => setHoveredRow((v) => (v === t.id ? null : v))}
                    className={`group grid grid-cols-[24px_minmax(0,1fr)_auto] md:grid-cols-[24px_minmax(0,1fr)_120px_60px_180px] gap-4 items-center px-4 py-2 rounded-md transition-colors ${isCur ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'}`}
                  >
                    {/* Index / play button (swap on hover) */}
                    <div className="text-right">
                      <button
                        onClick={() => {
                          if (isCur) { togglePlay(); return; }
                          setQueue(tracks as unknown as Track[]);
                          playTrack(t as unknown as Track);
                        }}
                        aria-label={isCurPlaying ? 'Pause' : 'Play'}
                        className="w-6 h-6 flex items-center justify-center text-white/90 ml-auto"
                      >
                        {isCur ? (
                          isCurPlaying
                            ? <Pause size={12} fill="currentColor" style={{ color: accent }} />
                            : <Play size={12} fill="currentColor" style={{ color: accent }} className="ml-0.5" />
                        ) : isHovered ? (
                          <Play size={12} fill="currentColor" className="ml-0.5" />
                        ) : (
                          <span className="text-[11px] font-mono text-white/40 tabular-nums">{i + 1}</span>
                        )}
                      </button>
                    </div>

                    {/* Cover + title */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded shrink-0 bg-[#0a0907] overflow-hidden border border-white/[0.06]">
                        {t.cover_url
                          ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[#3a3328]"><Music size={12} /></div>}
                      </div>
                      <div className="min-w-0">
                        <p
                          className="text-[14px] truncate"
                          style={isCur ? { color: accent, fontWeight: 600 } : { color: '#E8DCC8' }}
                        >
                          {t.title}
                        </p>
                        {creator?.display_name && (
                          <p className="text-[11px] text-white/50 truncate">{creator.display_name}</p>
                        )}
                      </div>
                    </div>

                    {/* Meta column (BPM/Key) */}
                    <div className="hidden md:flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-white/45">
                      {t.bpm && <span>{t.bpm} BPM</span>}
                      {t.key && <span>· {t.key}{t.scale === 'minor' ? 'm' : ''}</span>}
                    </div>

                    {/* Duration */}
                    <div className="hidden md:block text-right text-[11px] font-mono text-white/45 tabular-nums">
                      {fmt(t.duration_seconds)}
                    </div>

                    {/* Download buttons — always visible on mobile, fade-in on desktop hover/current */}
                    <div className={`flex items-center gap-1.5 justify-end transition-opacity md:opacity-0 md:group-hover:opacity-100 ${isCur ? 'md:opacity-100' : ''}`}>
                      {t.wav_url && (
                        <a
                          href={t.wav_url}
                          download
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-black text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: accent }}
                          aria-label="Download WAV"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={10} />
                          WAV
                        </a>
                      )}
                      {t.audio_url && (
                        <a
                          href={t.audio_url}
                          download
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.06] border border-white/[0.10] text-[#E8DCC8] text-[10px] font-bold uppercase tracking-wider hover:bg-white/[0.12] transition-colors"
                          aria-label="Download MP3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={10} />
                          MP3
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Producer footer ──────────────────────────────────── */}
        {creator?.display_name && (
          <div className="mt-16 pt-8 border-t border-white/[0.06]">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-3">
              About the producer
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/store/producer/${encodeURIComponent(creator.display_name.toLowerCase().replace(/\s+/g, '-'))}`}
                className="text-[16px] font-semibold text-white hover:text-[#D4BFA0] transition-colors"
              >
                {creator.display_name}
              </Link>
              <div className="flex items-center gap-1.5 ml-2 flex-wrap">
                {creator.instagram_handle && (
                  <a
                    href={`https://instagram.com/${creator.instagram_handle.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors"
                    title="Instagram"
                  >
                    <AtSign size={13} />
                  </a>
                )}
                {creator.twitter_handle && (
                  <a
                    href={`https://x.com/${creator.twitter_handle.replace(/^@/, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors"
                    title="X / Twitter"
                  >
                    <Link2 size={13} />
                  </a>
                )}
                {creator.website_url && (
                  <a
                    href={creator.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors"
                    title="Website"
                  >
                    <Globe size={13} />
                  </a>
                )}
                {creator.contact_email && (
                  <a
                    href={`mailto:${creator.contact_email}`}
                    className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.04] border border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.10] transition-colors"
                    title="Email"
                  >
                    <Mail size={13} />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="mt-10 text-[10px] font-mono text-white/30">
          Keep this link private — anyone holding it can download these files.
        </p>
      </div>
    </div>
  );
}
