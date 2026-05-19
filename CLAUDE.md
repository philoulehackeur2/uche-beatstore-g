# CLAUDE.md

Working notes for any LLM agent (Claude, etc.) editing this repo. Keep tight — only what's non-obvious. For canonical product spec, see `AGENTS.md`.

@AGENTS.md

---

## What this is

**U2C Beatstore** (project name internally still `antigravity`) — a Next.js 16 producer/beatstore app for one user (Uche). Library, projects, playlists, CRM, calendar, share links, in-browser studio, offline player, Stripe checkout. Deployed on Vercel at `https://uche-beatstore-g.vercel.app`.

## Stack

- **Next.js 16** (App Router, Turbopack, server components by default)
- **TypeScript** strict
- **Tailwind CSS** + custom design tokens (no UI library — hand-rolled components)
- **Supabase** Auth + Postgres (RLS on; service-role used in API routes for owner-gated writes)
- **Cloudflare R2** for audio/cover storage (S3-compatible client)
- **Resend** for transactional email
- **Stripe** for license checkout (Round F)
- **Wavesurfer.js** for waveform rendering; **Essentia.js** for BPM/key analysis
- **React Query** for data fetching; **Zustand** for player + a few global stores
- **Zod** for body validation on all mutation endpoints
- **Vitest** for unit tests
- **lucide-react** icons (no brand icons — inline SVG when needed)

## Layout

```
src/
  app/
    (auth)/          login, invite, reset-password, update-password
    (dashboard)/     library, projects, playlists, studio, contacts,
                     calendar, links, campaigns, settings, offline
    projects/share/[token]/   public share page (DAW canvas + comments)
    share/[token]/            legacy public listener page
    api/             route handlers — one folder per resource
    layout.tsx       root layout, ServiceWorkerRegistrar, Toaster
  components/
    activity/        slide-in feed panel
    crm/             contacts UI, send/nudge modals
    layout/          DashboardLayout (passthrough wrapper)
    nav/             TopBar (only chrome — Sidebar.tsx unused)
    player/          PlayerCanvas (DAW), PlayerBar (persistent), WavePlayer
    projects/        ProjectDetailHeader, ProjectTrackList, ProjectCommentsPanel
    providers/       QueryProvider, ServiceWorkerRegistrar
    share/           ProjectShareModal + variants/ (Client/Producer/Rapper/Friend)
    studio/          StudioWorkstation + sections/
    tracks/          TrackCard, TrackHeatmap, ArrangementOverlay,
                     StemUploader, SimilarTracks, TrackListingEditor
    ui/              Dropdown, BatchActionBar, Toaster (primitives)
    offline/         OfflineToggle, PlaylistOfflineSync
  hooks/             usePlayer, useTracks, useRating, useAuth, useWaveSurfer
  lib/
    audio/           similarity, format, analyze (Essentia)
    auth/            ownership (requireRowOwnership, requireUser)
    contracts/       Zod schemas — every mutation endpoint imports from here
    offline/         IndexedDB audio cache
    stripe/          server-side Stripe client
    supabase/        browser + server clients (using @supabase/ssr)
    types/           Track, Playlist, Contact, BeatSend, etc.
  proxy.ts           Next 16 middleware (token refresh + protected-path redirect)
supabase/migrations/   001…021 — apply in order on the Supabase project
public/
  sw.js              minimal service worker (app shell + offline fallback)
  manifest.json      PWA manifest
```

## Conventions

### API routes
- One folder per resource; `route.ts` exports `GET/POST/PATCH/DELETE` named exports.
- All mutating endpoints validate the body via a Zod schema from `lib/contracts/index.ts`.
- Owner-gated writes use `requireRowOwnership(table, id)` or `requireUser()` from `lib/auth/ownership.ts`. The pattern returns either `{ ok: true, admin, userId }` or `{ ok: false, res }` so the handler short-circuits with `if (!owner.ok) return owner.res`.
- Service-role client (`createServiceClient()`) is used after ownership is verified — RLS is bypassed deliberately.
- Local-store fallback (`isSupabaseConfigured()` check + `lib/local-store.ts`) exists in many routes so the app runs without Supabase for demos. Don't remove this — but new endpoints don't need it unless they're core to the dev flow.
- Errors return `{ error: string }` with appropriate status; use `errorMessage(err)` to format.
- Logging: `createLogger('api.resource.action')` from `lib/log.ts`.

