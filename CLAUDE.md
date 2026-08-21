# CLAUDE.md

Working notes for LLM agents. Product spec lives in AGENTS.md.

**Before a UI pass** read `docs/design-direction.md` (binding visual spec) — the colour section below summarises it, but the doc wins.
**Before a schema change** read `supabase/MIGRATIONS.md` (applied-status ledger + numbering).
**Before a large pass** skim the tail of `docs/codex-execution-log.md` — it records what was just changed and why.

@AGENTS.md
@.claude/README.md

## Claude agent setup

Project-specific Claude orchestration and specialist guidance live in `.claude/agents/` and `.claude/skills/`.
Default to `orchestrator` for autonomous routing, then let it delegate to `planner`, `app-router`, `ui-system`, `supabase-data`, `commerce-storefront`, and `qa-test` as needed while loading the matching skill files before implementation.


---

**U2C Beatstore** (internal name `antigravity`). Single-producer beatstore: a private dashboard for managing tracks and a public storefront for selling them. Prod: `uche-beatstore-g.vercel.app`.

## Stack
Next.js 16 (App Router, Turbopack) · TS strict · Tailwind · Supabase (Auth + Postgres + RLS) · Cloudflare R2 · Resend · Stripe (embedded checkout) · Wavesurfer · Essentia · React Query · Zustand · Zod · Vitest (unit) + Playwright (e2e) · Sentry · lucide-react · GSAP (portfolio view only). No UI library — primitives are hand-rolled.

## Layout
```
src/app/
  page.tsx                   redirects to /library
  (auth)/                    login, invite/[token], reset-password, update-password
  (dashboard)/               library, projects, playlists, studio, contacts,
                             calendar, links, campaigns, settings(+/licenses),
                             offline, store-editor, cover-art, sales, analytics,
                             profile
  auth/callback/             OAuth callback
  embed/[id]/                framable distribution widget (CSP frame-ancestors *)
  dev/design-system/         token + component gallery (dev surface)
  store/                     PUBLIC storefront
    page.tsx                 grid + list + sidebar facets
    [id]/                    track detail (+ /share)
    type/[slug]/             browse by track type
    checkout/                cart-mode + project-mode Stripe embedded
    download/                post-purchase delivery
    orders/                  order lookup by email
    account/                 buyer sign-in; /me persistent account; /[token] legacy 24h link
    playlists/[id]/          public playlist
    producer/[slug]/         producer profile page
    projects/[id]/           project bundle detail
    projects/access/[token]/ post-purchase project delivery
    privacy/                 privacy + erasure
  projects/share/[token]/    public project share (variant-driven)
  share/[token]/             legacy track share
  api/                       one folder per resource (see "API map" below)
src/components/{nav,layout,player,projects,tracks,share,crm,studio,settings,
                activity,ui,offline,store,library,events,lyrics,system,
                cover-art,calendar,playlists,upload,stems,providers}/
src/hooks/                   useCart, useWishlist, usePlayer, useWaveSurfer,
                             useAuth, useTags, useTagColors, useRating,
                             useTracks, useToast, useRealtimeTable,
                             useOfflineCache, useResolvedAudioSrc,
                             useCommandPalette, useDialogBehavior,
                             useReducedMotion, useLibraryColumns,
                             useBrandArtwork, usePlayerKeyboardShortcuts,
                             useSpectralPeaks, usePreviewPrefetch
src/lib/                     auth/ contracts/ db/ errors.ts log.ts env.ts
                             local-store.ts naming.ts validate.ts slug.ts
                             clipboard.ts utils.ts dnd.ts observability.ts
                             sentry.ts api-error.ts client-cache.ts
                             buyer-session.ts buyer-tokens.ts
                             share-media-token.ts
                             artwork/ (gradient, palette, tag-colors, crop)
                             library/ (triage, columns, track-stats)
                             dashboard/ (action-digest, home-config)
                             store/ (filters, discovery, discount, funnel,
                                     readiness, momentum, public-media, …)
                             ui/ (toast-queue + source-guard tests)
                             theme/ audio/ stems/ storage/ upload/ stripe/
                             supabase/ contacts/ crm/ offline/ fulfillment/
                             security/ privacy/ share/ tags/ types/ actions/
src/proxy.ts                 Next 16 middleware — Supabase token refresh + CSP
supabase/migrations/         001…109, idempotent, ending NOTIFY pgrst, 'reload schema';
supabase/MIGRATIONS.md       applied-status ledger + numbering rules — read it
docs/design-direction.md     "Quiet Luxury" visual spec — binding for UI work
docs/codex-execution-log.md  running change log; read the tail before a big pass
e2e/                         Playwright specs (storefront, project-and-playlist)
public/sw.js                 service worker (app shell only — audio uses IndexedDB)
.github/workflows/ci.yml     tsc → vitest → next build on push + PR
.githooks/pre-commit         opt-in via `git config core.hooksPath .githooks`
```

