# CLAUDE.md

Working notes for LLM agents. Product spec lives in AGENTS.md.

@AGENTS.md
@.claude/README.md

## Claude agent setup

Project-specific Claude orchestration and specialist guidance live in `.claude/agents/` and `.claude/skills/`.
Default to `orchestrator` for autonomous routing, then let it delegate to `planner`, `app-router`, `ui-system`, `supabase-data`, `commerce-storefront`, and `qa-test` as needed while loading the matching skill files before implementation.


---

**U2C Beatstore** (internal name `antigravity`). Single-producer beatstore: a private dashboard for managing tracks and a public storefront for selling them. Prod: `uche-beatstore-g.vercel.app`.

## Stack
Next.js 16 (App Router, Turbopack) · TS strict · Tailwind · Supabase (Auth + Postgres + RLS) · Cloudflare R2 · Resend · Stripe (embedded checkout) · Wavesurfer · Essentia · React Query · Zustand · Zod · Vitest · lucide-react · GSAP (portfolio view only). No UI library — primitives are hand-rolled.

## Layout
```
src/app/
  (auth)/                    login, invite, reset-password, update-password
  (dashboard)/               library, projects, playlists, studio, contacts,
                             calendar, links, campaigns, settings, offline,
                             store-editor, sales, analytics, profile
  auth/callback/             OAuth callback
  store/                     PUBLIC storefront
    page.tsx                 grid + list + sidebar facets
    [id]/                    track detail
    checkout/                cart-mode + project-mode Stripe embedded
    download/                post-purchase delivery
    producer/[slug]/         producer profile page
    projects/[id]/           project bundle detail
    projects/access/[token]/ post-purchase project delivery
  projects/share/[token]/    public project share (variant-driven)
  share/[token]/             legacy track share
  api/                       one folder per resource (see "API map" below)
src/components/{nav,layout,player,projects,tracks,share,crm,studio,
                activity,ui,offline,store,library,events,lyrics,system,
                upload,stems,providers}/
src/hooks/                   useCart, useWishlist, usePlayer, useWaveSurfer,
                             useAuth, useTags, useRating, useTracks,
                             useToast, useRealtimeTable, useOfflineCache,
                             useResolvedAudioSrc, useCommandPalette
src/lib/                     auth/ contracts/ db.ts errors.ts log.ts
                             local-store.ts naming.ts validate.ts env.ts
                             clipboard.ts slug.ts utils.ts dnd.ts
                             store/filters.ts (pure filter+sort helper)
                             cover/ (cover art: geometry, collage, font-embed,
                               document-store, image-generation — pure + Vitest
                               apart from thin IndexedDB/fetch wrappers)
                             audio/ stems/ storage/ upload/ stripe/ supabase/
                             contacts/ offline/ types/ actions/
src/proxy.ts                 Next 16 middleware (token refresh + protected paths)
supabase/migrations/         001…047, idempotent, ending NOTIFY pgrst, 'reload schema';
public/sw.js                 service worker (app shell only — audio uses IndexedDB)
.github/workflows/ci.yml     tsc → vitest → next build on push + PR
.githooks/pre-commit         opt-in via `git config core.hooksPath .githooks`
```

## Conventions

**API** — folder per resource, `route.ts` exports `GET/POST/PATCH/DELETE`. All mutations Zod-validated via `lib/contracts/`. Owner gating via `requireRowOwnership(table, id)` or `requireUser()` from `lib/auth/ownership.ts`. Service-role client (`createServiceClient()`) only after ownership verified. Errors: `{ error: string }` + `errorMessage(err)`. Logging: `createLogger('api.x.y')`.

**UI** — near-black neutral surfaces, silver-on-black text, colour used only to signal.

*What components actually use* (counts are occurrences across `src/**/*.tsx`, so match these, not the CSS variables):