### UI
- Dark warm theme. Tokens:
  - `--bg-page: #0a0907`, `--bg-card: #14110d`, `--bg-hover: #1a160f`
  - `--accent: #D4BFA0` (warm gold), `--accent-light: #E8D8B8`, `--accent-dim: #8A7A5C`, `--accent-tint: #2A2418`
  - Text: `#E8DCC8` primary, `#a08a6a` secondary, `#6a5d4a` tertiary, `#3a3328` very faint
  - Borders: `#1f1a13` default, `#2d2620` hover, `#16130e` divider
- Type scale: page H1 `text-[40px] font-heading`; section labels `text-[10px] font-mono uppercase tracking-[0.2em] text-[#6a5d4a]`; body `text-[11-13px]`.
- Buttons: pill primary `bg-white text-black`, pill secondary `bg-white/[0.04] border border-white/[0.06]`, danger quiet `text-[#6a5d4a] hover:text-red-400`.
- **Always** import the shared `Dropdown` (`components/ui/Dropdown.tsx`) over native `<select>`. It's portaled; positioning uses viewport coordinates (don't add `window.scrollY` — that bug was fixed in PR #11).
- Bulk actions use the floating `BatchActionBar` (`components/ui/BatchActionBar.tsx`). Selection state is a `Set<string>` at page level; rows get `selectable`/`selected`/`onSelectChange` props.
- Toasts: `toast.success / .error / .warning / .info` from `hooks/useToast.ts`; `confirmToast()` for destructive confirms.