## Conventions

**API** — folder per resource, `route.ts` exports `GET/POST/PATCH/DELETE`. All mutations Zod-validated via `lib/contracts/`. Owner gating via `requireRowOwnership(table, id)` or `requireUser()` from `lib/auth/ownership.ts`. Service-role client (`createServiceClient()`) only after ownership verified. Errors: `{ error: string }` + `errorMessage(err)`. Logging: `createLogger('api.x.y')`.

**UI** — see "Colour + design tokens" below before writing any styling. Type: H1 40px `font-heading`, labels 10px mono uppercase tracking-[0.2em]. Use `Dropdown` over `<select>`. Bulk = `BatchActionBar` + `Set<string>` selection state. Feedback = `toast.*` / `confirmToast` from `useToast` (queue policy — cap 4, dedupe, hover-pause — lives in `lib/ui/toast-queue.ts`, not in the store setter). Overlays use `useDialogBehavior` (dialogs: full focus trap; menus/popovers: `trapFocus: false`, Escape only). Fonts: Akira Expanded (body), Synkopy (`.font-heading`), Panchang (`.font-mono`) — all `/public/fonts`, no CDN imports.

## Colour + design tokens

**Read this before styling anything. The old `#D4BFA0` burnt-amber palette documented here is GONE and following it has already produced wrong-looking work.**

Source of truth is `src/app/globals.css` (`:root`) plus `docs/design-direction.md`. Never hardcode a hex — reference the CSS variable.

Two layers coexist, deliberately:

- **De Roche primitives** — `--dr-black-950 #0B0B0A` … `--dr-paper-100 #EEE8DD`. Source values. Don't reach for these in components.
- **Semantic aliases** — what components use: `--background-primary/secondary/elevated`, `--surface-primary/secondary/hover/active/selected`, `--text-primary/secondary/tertiary/disabled`, `--border-subtle/default/strong/focus`, `--brand-primary #C4B49C` (+ `-hover`, `-active`), `--success #6FA58A`, `--warning #C88B46`, `--information #71A4B5`, waveform band colours `--wave-low` … `--wave-air`.

Legacy app tokens are now **aliases onto the semantic layer** — `--bg-page` → `--background-primary`, `--bg-card` → `--surface-primary`, `--bg-hover` → `--surface-hover`, `--accent` → `--brand-primary`, `--border` → `--border-default`. They still work; they no longer hold the old hexes.

**The accent trap.** `--accent` (the *token*) is champagne `#C4B49C`. But `docs/design-direction.md` principle 3 says the *interface* accent is **white and its alpha steps**, and it marks STATE (active / playing / selected / focused) — not every button. `lib/theme/colors.ts` (`CHAMPAGNE_ACCENT = '#FFFFFF'`) maps legacy beige values onto white. Both are true at once: champagne governs surfaces and brand chrome, white/alpha governs control state. When in doubt, follow `design-direction.md`.

**Control language** — translucent is the default: rest `bg-white/[0.06]` + `border-white/10`, hover `bg-white/[0.10]` + `border-white/20`, active `bg-white/[0.14]` + `border-white/30`, disabled `opacity-40`. Solid-white fills are a rare single-primary-action exception (floating cart pill, empty-cart CTA, checkout Pay). Icon-only controls carry **no fill at rest** — prominence comes from size and spacing.

**Radii vocabulary:** 8px controls · 12px cards · 20px modals/heroes. Nothing else.