| Role | Use | Count |
|---|---|---|
| Page background | `#090907` | 369 |
| Card / panel | `#0D0D0A` | 152 |
| Text primary | `text-white/80` | 398 |
| Text secondary | `text-white/60` | 504 |
| Text tertiary / labels | `text-white/40` | 1000 |
| Text faint | `text-white/30` | 211 |
| Border default | `border-white/10` | 808 |
| Border hover / emphasis | `border-white/20` | 459 |
| Mint (free, success, positive) | `#6DC6A4` | 235 |
| Tan accent (sparing) | `#c8a47a` | 87 |
| Star gold | `#c8a84b` | 15 |

**Text and borders are white at alpha, not warm hexes.** `globals.css` does define `--bg-page` / `--bg-card` / `--accent` and a `--dr-*` scale, but components overwhelmingly bypass them, so a value copied from the variables lands off-palette against its neighbours. This table previously listed `#0a0907` / `#14110d` / `#D4BFA0` / `#E8DCC8` / `#6a5d4a` / `#1f1a13` — a warm set that survives almost nowhere in the app, and the cover art editor was built against it and came out visibly brown next to everything else. Verify against neighbouring components before trusting any palette written down here. Type: H1 40px `font-heading`, labels 10px mono uppercase tracking-[0.2em]. Use `Dropdown` over `<select>`. Bulk = `BatchActionBar` + `Set<string>` selection state. Feedback = `toast.*` / `confirmToast` from `useToast`. Fonts: Akira Expanded (body), Synkopy (`.font-heading`), Panchang (`.font-mono`) — all `/public/fonts`, no CDN imports.

**DB** — migrations append-only, idempotent (`IF NOT EXISTS`). End each schema change with `NOTIFY pgrst, 'reload schema';`. RLS on every owned table; owner-or-null SELECT pattern. Apply migrations on Supabase BEFORE merging dependent PRs. Latest on disk = **110** (`110_store_layout.sql` — adds `creator_profiles.store_layout jsonb`; NULL means "use the default layout", so it is a no-op until a producer saves one) — this line previously read 106, which was renumbered; check `ls supabase/migrations/` rather than trusting the number written here. When working in a worktree off a stale base, check `git log --all -- supabase/migrations/` before naming.

**Auth** — Supabase via `@supabase/ssr`, Google OAuth. Refresh in `src/proxy.ts` (must run on `/api/*`). Public-by-design: `/share/*`, `/projects/share/*`, `/store/**`. Service-role key is server-only.

**Players** — two: persistent `PlayerBar` (Zustand `usePlayer`) and DAW `PlayerCanvas` (own ws instance, mounted on project-share). Both via `useWaveSurfer`. Region-pinned comments use `region_start/end` (migration 013).

**Cover Art Studio** (`/cover-art`, `components/cover-art/*`) — layer-based artwork editor. `CoverArtStudio.tsx` owns state; `StudioCanvas` handles pointer input; `LayerView` renders a layer; the panels are presentational. Rules that matter:

- **The canvas and the export must agree.** `LayerView` (DOM) and `renderArtworkDocumentSvg` (SVG) draw the same document two different ways, so any new layer property has to be implemented in BOTH. Shared crop maths lives in `imageCropDefaults` / `imageFrameRect` precisely so the two cannot drift. We shipped a canvas that drew every image layer as a grey placeholder while the export drew the real thing; don't recreate that.
- **Exports must embed fonts.** `svgToRasterBlob` rasterises through `new Image()`, and an SVG loaded as an image cannot read the page's `@font-face` rules or fetch `/fonts/*`. Anything leaving the app goes through `embedFontsInSvg` (`lib/cover/font-embed.ts`) or it ships in a fallback system face. Same reason images are inlined as data URIs rather than R2 URLs.
- **Interaction maths is pure and tested.** `lib/cover/geometry.ts` (resize-with-rotation, snapping, group scaling), `lib/cover/collage.ts` (layouts), `lib/cover/waveform.ts` (resampling + bar geometry). Per the "pure-logic extract" rule below — this is exactly the logic that gets silently reverted when it hides inside a component.
- **Persistence is IndexedDB, not localStorage** (`lib/cover/document-store.ts`, DB `antigravity-cover-art`). Image layers carry their bytes inline, so a collage is several megabytes and would blow localStorage's quota at the worst possible moment. Separate DB from `antigravity-offline` so version upgrades can't collide.
- **Undo history is one atomic state** (`{ doc, past, future }`). It was three `useState`s with nested setState calls inside each other's updaters; React may run an updater twice, the stacks desynced, and redo silently did nothing.
- **Waveforms downsample by bucket peak, never by point sampling.** `lib/cover/waveform.ts`. Interpolating between two source samples lands between transients as often as on them, so a kick disappears and the waveform reads as soft noise. There are also no frequency "lanes" — the old builder derived them from `index % 6` / `index % 3`, which is arithmetic on the bar's position and carries no audio information at all; it then painted them in two fixed blues that fought the warm palette. One colour, from the artwork's own palette.
- **The studio uses the app's design tokens, not a parallel palette.** The original lab shipped its own near-miss set — `#EEE8DD` text, `#10100D` panels, `#0D0D0A` fields, `#C7B89D` accent, translucent `#EBE1CC1A` borders, and blue/teal waveform colours — which read as a different, browner product sitting inside the app. Everything now resolves to the documented tokens (`#0a0907`, `#14110d`, `#E8DCC8`, `#a08a6a`, `#6a5d4a`, `#D4BFA0`, borders `#1f1a13` / `#2d2620`). `defaultArtworkPalette` matches them too. Only the four art *directions* deliberately diverge, because differing is what a direction is for.
- **Documents saved before a palette change keep their old palette**, since the palette is stored on the document. That is correct — it is the producer's artwork — but it means a stale saved cover is not evidence the tokens are wrong.
- **The studio's height is `calc(100vh-10.5rem)`, derived from `(dashboard)/layout.tsx`'s `main.pt-14.pb-28`.** A guessed value was 68px too tall, so the page scrolled instead of the panels and the bottom of the inspector was unreachable. Change both together.
- **The studio panels must collapse below ~1180px.** The rail plus both panels are 600px of fixed chrome; as plain grid columns they squeezed the canvas to a sliver and overflowed the container. Below that width they leave the grid and float over the canvas instead.
- **Window pointer listeners attach unconditionally.** Gating the listener effect on a ref means gestures that change no state (resize, rotate) never get listeners at all, because setting a ref doesn't schedule a render.

**Cover Art effects + type** — two shared modules the studio's two renderers both read:

- **`lib/cover/effects.ts` emits ONE `<filter>` def that both surfaces use.** The canvas inlines it in a hidden `<svg><defs>` and references it with CSS `filter: url(#fx-canvas-ID)`; the exporter inlines the same def and uses `filter="url(#fx-ID)"`. There is deliberately no parallel CSS-filter string to drift. The only legitimate difference is the `scale` argument — `zoom` on the canvas, `1` in the export — because a blur is in document units. `baseFrequency` (grain) DIVIDES by scale where every other length multiplies; getting that backwards makes grain coarsen as you zoom and the export come back finer than what was approved.
- **The filter nests INSIDE the transform, and vignette sits outside the filter.** Filter+clip-path on one element clips the drop shadow away with the crop. Filter outside the transform gives document-space shadows in the export and layer-space on the canvas — two pictures of one layer. Vignette is painted, not filtered, so a blur cannot smear it.
- **`lib/cover/fonts.ts` is the single type registry.** Font handling used to live in four places that disagreed: the exporter hardcoded `font-weight:700` while the canvas set none, `globals.css` maps Synkopy's 700 onto the *Flipside* cut, and only one Panchang weight was ever embedded. `nearestFace` snaps a requested weight to one the family actually ships **before** either renderer sees it, so neither is asked to synthesise. All 11 shipped `.otf` files are reachable; La Bruja is now registered in `globals.css`.
- **Artboard resizing scales effects too** (`lib/cover/artboard.ts`). Blur/shadow/glow/chromatic are document units — a 24-unit blur is a haze at 3000px and a smear at 1080px.
- **Export settings resolve honestly** (`lib/cover/export-settings.ts`). A transparent JPEG gives you a BLACK plate, so `resolveExport` drops the request and reports it in `notes` for the UI to surface rather than silently doing something else.

