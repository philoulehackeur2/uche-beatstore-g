'use client';

/**
 * /store-editor — Dashboard-side WYSIWYG editor for the public /store page.
 *
 * Sections (each collapsible):
 *   1. Hero — display_name, bio, credits, hero_image_url, accent_color
 *   2. Social Links — instagram, twitter, spotify, soundcloud, website, email
 *   3. Featured Playlists — drag-to-reorder, toggle featured (max 5)
 *   4. Track Listing Controls — store_enabled, default prices, license_notes
 *
 * Live preview: a read-only sidebar component that mirrors the unsaved
 * form state in real time. On mobile it's behind a "Preview" toggle.
 *
 * Persistence: PATCH /api/profile for all profile fields;
 *              PATCH /api/playlists/[id] per playlist for store_featured + store_order.
 */

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2, Save, ExternalLink, ChevronDown, ChevronRight,
  Image as ImageIcon, Upload, Globe, Instagram, Twitter,
  Music, ListMusic, DollarSign, Eye, EyeOff,
  GripVertical, Check, X, Plus,
} from 'lucide-react';
import { toast } from '@/hooks/useToast';
import { audioSrc } from '@/lib/audio/url';

/* ─── Types ─────────────────────────────────────────────────── */

interface ProfileForm {
  display_name: string;
  bio: string;
  credits: string;
  hero_image_url: string;
  accent_color: string;
  font_style: string;
  instagram_handle: string;
  twitter_handle: string;
  spotify_url: string;
  soundcloud_url: string;
  website_url: string;
  contact_email: string;
  license_lease_price_usd: string;
  license_exclusive_price_usd: string;
  license_notes: string;
  store_enabled: boolean;
}

interface PlaylistRow {
  id: string;
  name: string;
  cover_url?: string | null;
  track_count: number;
  store_featured?: boolean;
  store_order?: number | null;
}

const EMPTY_PROFILE: ProfileForm = {
  display_name: '',
  bio: '',
  credits: '',
  hero_image_url: '',
  accent_color: '#D4BFA0',
  font_style: 'default',
  instagram_handle: '',
  twitter_handle: '',
  spotify_url: '',
  soundcloud_url: '',
  website_url: '',
  contact_email: '',
  license_lease_price_usd: '',
  license_exclusive_price_usd: '',
  license_notes: '',
  store_enabled: true,
};

const ACCENT_PRESETS = [
  '#D4BFA0', '#7F77DD', '#6DC6A4', '#E8C47A',
  '#C47A7A', '#7AC4E8', '#B07AE8',
];

/* ─── Accordion section ──────────────────────────────────────── */

