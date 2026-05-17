# Antigravity Music Platform Spec

## STACK
Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (auth + db), Cloudflare R2 (audio storage), Resend (email), Wavesurfer.js (player), Essentia.js (audio analysis), Moises API (stem splitting), React Query, Zustand, Zod, Nanoid.

## DESIGN
Dark theme (#0c0c0c background), inspired by untitled.stream. Clean minimal UI, uppercase track titles, square album art cards, waveform player at bottom, right-side detail drawer.

## BUILD IN THIS ORDER
1. /lib/types/index.ts — all TypeScript types (Track, Playlist, Contact, ShareLink, BeatSend, TeamMember, Stem, Tag, TrackType)
2. /lib/supabase/client.ts and /lib/supabase/server.ts — browser and server Supabase clients using @supabase/ssr
3. /supabase/migrations/001_init.sql — full schema:
   - tracks table (id, user_id, title, type [beat/instrumental/song/remix], audio_url, cover_url, duration_seconds, bpm, key, scale, loudness, danceability, energy, valence, acousticness, rating 1-5, stems_status, notes, created_at)
   - playlists + playlist_tracks tables
   - share_links table (token, track_ids[], expires_at, password_hash, plays)
   - share_plays table (link_token, track_id, ip_hash, played_at)
   - contacts table (name, email, role, label, instagram, notes)
   - beat_sends table (contact_id, track_ids[], share_token, message, status [sent/opened/interested/negotiating/placed/pass])
   - calendar_events table (title, date, end_date, type, track_ids[], notes, color)
   - invites table (email, role, token, expires_at, used_at)
   - team_members table (user_id, role [owner/admin/collaborator], email, name)
   - track_tags table (track_id, tag, category)
   - stems table (track_id, job_id, status, vocals_url, drums_url, bass_url, other_url)
   - rating_history table (track_id, user_id, rating, rated_at)
   - RLS policies: all tables require auth, team_members gate
4. middleware.ts — protect /library /playlists /contacts /calendar /links /settings routes, redirect to /login
5. app/layout.tsx — root layout with dark bg #0c0c0c, QueryProvider, global PlayerBar at bottom
6. app/(auth)/login/page.tsx — magic link login with Supabase OTP, centered card, dark theme
7. app/(auth)/invite/[token]/page.tsx — validate token, show accept form
8. app/(dashboard)/library/page.tsx — main library with project grid cards (album art, name, track count), filter tabs, search
9. app/(dashboard)/library/[id]/page.tsx — project detail: left sidebar with cover art + actions, main track list with numbers/dates/BPM/key/rating stars, right detail drawer
10. app/(dashboard)/contacts/page.tsx — CRM contacts list
11. app/(dashboard)/calendar/page.tsx — release calendar
12. app/share/[token]/page.tsx — public listener page (no auth required)
13. app/api/upload/route.ts — upload audio to R2, run Essentia analysis, save track to DB
14. app/api/tracks/[id]/rate/route.ts — POST to update rating
15. app/api/tracks/[id]/tags/route.ts — GET/POST/DELETE tags
16. app/api/share/route.ts — generate share link with nanoid token
17. app/api/stems/route.ts — kick off Moises stem split job
18. app/api/stems/[jobId]/route.ts — poll job, save stem URLs to R2
19. app/api/email/route.ts — send beat to artist via Resend, log to beat_sends
20. app/api/invite/route.ts — send team invite email

## KEY COMPONENTS
- components/nav/Sidebar.tsx — dark sidebar with Library, Playlists, Contacts, Calendar, Links, Settings nav items
- components/player/PlayerBar.tsx — persistent bottom player with Wavesurfer waveform, play/pause/next/prev, track info
- components/player/WavePlayer.tsx — inline waveform player
- components/tracks/TrackCard.tsx — track row with play button, title, type badge, BPM, key, danceability %, star rating, tags
- components/tracks/StarRating.tsx — 1-5 star rating with optimistic update
- components/tracks/TagPicker.tsx — tag taxonomy: genre (Trap/Drill/Afrobeats/Amapiano/R&B/Hip-hop/Lo-fi), mood (Dark/Melodic/Aggressive/Chill/Emotional/Hype), instruments (808s/Piano/Guitar/Strings/Synth/Vocal sample), status (Ready to send/Needs mix/Exclusive/Leased)
- components/upload/DropZone.tsx — drag-and-drop audio upload (MP3/WAV/FLAC/AIFF), shows analysis progress
- components/share/ShareModal.tsx — invite only toggle, allow downloads, password protect, expiry date, copy link
- components/stems/StemPlayer.tsx — 4-channel mixer with volume faders and mute per stem
- components/crm/BeatLog.tsx — beat sends table with status pipeline

## HOOKS
- hooks/usePlayer.ts — Zustand global player state (current track, queue, playing, progress, play/pause/next/prev)
- hooks/useTracks.ts — React Query track fetching with type filter
- hooks/useRating.ts — optimistic star rating mutation
- hooks/useTags.ts — toggle tags on/off
- hooks/useAuth.ts — Supabase auth state

## AUDIO ANALYSIS in lib/audio/analyze.ts
- Use Essentia.js WASM for BPM (RhythmExtractor2013) and key (KeyExtractor)
- Use AudD API for danceability and energy
- Run both in parallel on upload

## AUDIO STORAGE in lib/storage/upload.ts
- S3Client pointed at Cloudflare R2 endpoint
- uploadAudio function returns public CDN URL

## COLOR SYSTEM
- Background: #0c0c0c (page), #141414 (cards), #1a1a1a (hover)
- Text: #e8e8e8 (primary), #888 (secondary), #444 (tertiary)
- Accent: #7F77DD (purple, for playing state and active elements)
- Star rating: #c8a84b (gold)
- Borders: #1e1e1e (default), #2a2a2a (hover)
- Tag active: #1a1833 bg, #AFA9EC text, #534AB7 border
- Type badges: beat=#1a1a2e/purple, song=#0a1f0a/green, remix=#1f0a0a/red

## ENVIRONMENT VARIABLES (.env.local needed)
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, NEXT_PUBLIC_R2_PUBLIC_URL, RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL, MOISES_API_KEY, NEXT_PUBLIC_AUDD_API_TOKEN