**Cover Art groups + rulers**:

- **Nesting is a `parentId` pointer on the flat `layers` array, not a `children` tree.** Every existing consumer that walks `document.layers` still sees every layer. Children keep ABSOLUTE document coordinates — a group is a wrapper for opacity/blend/organisation, NOT a coordinate space, which is the only reason `lib/cover/geometry.ts` needs no knowledge of groups.
- **`expandToLeaves` is the load-bearing function.** Move, resize, align and snapping all run on it, so a selected group contributes no rect of its own and its stored rect never has to be kept in sync. `beginMove` also keeps a group selected when the press lands on one of its descendants — without that, grabbing a group's contents replaced the selection with the child under the cursor and a group could never be dragged.
- **Both renderers recurse.** A group emits a wrapper with opacity+blend and NO transform (children are absolute; transforming the wrapper would move them twice). On the canvas the wrapper is `pointer-events:none` and every leaf sets `auto`, or a group blankets the artboard and swallows clicks.
- **Deleting a group deletes its descendants**, and `moveLayer`/`reorderLayer` operate within a sibling set — both merge back into the full array. Returning just the sibling set drops every other layer from the document. `descendantIds`/`isDescendantOf`/`layerRows` all carry cycle guards.
- **Guides live on the document but the exporter never reads them** — that is enforced by a test asserting the SVG is byte-identical with and without guides. Collapsing a group goes through `setDocumentQuietly`, since folding a panel is not an undo step.
- **A guide drag is computed from a snapshot taken at drag start.** Reading the live document mid-drag is a race: two pointermoves can fire before React flushes, so the second reads the pre-move list, fails to find the guide at its updated origin, and leaves a duplicate at every position the pointer passed.

**Cover Art text-on-path** (`lib/cover/text-path.ts`) — `<textPath>` has no DOM equivalent, so the canvas renders curved text as an inline `<svg>` in document units (the same trick the waveform layers use) and both surfaces run the IDENTICAL `d` string through an identical `<textPath>`. A test asserts the exported `d` equals `textPathD(...)` for every shape; that equality is the whole "no approximation to drift" claim. A path is a single run — `flattenForPath` joins lines with spaces rather than silently dropping all but the first, and the inspector says so when the text contains a break. `startOffset` and `text-anchor` must agree or the string runs off the end of the path.

**Store Editor — the storefront layout document** (`lib/store-editor/layout.ts`, `components/store-editor/*`, migration 110):