function Section({
  id, title, icon, open, onToggle, children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#1f1a13] bg-[#14110d] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-[#a08a6a]">{icon}</span>
          <span className="text-[13px] font-semibold text-[#E8DCC8]">{title}</span>
        </div>
        {open
          ? <ChevronDown size={15} className="text-[#5a5142]" />
          : <ChevronRight size={15} className="text-[#5a5142]" />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[#1a160f] space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─── Field helpers ──────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-mono uppercase tracking-wider text-[#6a5d4a] block mb-1.5">
      {children}
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-[#0c0a08] border border-[#1f1a13] rounded-lg px-3 py-2 text-[12px] text-[#E8DCC8] placeholder:text-[#3a3328] focus:outline-none focus:border-[#8A7A5C] transition-colors';
const textareaCls = `${inputCls} resize-none leading-relaxed`;

/* ─── Live preview ───────────────────────────────────────────── */

function StorePreview({
  profile,
  featuredPlaylists,
}: {
  profile: ProfileForm;
  featuredPlaylists: PlaylistRow[];
}) {
  const accent = profile.accent_color || '#D4BFA0';

  return (
    <div
      className="rounded-2xl overflow-hidden border border-[#1f1a13] bg-[#0a0907] text-[#E8DCC8]"
      style={{ '--store-accent': accent } as React.CSSProperties}
    >
      {/* Hero strip */}
      <div className="relative min-h-[160px] flex flex-col justify-end p-5">
        {/* Background */}
        {profile.hero_image_url ? (
          <img
            src={profile.hero_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        ) : (
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: `radial-gradient(ellipse at 30% 50%, ${accent} 0%, transparent 65%)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0907]/90 to-transparent" />

        <div className="relative z-10">
          <p className="text-[8px] font-mono uppercase tracking-widest mb-1" style={{ color: accent }}>
            {profile.credits || 'Producer'}
          </p>
          <h2 className="text-[22px] font-black uppercase tracking-tight text-white leading-none">
            {profile.display_name || 'Your Name'}
          </h2>
          {profile.bio && (
            <p className="text-[10px] text-[#a08a6a] mt-1.5 leading-relaxed line-clamp-2">
              {profile.bio}
            </p>
          )}
          {/* Social icons strip */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {profile.instagram_handle && (
              <span className="text-[9px] font-mono text-[#6a5d4a] bg-white/[0.04] border border-[#1f1a13] px-2 py-0.5 rounded">
                IG @{profile.instagram_handle}
              </span>
            )}
            {profile.twitter_handle && (
              <span className="text-[9px] font-mono text-[#6a5d4a] bg-white/[0.04] border border-[#1f1a13] px-2 py-0.5 rounded">
                𝕏 @{profile.twitter_handle}
              </span>
            )}
            {profile.spotify_url && (
              <span className="text-[9px] font-mono text-[#6a5d4a] bg-white/[0.04] border border-[#1f1a13] px-2 py-0.5 rounded">
                Spotify
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Featured playlists */}
      {featuredPlaylists.length > 0 && (
        <div className="px-4 py-3 border-t border-[#1a160f]">
          <p className="text-[8px] font-mono uppercase tracking-widest text-[#5a5142] mb-2">Featured</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {featuredPlaylists.map((pl) => (
              <div key={pl.id} className="shrink-0 w-16">
                <div className="w-16 h-16 rounded-lg bg-[#1a160f] border border-[#2d2620] overflow-hidden flex items-center justify-center mb-1">
                  {pl.cover_url
                    ? <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                    : <ListMusic size={16} className="text-[#3a3328]" />}
                </div>
                <p className="text-[8px] text-[#6a5d4a] truncate leading-tight">{pl.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Track grid stub */}
      <div className="px-4 py-3 border-t border-[#1a160f]">
        <p className="text-[8px] font-mono uppercase tracking-widest text-[#5a5142] mb-2">Beats</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-square rounded-lg bg-[#1a160f] border border-[#1f1a13] flex items-center justify-center">
              <Music size={12} className="text-[#2d2620]" />
            </div>
          ))}
        </div>
        <p className="text-[9px] text-[#3a3328] mt-2 font-mono">Your published beats appear here.</p>
      </div>

      {/* Price bar */}
      {(profile.license_lease_price_usd || profile.license_exclusive_price_usd) && (
        <div className="px-4 py-2 border-t border-[#1a160f] flex items-center gap-3">
          {profile.license_lease_price_usd && (
            <span className="text-[9px] font-mono text-[#E8DCC8]">
              Lease from <strong>${profile.license_lease_price_usd}</strong>
            </span>
          )}
          {profile.license_exclusive_price_usd && (
            <span className="text-[9px] font-mono text-[#6a5d4a]">
              · Excl. ${profile.license_exclusive_price_usd}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function StoreEditorPage() {
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [featured, setFeatured] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['hero', 'social', 'playlists', 'track-controls']),
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  const heroFileRef = useRef<HTMLInputElement>(null);

  // Drag state for playlist reorder
  const dragIdx = useRef<number | null>(null);

  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const set = useCallback(
    (field: keyof ProfileForm) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [field]: e.target.value })),
    [],
  );

  /* ── Load ── */
  useEffect(() => {
    (async () => {
      try {
        const [profileRes, playlistRes] = await Promise.all([
          fetch('/api/profile'),
          fetch('/api/playlists'),
        ]);
        const [pd, pld] = await Promise.all([profileRes.json(), playlistRes.json()]);
        const p = pd.profile ?? {};
        setForm({
          display_name: p.display_name ?? '',
          bio: p.bio ?? '',
          credits: p.credits ?? '',
          hero_image_url: p.hero_image_url ?? '',
          accent_color: p.accent_color ?? '#D4BFA0',
          font_style: p.font_style ?? 'default',
          instagram_handle: p.instagram_handle ?? '',
          twitter_handle: p.twitter_handle ?? '',
          spotify_url: p.spotify_url ?? '',
          soundcloud_url: p.soundcloud_url ?? '',
          website_url: p.website_url ?? '',
          contact_email: p.contact_email ?? '',
          license_lease_price_usd: p.license_lease_price_usd != null ? String(p.license_lease_price_usd) : '',
          license_exclusive_price_usd: p.license_exclusive_price_usd != null ? String(p.license_exclusive_price_usd) : '',
          license_notes: p.license_notes ?? '',
          store_enabled: p.store_enabled !== false,
        });

        const allPlaylists: PlaylistRow[] = pld.playlists ?? [];
        setPlaylists(allPlaylists);

        // Build featured list: playlists with store_featured=true, sorted by store_order
        const feat = allPlaylists
          .filter((pl) => pl.store_featured)
          .sort((a, b) => (a.store_order ?? 999) - (b.store_order ?? 999));
        setFeatured(feat);
      } catch {
        toast.error('Failed to load store settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Hero image upload ── */
  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeroUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm((f) => ({ ...f, hero_image_url: data.url }));
      toast.success('Hero image uploaded');
    } catch (err: any) {
      toast.error('Upload failed', err.message);
    } finally {
      setHeroUploading(false);
      if (heroFileRef.current) heroFileRef.current.value = '';
    }
  };

  /* ── Featured playlist helpers ── */
  const addToFeatured = (pl: PlaylistRow) => {
    if (featured.length >= 5) {
      toast.error('Max 5 featured playlists');
      return;
    }
    if (featured.find((f) => f.id === pl.id)) return;
    setFeatured((prev) => [...prev, pl]);
  };

  const removeFromFeatured = (id: string) =>
    setFeatured((prev) => prev.filter((f) => f.id !== id));

  /* HTML5 drag-and-drop for featured list */
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from == null || from === idx) return;
    setFeatured((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(idx, 0, item);
      dragIdx.current = idx;
      return next;
    });
  };
  const handleDragEnd = () => { dragIdx.current = null; };

  /* ── Save ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Profile fields
      const profilePayload = {
        display_name: form.display_name || null,
        bio: form.bio || null,
        credits: form.credits || null,
        hero_image_url: form.hero_image_url || null,
        accent_color: form.accent_color || '#D4BFA0',
        font_style: form.font_style || 'default',
        instagram_handle: form.instagram_handle || null,
        twitter_handle: form.twitter_handle || null,
        spotify_url: form.spotify_url || null,
        soundcloud_url: form.soundcloud_url || null,
        website_url: form.website_url || null,
        contact_email: form.contact_email || null,
        license_lease_price_usd: form.license_lease_price_usd !== '' ? parseFloat(form.license_lease_price_usd) : null,
        license_exclusive_price_usd: form.license_exclusive_price_usd !== '' ? parseFloat(form.license_exclusive_price_usd) : null,
        license_notes: form.license_notes || null,
        store_enabled: form.store_enabled,
      };

      const profileRes = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
      });
      if (!profileRes.ok) {
        const j = await profileRes.json().catch(() => ({}));
        throw new Error(j.error || `Profile save failed (HTTP ${profileRes.status})`);
      }

      // 2. Persist each featured playlist's order + featured flag
      const featuredIds = new Set(featured.map((f) => f.id));
      const patchOps = [
        // Featured in order
        ...featured.map((pl, i) =>
          fetch(`/api/playlists/${pl.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_featured: true, store_order: i }),
          }),
        ),
        // Un-featured (was featured before, no longer in list)
        ...playlists
          .filter((pl) => pl.store_featured && !featuredIds.has(pl.id))
          .map((pl) =>
            fetch(`/api/playlists/${pl.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ store_featured: false, store_order: null }),
            }),
          ),
      ];
      const results = await Promise.allSettled(patchOps);
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.warning('Store saved', `${failed} playlist update(s) failed`);
      } else {
        toast.success('Store updated');
      }

      // Update local playlist state so re-saves are idempotent
      setPlaylists((prev) =>
        prev.map((pl) => ({
          ...pl,
          store_featured: featuredIds.has(pl.id),
          store_order: featured.findIndex((f) => f.id === pl.id),
        })),
      );
    } catch (err: any) {
      toast.error('Save failed', err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ── unfeatured playlists (available to add) ── */
  const unfeatured = playlists.filter((pl) => !featured.find((f) => f.id === pl.id));

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={20} className="animate-spin text-[#4a4338]" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 pt-6 md:pt-10 pb-32">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#a08a6a] mb-1">Dashboard</p>
            <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight text-white leading-none font-heading">
              Store Editor
            </h1>
            <p className="text-[12px] text-[#6a5d4a] mt-1.5">
              Customise your public beatstore — changes go live instantly on save.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-1">
            {/* Mobile preview toggle */}
            <button
              onClick={() => setPreviewOpen((v) => !v)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] text-[#a08a6a] hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              {previewOpen ? <EyeOff size={12} /> : <Eye size={12} />}
              Preview
            </button>
            <a
              href="/store"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] text-[#a08a6a] hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <ExternalLink size={12} />
              View Store
            </a>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#D4BFA0] hover:bg-[#E8D8B8] disabled:opacity-60 text-black text-[12px] font-semibold transition-all"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex gap-6 lg:gap-8 items-start">

          {/* ── Left: editor panels ── */}
          <div className={`flex-1 min-w-0 space-y-3 ${previewOpen ? 'hidden lg:block' : ''}`}>

            {/* ① Hero Section */}
            <Section
              id="hero"
              title="Hero Section"
              icon={<ImageIcon size={15} />}
              open={openSections.has('hero')}
              onToggle={() => toggleSection('hero')}
            >
              {/* Hero image */}
              <Field label="Hero Background Image">
                <div className="flex items-start gap-3">
                  <div
                    className="w-24 h-16 rounded-lg border border-[#1f1a13] overflow-hidden bg-[#0c0a08] shrink-0 cursor-pointer hover:border-[#D4BFA0]/40 transition-colors relative group"
                    onClick={() => heroFileRef.current?.click()}
                  >
                    {form.hero_image_url ? (
                      <img src={form.hero_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#3a3328]">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    {heroUploading ? (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <Loader2 size={14} className="animate-spin text-[#D4BFA0]" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Upload size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  <input
                    ref={heroFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleHeroUpload}
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      type="url"
                      value={form.hero_image_url}
                      onChange={set('hero_image_url')}
                      placeholder="Paste image URL or click thumbnail to upload…"
                      className={inputCls}
                    />
                    <p className="text-[9px] font-mono text-[#3a3328] mt-1">
                      Recommended: 1600×900px JPEG. Used as full-bleed hero background.
                    </p>
                  </div>
                </div>
              </Field>

              {/* Display name */}
              <Field label="Display Name">
                <input
                  type="text"
                  value={form.display_name}
                  onChange={set('display_name')}
                  placeholder="e.g. Uche Beats"
                  maxLength={80}
                  className={inputCls}
                />
              </Field>

              {/* Bio */}
              <Field label={`Bio (${form.bio.length}/280)`}>
                <textarea
                  value={form.bio}
                  onChange={set('bio')}
                  maxLength={280}
                  rows={3}
                  placeholder="Tell artists what you're about…"
                  className={textareaCls}
                />
              </Field>

              {/* Credits */}
              <Field label="Credits Line">
                <input
                  type="text"
                  value={form.credits}
                  onChange={set('credits')}
                  placeholder='e.g. "Produced by Uche"'
                  maxLength={120}
                  className={inputCls}
                />
              </Field>

              {/* Accent color */}
              <Field label="Accent Color">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 bg-[#0c0a08] border border-[#1f1a13] rounded-lg px-3 py-1.5">
                    <input
                      type="color"
                      value={form.accent_color}
                      onChange={set('accent_color')}
                      className="w-6 h-6 rounded cursor-pointer border-none bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={form.accent_color}
                      onChange={set('accent_color')}
                      maxLength={7}
                      placeholder="#D4BFA0"
                      className="w-20 bg-transparent text-[12px] text-[#E8DCC8] focus:outline-none font-mono"
                    />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {ACCENT_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, accent_color: c }))}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                          form.accent_color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
                        }`}
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  {/* Live swatch */}
                  <div
                    className="px-3 py-1 rounded-full text-[10px] font-mono font-bold text-black"
                    style={{ background: form.accent_color }}
                  >
                    Preview
                  </div>
                </div>
              </Field>

              {/* Font style */}
              <Field label="Font Style">
                <div className="flex gap-2">
                  {(['default', 'modern', 'minimal'] as const).map((fs) => (
                    <button
                      key={fs}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, font_style: fs }))}
                      className={`px-4 py-2 rounded-lg text-[11px] font-medium border transition-colors capitalize ${
                        form.font_style === fs
                          ? 'bg-[#2A2418] border-[#8A7A5C]/40 text-[#E8D8B8]'
                          : 'bg-[#0c0a08] border-[#1f1a13] text-[#6a5d4a] hover:text-[#E8DCC8] hover:border-[#2d2620]'
                      }`}
                    >
                      {fs}
                    </button>
                  ))}
                </div>
              </Field>
            </Section>

            {/* ② Social Links */}
            <Section
              id="social"
              title="Social Links"
              icon={<Globe size={15} />}
              open={openSections.has('social')}
              onToggle={() => toggleSection('social')}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Instagram Handle">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5142]">@</span>
                    <input
                      type="text"
                      value={form.instagram_handle}
                      onChange={set('instagram_handle')}
                      placeholder="username"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </Field>
                <Field label="Twitter / 𝕏 Handle">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5142]">@</span>
                    <input
                      type="text"
                      value={form.twitter_handle}
                      onChange={set('twitter_handle')}
                      placeholder="username"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </Field>
                <Field label="Spotify Artist URL">
                  <input
                    type="url"
                    value={form.spotify_url}
                    onChange={set('spotify_url')}
                    placeholder="https://open.spotify.com/artist/…"
                    className={inputCls}
                  />
                </Field>
                <Field label="SoundCloud URL">
                  <input
                    type="url"
                    value={form.soundcloud_url}
                    onChange={set('soundcloud_url')}
                    placeholder="https://soundcloud.com/…"
                    className={inputCls}
                  />
                </Field>
                <Field label="Website URL">
                  <input
                    type="url"
                    value={form.website_url}
                    onChange={set('website_url')}
                    placeholder="https://…"
                    className={inputCls}
                  />
                </Field>
                <Field label="Contact Email">
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={set('contact_email')}
                    placeholder="you@example.com"
                    className={inputCls}
                  />
                </Field>
              </div>
            </Section>

            {/* ③ Featured Playlists */}
            <Section
              id="playlists"
              title="Featured Playlists"
              icon={<ListMusic size={15} />}
              open={openSections.has('playlists')}
              onToggle={() => toggleSection('playlists')}
            >
              <p className="text-[11px] text-[#5a5142]">
                Up to 5 playlists shown in your store hero. Drag to reorder.
              </p>

              {/* Featured list (drag-sortable) */}
              {featured.length > 0 ? (
                <div className="space-y-1">
                  {featured.map((pl, idx) => (
                    <div
                      key={pl.id}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0c0a08] border border-[#1f1a13] cursor-grab active:cursor-grabbing hover:border-[#2d2620] transition-colors group"
                    >
                      <GripVertical size={13} className="text-[#3a3328] group-hover:text-[#5a5142] shrink-0" />
                      <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#1a160f] border border-[#2d2620] shrink-0">
                        {pl.cover_url
                          ? <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><ListMusic size={12} className="text-[#3a3328]" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#E8DCC8] truncate">{pl.name}</p>
                        <p className="text-[10px] font-mono text-[#5a5142]">{pl.track_count} track{pl.track_count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="text-[8px] font-mono uppercase tracking-wider text-[#6DC6A4] bg-[#6DC6A4]/10 border border-[#6DC6A4]/20 px-1.5 py-0.5 rounded shrink-0">
                        Featured
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromFeatured(pl.id)}
                        className="w-6 h-6 rounded-full bg-white/[0.04] border border-[#1f1a13] flex items-center justify-center text-[#5a5142] hover:text-red-400 hover:border-red-900/40 transition-colors shrink-0"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#1f1a13] py-8 text-center text-[#5a5142] text-[12px]">
                  No featured playlists yet. Add one below.
                </div>
              )}

              {/* Available playlists to add */}
              {unfeatured.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[#3a3328] mb-2">
                    Add to featured {featured.length}/5
                  </p>
                  <div className="space-y-1">
                    {unfeatured.map((pl) => (
                      <div
                        key={pl.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#0a0907] border border-[#1a160f] hover:border-[#2d2620] transition-colors"
                      >
                        <div className="w-8 h-8 rounded-md overflow-hidden bg-[#1a160f] border border-[#2d2620] shrink-0">
                          {pl.cover_url
                            ? <img src={pl.cover_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><ListMusic size={10} className="text-[#3a3328]" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-[#a08a6a] truncate">{pl.name}</p>
                          <p className="text-[9px] font-mono text-[#3a3328]">{pl.track_count} tracks</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addToFeatured(pl)}
                          disabled={featured.length >= 5}
                          className="w-6 h-6 rounded-full bg-white/[0.04] border border-[#1f1a13] flex items-center justify-center text-[#5a5142] hover:text-[#6DC6A4] hover:border-[#6DC6A4]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {playlists.length === 0 && (
                <p className="text-[11px] text-[#3a3328]">
                  No playlists yet — create some in{' '}
                  <a href="/playlists" className="text-[#a08a6a] underline underline-offset-2 hover:text-[#D4BFA0] transition-colors">
                    Playlists
                  </a>.
                </p>
              )}
            </Section>

            {/* ④ Track Listing Controls */}
            <Section
              id="track-controls"
              title="Track Listing Controls"
              icon={<DollarSign size={15} />}
              open={openSections.has('track-controls')}
              onToggle={() => toggleSection('track-controls')}
            >
              {/* Store enabled toggle */}
              <div className="flex items-center justify-between py-3 border-b border-[#1f1a13]">
                <div>
                  <p className="text-[12px] font-medium text-[#E8DCC8]">Store Visible</p>
                  <p className="text-[10px] font-mono text-[#5a5142] mt-0.5">
                    When off, your /store page shows an "under construction" state.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, store_enabled: !f.store_enabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ml-4 ${
                    form.store_enabled ? 'bg-[#6DC6A4]' : 'bg-[#1f1a13]'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form.store_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Default license prices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Default Lease Price (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5142]">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.license_lease_price_usd}
                      onChange={set('license_lease_price_usd')}
                      placeholder="e.g. 29.99"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </Field>
                <Field label="Default Exclusive Price (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-[#5a5142]">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.license_exclusive_price_usd}
                      onChange={set('license_exclusive_price_usd')}
                      placeholder="e.g. 299.99"
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </Field>
              </div>

              {/* License notes */}
              <Field label="License Notes">
                <textarea
                  value={form.license_notes}
                  onChange={set('license_notes')}
                  rows={3}
                  placeholder="Shown to buyers on the checkout page — usage terms, credit requirements, etc."
                  className={textareaCls}
                />
              </Field>
            </Section>

            {/* Mobile save shortcut */}
            <div className="pt-4 lg:hidden flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#D4BFA0] hover:bg-[#E8D8B8] disabled:opacity-60 text-black text-[12px] font-semibold transition-all"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'Saving…' : 'Save Store'}
              </button>
            </div>
          </div>

          {/* ── Right: live preview ── */}
          <div className={`w-full lg:w-[380px] xl:w-[420px] shrink-0 ${previewOpen ? '' : 'hidden lg:block'}`}>
            <div className="sticky top-20">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-mono uppercase tracking-wider text-[#5a5142]">Live Preview</p>
                <a
                  href="/store"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-mono text-[#6a5d4a] hover:text-[#a08a6a] flex items-center gap-1 transition-colors"
                >
                  open store <ExternalLink size={9} />
                </a>
              </div>
              <StorePreview
                profile={form}
                featuredPlaylists={featured}
              />
              {!form.store_enabled && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/30 text-amber-500 text-[10px] font-mono">
                  <EyeOff size={11} /> Store is currently hidden from visitors
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