### Database
- Migrations are append-only, numbered `NNN_name.sql`, idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE`).
- Every migration that adds a column ends with `NOTIFY pgrst, 'reload schema';` so PostgREST's cache picks it up immediately.
- RLS: tables have `user_id` and an `owner-or-null` SELECT policy (the null half is legacy/demo content from migration 002).
- Don't create a new table without a migration file — schema drift between dev and prod has bitten us.
- Apply order: run all migrations in numeric order on a fresh Supabase project. On prod, run any new migrations BEFORE merging the PR that depends on them or you'll see "column does not exist" in the schema cache.

### Auth
- Supabase Auth via `@supabase/ssr`. Google OAuth provider configured in the Supabase dashboard.
- Token refresh happens in `src/proxy.ts` (Next 16 renamed middleware → proxy) — it MUST run on `/api/*` so route handlers see fresh cookies.
- Protected paths in `proxy.ts` redirect to `/login?next=…` when no user.
- Public-by-design pages: `/share/*` and `/projects/share/*` (token-gated, no auth required).
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is server-only. Anon key is `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser.

### Players (there are two)
1. **PlayerBar** (`components/player/PlayerBar.tsx`) — persistent bottom bar across the dashboard. Owned by `usePlayer` Zustand store.
2. **PlayerCanvas** (`components/player/PlayerCanvas.tsx`) — DAW-style with regions, zoom, keyboard shortcuts. Mounted on the project-share page in DAW mode. Owns its own Wavesurfer instance; the persistent bar pauses to avoid audio collision.
- `useWaveSurfer` hook is the single ws integration; both surfaces use it.
- Region-pinned comments are persisted with `region_start` / `region_end` (migration 013); waveform renders glowing pin markers on the canvas.

### Share variants
Each share carries a `recipient_kind` (`client` / `producer` / `rapper` / `friend`) that drives which page-variant component renders. All in `components/share/variants/`. Client variant has the license card; producer has stems download; rapper has vocal preview; friend is minimal.

### Stripe (Round F)
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` required env. Stripe client is cached at module scope (`lib/stripe/server.ts`).
- Buy buttons render only when `share.sales_enabled === true` (per-share opt-in toggle).
- Checkout creates one line item per track using per-track `lease_price_usd` / `exclusive_price_usd` (falls back to `creator_profiles.license_*_price_usd`).
- Webhook at `/api/stripe/webhook` — signature-verified, idempotent UPSERT on `license_purchases.stripe_session_id`.

### Cron
- `vercel.json` registers daily crons. Each cron route validates `Authorization: Bearer ${CRON_SECRET}` before doing anything.
- Time-decay followup cron at `/api/cron/nudge-stale`: walks `beat_sends` in `sent` stage, fires Resend at 3/5/10-day milestones, caps at 3 nudges per send.

## Dev commands

```bash
npm install             # install
npm run dev             # next dev (Turbopack on)
npm run build           # production build — runs TypeScript type-check at the end
npm test                # vitest run
npm run lint            # eslint
```

The dev server runs at `http://localhost:3000`. `.env.local` is gitignored — copy from a teammate or the deploy env when bootstrapping.

## Required env vars

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# R2 / storage
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
NEXT_PUBLIC_R2_PUBLIC_URL

# Email
RESEND_API_KEY
RESEND_FROM_EMAIL

# App
NEXT_PUBLIC_APP_URL          # https://uche-beatstore-g.vercel.app in prod

# Stripe (Round F)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# Cron (Round D)
CRON_SECRET                  # any random string; Vercel passes it as Bearer auth

# Optional
MOISES_API_KEY               # stem splitting
NEXT_PUBLIC_AUDD_API_TOKEN
ENABLE_LOCAL_STORE           # 'true' to opt into JSON-file fallback locally
```

## Production deploy notes

Cloudflare R2 CORS policy must include the prod domain:
```json
[{
  "AllowedOrigins": ["https://uche-beatstore-g.vercel.app", "https://*.vercel.app", "http://localhost:3000"],
  "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
  "MaxAgeSeconds": 3600
}]
```
Without this, all audio fetches return 0-byte / CORS errors and the UI shows "waveform unavailable."

Supabase Authentication → URL Configuration:
- **Site URL**: `https://uche-beatstore-g.vercel.app`
- **Redirect URLs**: `https://uche-beatstore-g.vercel.app/auth/callback`, `…/auth/callback?next=/update-password`, `…/**`

Google Cloud Console (OAuth):
- Authorized JavaScript origins: `https://uche-beatstore-g.vercel.app`
- Authorized redirect URI: `https://<supabase-project-ref>.supabase.co/auth/v1/callback` (NOT your own domain — Supabase is the relay)

Stripe Dashboard → Webhooks:
- Endpoint: `https://uche-beatstore-g.vercel.app/api/stripe/webhook`
- Events: `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`

## Common gotchas

- **"Could not find column X in schema cache"** — PostgREST is stale. Run `NOTIFY pgrst, 'reload schema';`, wait ~10s, retry.
- **`window.scrollY` in fixed-positioned portals** — don't. Use bounding-rect coords directly. See Dropdown fix in PR #11.
- **Branching off `main` while PRs are open** — branches don't get other PRs' changes. If new code depends on an unmerged PR, base off that PR's branch instead.
- **Don't reach for Radix / Headless UI** — the project uses hand-rolled primitives by deliberate choice. Match the existing style.
- **Audio caching is split** — IndexedDB owns blobs (`lib/offline/audio-cache.ts`), the service worker owns app shell only. Don't merge them.
- **Two share routes** — `/share/[token]` is the legacy listener, `/projects/share/[token]` is the modern variant-driven one. New work goes in the latter.
- **Type errors at build** — `next build` runs `tsc --noEmit` at the end. If `next dev` works but `next build` fails, check imports (lucide-react names change; tree-shake forgives in dev only).

## When adding a feature

1. Plan the migration first if it touches data. Add `NOTIFY pgrst, 'reload schema';` at the bottom.
2. Add/extend the Zod schema in `lib/contracts/index.ts`.
3. Write the route handler — owner-gated, Zod-validated, logged.
4. Build the UI component using existing tokens. Don't introduce new colors.
5. Wire it into the page. Use `BatchActionBar` if bulk; `Dropdown` over `<select>`; `toast` for feedback.
6. Update the relevant TypeScript type in `lib/types/index.ts`.
7. Run `npm run build` AND `npm test` before opening the PR. Both must pass.
8. PR description: Summary, Why, Test plan, Required prod config (env vars, migrations, dashboard settings).

## When fixing a bug

1. Reproduce locally if possible. If prod-only, ask for the exact URL + console errors + network tab response.
2. Check the most-recent migration list — schema drift between dev and prod is a frequent source of "works on my machine."
3. Check `.env.local` vs Vercel env — `NEXT_PUBLIC_APP_URL` is the usual suspect for misrouted redirects.
4. Look at `src/proxy.ts` for any auth-redirect surprises.
5. R2 CORS for any "waveform unavailable" / silent audio failure.