- **`/store` renders its sections from the layout.** `defaultStoreLayout()` reproduces the page's original hardcoded order exactly, and `normalizeLayout` turns null/older/malformed documents into it — so a producer who never opens the builder sees no change. There is a test asserting that order; if it drifts, every un-arranged storefront silently rearranges.
- **Overrides are sparse and desktop writes the base.** `resolveSection` layers `defaults → base → breakpoint`. Editing on desktop writes `base` so it flows down; tablet/mobile write only the keys they change. Replacing the object wholesale resets everything the breakpoint did not name.
- **`sectionCapabilities` keeps controls honest.** The storefront components own their own padding and responsive grids, so spacing/columns are offered only for sections this feature actually lays out. A control the preview obeys and the live page ignores is worse than no control.
- **Visibility is CSS, not a JS branch** (`visibilityClasses`) — `/store` is SSR'd and edge-cached, so branching would bake one device's layout into the cached HTML. `useStoreBreakpoint` exists only for the hero, where the two variants are different *components* (the particle canvas must not run on a phone at all).
- **`catalog` and `trust` are pinned** (`isPinnedSection`). The catalogue owns the sticky filter toolbar directly above it. The document itself refuses to move them rather than accepting a drag the storefront would ignore.
- **Free-form blocks are percentages of their section frame** (`lib/store-editor/canvas-blocks.ts`), never pixels — that is what stops a hand-composed panel hanging off a phone, and it means the drag maths needs no zoom argument: a scaled element's `getBoundingClientRect()` is already in screen pixels, so a ratio against it is correct at any zoom. Clamping is against the block's own size, so a wide block stops when its RIGHT edge reaches the frame. `SectionRenderer` takes editing as an OPTIONAL `editBlocks` prop the storefront never passes, so the capability is absent on the live page rather than switched off.
- **Version history is IndexedDB, per-browser** (`lib/store-editor/history.ts`, DB `antigravity-store-editor`). Snapshots are taken AFTER the server accepts a save, so history never offers a version that was never stored, and `shouldSnapshot` declines both unchanged layouts and anything within `SNAPSHOT_MIN_GAP_MS` — without that, autosave during a slider drag fills the history with near-identical entries and evicts everything worth restoring. `sameLayout` ignores `updatedAt` deliberately, since it changes on every keystroke. Restoring goes through `commit`, so it lands on the undo stack rather than needing a confirmation dialog. The panel degrades to a notice when IndexedDB is denied (private browsing) rather than taking the builder with it.
- **`store_layout` is fetched in its own query** in `/api/store`. Folding it into the existing newer-columns select would fail that whole select — and silently drop accent colour, socials and voice tags from every storefront — on any deploy where migration 110 has not been applied.

**Share variants** — `recipient_kind ∈ {client, producer, rapper, friend}` drives which `components/share/variants/*` renders.

**Storefront** — `/store` is public-by-design. Tracks listed when `tracks.store_listed = true`; projects featured when `projects.store_featured = true`. Buying:
- **Track licenses** — `BeatCard` / `BandcampRemixCard` (type=remix) / `MusicPortfolio` row → preview drawer → cart (`useCart`) → `/store/checkout` → embedded Stripe (`createEmbeddedCheckoutPage`) → webhook (`purchase_kind: 'track_license'`) → `license_purchases` row + Resend delivery email pointing at `/store/download?session_id=…`.
- **Project bundles** — `/store/projects/[id]` → "Buy bundle" → `/store/checkout?project_id=…` → embedded Stripe (`purchase_kind: 'project'`) → webhook writes `project_access_links` (token + frozen `amount_usd` from `session.amount_total`) → delivery email points at `/store/projects/access/<token>`.
- **Promo codes** — `promo_codes` table; `/api/store/promo` validates; checkout server distributes discount across line items (percent → uniform per-line; flat → proportional split; min unit_amount = $0.01).
- **Filter + sort logic lives in `lib/store/filters.ts`** (`filterAndSortTracks`) — pure function, Vitest-covered. Page useMemo delegates to it. Don't re-inline; the test suite is what catches AI revert wipes.
- **Wishlist** — `useWishlist` (Zustand + localStorage, key `antigravity-wishlist`). Optional `isWishlisted` / `onToggleWishlist` props on `BeatCard` / `BandcampRemixCard` / `MusicPortfolio` rows.
- **Cart** — `useCart` (Zustand + localStorage). `CartDrawer` stays mounted (`open` prop) instead of unmounting on close — preserves email + promo input across navigation.
- **Exclusive stems-pending flow** — exclusive purchases of tracks without `wav_url` or ready `stems_status` are NOT rejected at checkout (changed from the old gate-the-sale policy). Checkout writes `metadata.stems_pending_track_ids` (CSV of affected track ids); the webhook flips `license_purchases.needs_stems_upload = true` (mig 052) and emails the producer to upload. `/sales` shows an "Awaiting stems" badge on those rows.