**Other canonical tokens:** `--text-readable #AAA294` (WCAG-AA floor for text a user must actually read — the decorative tertiary fades fail AA), `--text-muted #706B61`, `--error #8d3a2f` / `--error-strong #ff8b73` / `--error-text #ffb7a8`, `--star #FFFFFF`, z-layers `--z-popover 200` / `--z-drawer 220` / `--z-modal 240`, motion `--dur-fast 160ms` / `--dur-med 260ms` / `--ease-spring` / `--ease-decelerate`.

**Alternate theme:** `[data-theme="de-roche-archive"]` is a light inversion of the semantic layer. Anything hardcoded breaks it.

**Generated artwork** — tracks without a cover get a deterministic brand gradient (`lib/artwork/gradient.ts`, seeded by track id — never `Math.random()`, which shimmers on scroll and desyncs library vs storefront). Tag colours in `lib/artwork/tag-colors.ts` (migration 107); per-kind default artwork + producer logo in migrations 108/109.

**DB** — migrations append-only, idempotent (`IF NOT EXISTS`). End each schema change with `NOTIFY pgrst, 'reload schema';`. RLS on every owned table; owner-or-null SELECT pattern. Apply migrations on Supabase BEFORE merging dependent PRs. Highest number on disk = **109**; confirmed-applied baseline = **106** (full clean replay, 2026-08-05) — `107_tag_colors`, `108_brand_logo_and_kind_artwork`, `109_default_artwork` are newer, so check `supabase/MIGRATIONS.md` for current applied status rather than assuming. Number the next new migration **110**. `096/097/098/099` each have two files sharing a number from a past parallel-branch collision — both sides are legitimate and applied; don't renumber them. Always check `git log --all -- supabase/migrations/` before naming, especially from a worktree off a stale base.

**Auth** — Supabase via `@supabase/ssr`, Google OAuth (producer) + magic-link OTP (buyers). Refresh in `src/proxy.ts` (must run on `/api/*`). Public-by-design: `/share/*`, `/projects/share/*`, `/store/**`, `/embed/*`. Service-role key is server-only. Buyer identity is **email**, not a `user_id` — writes go only through `/api/store/me` (RLS blocks direct PostgREST; migration 060).

**CSP** — `src/proxy.ts` builds a strict nonce-based Content-Security-Policy and ships it **Report-Only** (`CSP_ENFORCE = false`); violations POST to `/api/csp-report`. Enforcing it white-screens statically-rendered pages, because Next's build-time inline bootstrap can't take a per-request nonce. Any new external script/frame/connect origin must be added to `buildCsp()` or it will be reported now and broken the day enforcement flips. `'wasm-unsafe-eval'` is there for Essentia/audio-decode; dev-mode HMR trips `'unsafe-eval'` — that's a dev-only false positive, do NOT add it.

**Players** — two: persistent `PlayerBar` (Zustand `usePlayer`) and DAW `PlayerCanvas` (own ws instance, mounted on project-share). Both via `useWaveSurfer`. Region-pinned comments use `region_start/end` (migration 013).

**Share variants** — `recipient_kind ∈ {client, producer, rapper, friend}` drives which `components/share/variants/*` renders.