**Stripe** — Two checkout surfaces:
- Share-page checkout — `/api/share/[token]/checkout`, buy gated on `share.sales_enabled === true`.
- Store checkout — `/api/store/checkout`, cart-mode and project-mode in one route.

Common: `ui_mode: 'embedded_page'` (server); `stripe.createEmbeddedCheckoutPage({ clientSecret })` (client). Webhook (`/api/stripe/webhook`) signature-verified via `req.text()` (NOT `req.json()`); idempotent on `processed_stripe_events` (event-level) and `license_purchases.stripe_session_id` / `project_access_links.stripe_session_id` (purchase-level). Branches on `metadata.purchase_kind ∈ {track_license, project}`. Health check: `GET /api/stripe/diagnostics`.

**Cron** — `vercel.json` schedule, route validates `Authorization: Bearer ${CRON_SECRET}` before any work.

## Commands
```bash
npm run dev          # next dev (Turbopack)
npm run build        # next build (includes tsc --noEmit)
npm test             # vitest run
npm run lint         # eslint
git config core.hooksPath .githooks    # one-time: enable local pre-commit
```

CI: `.github/workflows/ci.yml` runs `tsc --noEmit` → `vitest` → `next build` on push to `main` and on every PR.

## Env vars
**Required prod:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (public derivatives/assets), `R2_PRIVATE_BUCKET_NAME` (masters/WAV/stems), `NEXT_PUBLIC_R2_PUBLIC_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL=https://uche-beatstore-g.vercel.app`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `CRON_SECRET`.