**Storefront** — `/store` is public-by-design. Tracks listed when `tracks.store_listed = true`; projects featured when `projects.store_featured = true`. Buying:
- **Track licenses** — `BeatCard` / `BandcampRemixCard` (type=remix) / `MusicPortfolio` row → preview drawer → cart (`useCart`) → `/store/checkout` → embedded Stripe (`createEmbeddedCheckoutPage`) → webhook (`purchase_kind: 'track_license'`) → `license_purchases` row + Resend delivery email pointing at `/store/download?session_id=…`.
- **Project bundles** — `/store/projects/[id]` → "Buy bundle" → `/store/checkout?project_id=…` → embedded Stripe (`purchase_kind: 'project'`) → webhook writes `project_access_links` (token + frozen `amount_usd` from `session.amount_total`) → delivery email points at `/store/projects/access/<token>`.
- **Promo codes** — `promo_codes` table; `/api/store/promo` validates; checkout server distributes discount across line items (percent → uniform per-line; flat → proportional split; min unit_amount = $0.01).
- **Filter + sort logic lives in `lib/store/filters.ts`** (`filterAndSortTracks`) — pure function, Vitest-covered. Page useMemo delegates to it. Don't re-inline; the test suite is what catches AI revert wipes.
- **Wishlist** — `useWishlist` (Zustand + localStorage, key `antigravity-wishlist`). Optional `isWishlisted` / `onToggleWishlist` props on `BeatCard` / `BandcampRemixCard` / `MusicPortfolio` rows.
- **Cart** — `useCart` (Zustand + localStorage). `CartDrawer` stays mounted (`open` prop) instead of unmounting on close — preserves email + promo input across navigation.
- **Buyer accounts (opt-in)** — magic-link OTP or Google at `/store/account`; favourites, listening history and playlists keyed on **email**, written only via `/api/store/me` (migration 060). Separate from the legacy 24h `/store/account/[token]` delivery link — no merge step between them.
- **Funnel telemetry** — `/api/store/event` + `/api/store/play` feed `store_events` (migration 097); aggregation logic is pure in `lib/store/funnel.ts`. Social proof ("N sold this week") comes from `lib/store/momentum.ts`.
- **Store readiness** — `lib/store/readiness.ts` splits HARD blockers (not listed, no price — literally unpurchasable) from conversion issues (no cover/tags/metadata). Keep that split; a diagnostic that overstates gets ignored.
- **Exclusive sale race** — the webhook claims exclusivity with an atomic conditional `UPDATE … WHERE exclusive_sold = false … RETURNING` and flags the losing buyer via `license_purchases.needs_refund_review` (migration 106), surfaced on `/sales` with "Mark reviewed" (`POST /api/sales/resolve-refund-review`). **No Stripe refund API call exists anywhere in this repo** — refunding stays a manual producer action in the Stripe dashboard.
- **Exclusive stems-pending flow** — exclusive purchases of tracks without `wav_url` or ready `stems_status` are NOT rejected at checkout (changed from the old gate-the-sale policy). Checkout writes `metadata.stems_pending_track_ids` (CSV of affected track ids); the webhook flips `license_purchases.needs_stems_upload = true` (mig 052) and emails the producer to upload. `/sales` shows an "Awaiting stems" badge on those rows.

**Stripe** — Two checkout surfaces:
- Share-page checkout — `/api/share/[token]/checkout`, buy gated on `share.sales_enabled === true`.
- Store checkout — `/api/store/checkout`, cart-mode and project-mode in one route.

Common: `ui_mode: 'embedded_page'` (server); `stripe.createEmbeddedCheckoutPage({ clientSecret })` (client). Webhook (`/api/stripe/webhook`) signature-verified via `req.text()` (NOT `req.json()`); idempotent on `processed_stripe_events` (event-level) and `license_purchases.stripe_session_id` / `project_access_links.stripe_session_id` (purchase-level). Branches on `metadata.purchase_kind ∈ {track_license, project}`. Health check: `GET /api/stripe/diagnostics`.

**Cron** — `vercel.json` schedule, route validates `Authorization: Bearer ${CRON_SECRET}` before any work. Seven jobs today: `nudge-stale`, `publish-scheduled`, `abandoned-carts`, `announce-drops`, `process-uploads`, `migrate-legacy-audio`, `process-fulfillment-emails`. Routes exist without a schedule too (`backfill-peaks`, `backfill-previews`, `cleanup-stripe-events`, `fulfillment-alerts`, `reconcile-payments`) — adding one to `vercel.json` is a separate, deliberate step. Region is `cdg1`.

## Commands
```bash
npm run dev            # next dev (Turbopack)
npm run build          # next build (includes tsc --noEmit)
npm test               # vitest run
npm run test:scale     # the catalogue-scale perf specs only
npm run lint           # eslint
npm run e2e            # playwright (e2e/), also :headed / :ui
npm run db:migrate     # scripts/apply-migrations.sh — needs SUPABASE_DB_URL
npm run readiness:prod # scripts/ops/production-readiness.mjs
git config core.hooksPath .githooks    # one-time: enable local pre-commit
```