**Optional:** `OPENAI_API_KEY` / `GEMINI_API_KEY` (either one enables AI image generation in the Cover Art Studio; read server-side only — `/api/cover/generate` reports which are configured and never accepts a key from the browser), `MOISES_API_KEY` (legacy stems), `DEMUCS_SERVICE_URL` (current stems service), `NEXT_PUBLIC_AUDD_API_TOKEN`, `ENABLE_LOCAL_STORE=true`, `RESEND_WEBHOOK_SECRET` (`whsec_…`; enables `/api/resend/webhook` open/click tracking → `beat_sends.opened_at/link_clicked_at`. Unset = route accepts events without signature verification, dev only), `NEXT_PUBLIC_R2_CDN_URL` (Cloudflare-cached custom domain in front of the R2 bucket, e.g. `https://cdn.uche-beatstore.com`; when set, the bottom player's `SimpleAudioEngine` streams previews from it instead of `r2.dev`. Unset = direct `r2.dev` public URL — still bypasses the `/api/audio` proxy, just not edge-cached. See `lib/audio/cdn.ts`).

**Player audio path** — `tracks.audio_url`, `wav_url`, and stem URLs may be opaque `r2://bucket/key` references. Dashboard playback resolves those through authenticated `/api/audio`; public store playback uses `tracks.preview_url` through `/api/store/preview/[id]`. Never expose or rewrite a private `r2://` reference into public JSON. Public derivatives can still use `NEXT_PUBLIC_R2_CDN_URL`.

## Dashboard config (prod)
- **R2 CORS** must include `https://uche-beatstore-g.vercel.app` for `GET/PUT/POST/HEAD` — else "waveform unavailable."
- Direct multipart upload also requires the private bucket CORS policy to allow `PUT` from the production origin and expose the `ETag` response header.
- **R2 buckets:** `R2_BUCKET_NAME` is public and contains previews/covers/peaks/voice tags. `R2_PRIVATE_BUCKET_NAME` must have no public development URL and contains masters/WAV/stems. Any cloud-backed audio upload fails closed when the private bucket variable is missing; local filesystem fallback is only used when R2 itself is not configured.
- **Supabase Auth URL config:** Site URL = prod domain; Redirect URLs include `/auth/callback` and `/**`.
- **Google OAuth:** authorized redirect URI is the SUPABASE callback (`https://<ref>.supabase.co/auth/v1/callback`), not your domain.
- **Stripe webhook:** `/api/stripe/webhook` subscribed to `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`.

## Gotchas
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
- **SVG-as-image is a sandbox.** Anything rasterised via `new Image()` — cover art export, share cards — cannot fetch *any* external resource: no fonts, no stylesheets, no cross-origin images. Inline it as a data URI or it will silently render wrong while the on-screen version looks right.
- **Panchang has no glyph for the shift (U+21E7) or option (U+2325) symbols.** They render as tofu. Spell out "Shift" and "Alt" in keyboard hints; the command symbol is fine.
- **`coverArtExportPresets` is a Record keyed by id, not an array.** `Object.values()` it before mapping.
- **A centred overflowing scroll container clips its own start edge.** `place-items: center` makes the top/left of a zoomed-in artboard unreachable; use `place-items: safe center`.
- **AGENTS.md is the product spec, not a build-order prompt.** Update it when you change the product, not when you change the code.

## Adding a feature
1. **Migration first** (if schema change): `supabase/migrations/NNN_descriptor.sql`, idempotent, ends with `NOTIFY pgrst, 'reload schema';`. Apply on Supabase before merging dependent code.
2. **Zod contract** in `lib/contracts/` for any mutation body.
3. **Route handler** — owner-gated (`requireRowOwnership` / `requireUser`), Zod-validated, `errorMessage(err)` on failure, `createLogger('api.x.y')` for diagnostics.
4. **Pure-logic extract** — when the feature has filter / sort / scoring / pricing logic, write it as a pure function in `lib/` first (`filterAndSortTracks` is the template). Vitest the helper. **Logic inside React components can't be tested in isolation and gets silently reverted** — we've shipped this regression twice.
5. **UI** with existing tokens (no new colors, no new font imports).
6. **Wire on the page**; update `lib/types/` if a public shape changed.
7. **`npm run build && npm test`** locally; pre-commit hook (if enabled) double-checks staged TS.
8. **PR** with Summary / Why / Test plan / Required prod config / Migrations to apply. CI (`.github/workflows/ci.yml`) will gate the merge.

## API map (high-level, public + dashboard)
- **Public storefront** — `/api/store` (catalogue), `/api/store/[id]` (track detail w/ licenses), `/api/store/projects/[id]` (project bundle), `/api/store/projects/access/[token]` (post-purchase delivery), `/api/store/producer/[slug]` (producer page), `/api/store/checkout`, `/api/store/promo`, `/api/store/contact`, `/api/store/delivery`, `/api/store/download-file`, `/api/store/free-download`.
- **Public share** — `/api/share/[token]/{route,play,download,checkout,analytics}`, `/api/projects/share/[token]/{route,tracks,comments}`.
- **Producer (auth)** — `/api/tracks`, `/api/projects`, `/api/playlists`, `/api/contacts`, `/api/beat_sends`, `/api/campaigns`, `/api/calendar`, `/api/events`, `/api/profile`, `/api/licenses`, `/api/track-licenses`, `/api/sales`, `/api/analytics`, `/api/upload/*`, `/api/stems/*`, `/api/tracks/[id]/{analyze,arrangement,heatmap,lyrics,peaks,rate,similar,tags,shares,versions}`, `/api/search`, `/api/activity`, `/api/whoami`, `/api/invite`, `/api/email`, `/api/words`.
- **Webhook + diagnostics** — `/api/stripe/webhook`, `/api/resend/webhook` (email open/click → `beat_sends`), `/api/stripe/diagnostics`, `/api/audio/diagnostics`, `/api/stems/health`, `/api/cron/nudge-stale`.