CI: `.github/workflows/ci.yml` runs `tsc --noEmit` → `vitest` → `next build` on push to `main` and on every PR.

## Env vars
**Required prod:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (public derivatives/assets), `R2_PRIVATE_BUCKET_NAME` (masters/WAV/stems), `NEXT_PUBLIC_R2_PUBLIC_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL=https://uche-beatstore-g.vercel.app`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `CRON_SECRET`.

**Optional:** `MOISES_API_KEY` (legacy stems), `DEMUCS_SERVICE_URL` (current stems service), `NEXT_PUBLIC_AUDD_API_TOKEN`, `ENABLE_LOCAL_STORE=true`, `RESEND_WEBHOOK_SECRET` (`whsec_…`; enables `/api/resend/webhook` open/click tracking → `beat_sends.opened_at/link_clicked_at`. Unset = route accepts events without signature verification, dev only), `NEXT_PUBLIC_R2_CDN_URL` (Cloudflare-cached custom domain in front of the R2 bucket, e.g. `https://cdn.uche-beatstore.com`; when set, the bottom player's `SimpleAudioEngine` streams previews from it instead of `r2.dev`. Unset = direct `r2.dev` public URL — still bypasses the `/api/audio` proxy, just not edge-cached. See `lib/audio/cdn.ts`), `SHARE_MEDIA_TOKEN_SECRET` (HMAC secret for signed share preview/peaks grants — falls back to `SUPABASE_SERVICE_ROLE_KEY`, and **throws in production** if neither is set), `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE`, `LOG_LEVEL`, `FFMPEG_BIN`, `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` (optional generation helpers), `SUPABASE_DB_URL` (only for `npm run db:migrate`), `READINESS_BASE_URL`.

**Player audio path** — `tracks.audio_url`, `wav_url`, and stem URLs may be opaque `r2://bucket/key` references. Dashboard playback resolves those through authenticated `/api/audio`; public store playback uses `tracks.preview_url` through `/api/store/preview/[id]`. Never expose or rewrite a private `r2://` reference into public JSON. Public derivatives can still use `NEXT_PUBLIC_R2_CDN_URL`.

## Dashboard config (prod)
- **R2 CORS** must include `https://uche-beatstore-g.vercel.app` for `GET/PUT/POST/HEAD` — else "waveform unavailable."
- Direct multipart upload also requires the private bucket CORS policy to allow `PUT` from the production origin and expose the `ETag` response header.
- **R2 buckets:** `R2_BUCKET_NAME` is public and contains previews/covers/peaks/voice tags. `R2_PRIVATE_BUCKET_NAME` must have no public development URL and contains masters/WAV/stems. Any cloud-backed audio upload fails closed when the private bucket variable is missing; local filesystem fallback is only used when R2 itself is not configured.
- **Supabase Auth URL config:** Site URL = prod domain; Redirect URLs include `/auth/callback` and `/**`.
- **Google OAuth:** authorized redirect URI is the SUPABASE callback (`https://<ref>.supabase.co/auth/v1/callback`), not your domain.
- **Stripe webhook:** `/api/stripe/webhook` subscribed to `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`.

## Gotchas
- **The palette in an old CLAUDE.md is not the palette.** `#D4BFA0` burnt amber was replaced app-wide; an agent styled against it and shipped wrong colours. Read `src/app/globals.css` + `docs/design-direction.md`, and see "Colour + design tokens" above. Never hardcode a hex — `[data-theme="de-roche-archive"]` breaks on anything hardcoded.
- **Three source-text guard tests exist and they are load-bearing** — they catch defect classes `tsc`, ESLint and a green build all miss:
  - `lib/ui/tailwind-classes.test.ts` — malformed opacity modifiers (`ring-white/30/40`, `border-white/`) compile to *nothing*. A scripted colour migration once introduced 167 of them, killing focus rings on store cards and checkout.
  - `lib/ui/reduced-motion.test.ts` — any `animate-pulse` / `animate-bounce` not gated on `useReducedMotion()` (allowlist for genuinely transient loading feedback).
  - `lib/source-hygiene.test.ts` — raw control characters in source. A literal NUL byte makes `grep` treat the file as binary and `git diff` unreviewable.
- **Don't script a styling migration.** One documented incident left 144 dead Tailwind classes, another the 167 malformed modifiers above. Hand-edit, or write a guard test first.
- **CSP is Report-Only, so a violation looks like nothing at all today** — but a new CDN script, iframe, or `connect-src` origin must still be added to `buildCsp()` in `src/proxy.ts`.
- **Public store media must never carry a private URL.** `lib/store/public-media.ts#redactPublicTrackMedia` nulls `preview_url` / `wav_url` and swaps `audio_url` for the public preview derivative (CDN direct when configured, `/api/store/preview/[id]` otherwise). Share pages use short-lived HMAC grants (`lib/share-media-token.ts`, 15-min TTL) — routing public share media through the session-gated `/api/audio` proxy is a bug we've already shipped and fixed.
- **Pure logic goes in `lib/`, not in the component.** This project has silently reverted in-component logic more than once. Established pure modules: `store/filters.ts`, `store/discount.ts`, `store/readiness.ts`, `store/momentum.ts`, `library/triage.ts`, `library/columns.ts`, `dashboard/action-digest.ts`, `ui/toast-queue.ts`, `artwork/gradient.ts`. Extend one rather than inlining a new copy.
- **Triage state is derived, not stored** (`lib/library/triage.ts`) — no status column, so it classifies the whole back catalogue retroactively. Don't "fix" it by adding a column.
- **Overlays need `useDialogBehavior`** — dialogs get the full focus trap, menus/popovers get `trapFocus: false` (trapping a dropdown strands keyboard users). ~25 overlays are already retrofitted; a new one that skips it is inconsistent, not just unpolished.
- `"Could not find column X in schema cache"` → run `NOTIFY pgrst, 'reload schema';`, wait 10s.
- **PostgREST `.or()` interpolation footgun** — commas inside a value break the filter because PostgREST treats them as condition separators. Validate any interpolated id (e.g. `safeSellerId()` in `/api/store/route.ts` for UUIDs) before building the filter string.
- **Stripe SDK renames have bitten us twice.** Server: `ui_mode: 'embedded'` is removed → use `'embedded_page'`; `automatic_payment_methods` is rejected for embedded sessions, drop it. Client: `initEmbeddedCheckout` was removed in `@stripe/stripe-js@9.x` → use `stripe.createEmbeddedCheckoutPage({ clientSecret })`. Use the typed call (no `as any`) so the next rename fails at compile time.
- **The `(dashboard)` group requires auth via `src/proxy.ts`**; `(auth)` and `store/*` do not. Easy to put a new page in the wrong group and either expose private data or 401 a public visitor.
- **`prefers-reduced-motion` matters** — `MusicArtwork`, `ParticleText`, `MusicPortfolio`, the cosmos `.track-masonry` fade, and the vinyl spin all gate animation on it. Respect that pattern in new visual components.
- Don't add `window.scrollY` to fixed-positioned portals. Bounding-rect coords are viewport-relative.
- `npm run dev` is permissive about imports; `npm run build` (and CI) catches them. Always build before PR.
- Two share routes: legacy `/share/[token]`, modern `/projects/share/[token]`. New work in the latter.
- If new code depends on an open PR, branch off that PR — not `main`.
- No Radix/Headless UI — primitives are hand-rolled by choice.
- IndexedDB owns audio blobs; service worker owns app shell. Keep them separate.
- **Worktree contamination** — sub-agents have created `.claude/worktrees/agent-*` that get locked on crash. Cleanup: `git worktree unlock <path>` → `git worktree remove --force <path>` → `git branch -D worktree-<id>`.
- **Migration numbering races** — when two parallel branches both add migrations, both will claim the next number. Check `git log --all -- supabase/migrations/` before naming. We renumbered 040/041 → 046/047 once already.
- **AGENTS.md is the product spec, not a build-order prompt.** Update it when you change the product, not when you change the code.

## Adding a feature
1. **Migration first** (if schema change): `supabase/migrations/NNN_descriptor.sql`, idempotent, ends with `NOTIFY pgrst, 'reload schema';`. Apply on Supabase before merging dependent code.
2. **Zod contract** in `lib/contracts/` for any mutation body.
3. **Route handler** — owner-gated (`requireRowOwnership` / `requireUser`), Zod-validated, `errorMessage(err)` on failure, `createLogger('api.x.y')` for diagnostics.
4. **Pure-logic extract** — when the feature has filter / sort / scoring / pricing logic, write it as a pure function in `lib/` first (`filterAndSortTracks` is the template). Vitest the helper. **Logic inside React components can't be tested in isolation and gets silently reverted** — we've shipped this regression twice.
5. **UI** with existing semantic tokens (no new colours, no hardcoded hex, no new font imports) — check it against `docs/design-direction.md` and the radii/control-language rules above.
6. **Wire on the page**; update `lib/types/` if a public shape changed.
7. **`npm run build && npm test`** locally (the guard tests in `lib/ui/` and `lib/source-hygiene.test.ts` run here and catch what `tsc` can't); `npm run e2e` when a storefront or project/playlist flow changed. Pre-commit hook (if enabled) double-checks staged TS.
8. **PR** with Summary / Why / Test plan / Required prod config / Migrations to apply. CI (`.github/workflows/ci.yml`) will gate the merge.

## API map (high-level, public + dashboard)
Roughly 200 route files — this is the shape, not the inventory. `find src/app/api -name route.ts` is the source of truth.
- **Public storefront** — `/api/store` (catalogue), `/api/store/[id]`, `/api/store/facets`, `/api/store/drops`, `/api/store/momentum`, `/api/store/beat-match`, `/api/store/playlists/[id]`, `/api/store/projects/[id]`, `/api/store/projects/access/[token]{,/download,/peaks}`, `/api/store/projects/access/by-session`, `/api/store/producer/[slug]`, `/api/store/checkout`, `/api/store/promo`, `/api/store/offer{,/[id]}`, `/api/store/contact`, `/api/store/follow`, `/api/store/comments/[trackId]`, `/api/store/delivery`, `/api/store/download-file`, `/api/store/free-download{,s}`, `/api/store/orders{,/resend}`, `/api/store/event` + `/api/store/play` (funnel telemetry).
- **Buyer accounts** — `/api/store/account/request` (magic link), `/api/store/account/me`, `/api/store/account/portal`, `/api/store/account/[token]` (legacy 24h token), `/api/store/me` (sole write path to favourites / history / playlists).
- **Public media** — `/api/store/preview/[id]`, `/api/store/peaks/[id]`, `/api/share/[token]/preview/[trackId]` + `/peaks/[trackId]` (HMAC-signed grants).
- **Public share** — `/api/share/[token]/{route,play,download,checkout,analytics}`, `/api/projects/share/[token]/{route,tracks,comments}`.
- **Producer (auth)** — `/api/tracks` (+ `/[id]/{analyze,announce,arrangement,heatmap,lyrics,peaks,rate,similar,tags,shares,versions,stem-files,stems/upload}`, `/auto-tag`, `/reorder`, `/stats`, `/store-summary`, `/tags/bulk`), `/api/projects`, `/api/playlists`, `/api/smart-playlists`, `/api/contacts` (+ `/tasks`, `/segments`, `/scores`, `/import`, `/tags/bulk`), `/api/beat_sends`, `/api/campaigns`, `/api/calendar`, `/api/events`, `/api/profile{,/voice-tag}`, `/api/licenses`, `/api/track-licenses`, `/api/promo-codes`, `/api/sales` (+ `/deliver-stems`, `/resend`, `/resolve-refund-review`), `/api/analytics`, `/api/links`, `/api/notifications`, `/api/team`, `/api/tags/colors`, `/api/cover/generate`, `/api/upload/*` (+ `/image`, `/status`), `/api/stems/*`, `/api/search`, `/api/activity`, `/api/whoami`, `/api/invite`, `/api/email`, `/api/words`, `/api/privacy/erase`.
- **Webhooks, cron + diagnostics** — `/api/stripe/webhook`, `/api/resend/webhook`, `/api/cron/*` (see Cron above), `/api/stripe/diagnostics`, `/api/audio/diagnostics`, `/api/stems/health`, `/api/health`, `/api/csp-report`.
