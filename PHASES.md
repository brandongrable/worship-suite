# Phased build plan

The original plan lived in chat; this is the authoritative version going
forward. Update as phases close.

---

## Phase 0 — Foundation & repo hygiene  ✅ done

- pnpm workspaces monorepo with Corepack-pinned `pnpm@9.15.0`
- Workspace members: `apps/{vocal-booth,charter,pipeline}`, `packages/{core,db}`
- Two GitHub repos: `worship-suite` (this one) and `lyric-midi-aligner`
  (sibling, Python, separate history)
- Supabase project created (ref `hnrjycpjcnlzqqunmdac`)
- Initial migration: 3 enums, 5 tables, RLS policies, `stems` storage bucket
- `.env.local` convention at workspace root, `envDir: '../..'` on each app

## Phase 1 — Contracts, auth, CRUD  ✅ done

- `@worship/core` modules:
  - `visibility.ts` (Visibility, ROLES)
  - `parts.ts` (PARTS, Part, PART_COLOR — Vocal Booth palette), HARMONY_PARTS
  - `partlayer.ts` (STEM_TRACKS, StemTrack, PartNote, PartLayer)
  - `section.ts` (SectionType, SECTION_META, Section, sectionLabel/sectionShortLabel)
  - `song.ts` (SongRecord, Setlist, SetlistSong, SongShare)
  - `music.ts` (NOTES_*, transposeNote/Key, getKeyOptions, formatTime)
- `@worship/db`: generated Supabase types + Tables/TablesInsert/TablesUpdate/Enums helpers
- 32 vitest tests for `@worship/core` pure functions
- GitHub Actions CI: build + test on every push/PR
- Vocal Booth + Charter scaffolded (Vite + React + TS, prototypes preserved
  in `apps/<app>/prototypes/`)
- Vocal Booth: magic-link auth, songs CRUD (read/create/delete) with RLS
  enforcement verified end-to-end
- Migration fix for RLS recursion (`songs` ↔ `song_shares` ↔ `stems`) using
  SECURITY DEFINER helper functions

## Phase 2 — Pipeline producer + audio path  ✅ done

### 2A — Pipeline app

- Tauri 2 + Vite 7 + React 19 scaffold in `apps/pipeline/`
- `health_check` + `python_check` Tauri commands (subprocess sanity)
- `run_aligner` command shells out to `python3 -m aligner` with file pickers
  for MIDI + JSON + optional structure file; captures stdout/stderr
- Sidecar review UI: loads `.review.json`, surfaces summary stats + flagged
  items (low_confidence / long_run, color-coded)
- Structure-check rendering (green/red banner with suspect section)
- `publish_song` Tauri command POSTs to PostgREST with the service role key;
  reads producer UUID from `WORSHIP_PRODUCER_USER_ID`; writes the full
  sidecar payload into `songs.record` JSONB
- `upload_stem` + `patch_song_stems` Tauri commands: PUTs audio to the
  `stems` bucket, merges `record.stems` manifest

### 2B — Vocal Booth consumer

- Home screen (My Library / Mixer demo) post-auth
- Library reads `songs` table (RLS-filtered to owner + shared + public)
- SongDetail page: full row metadata, Pipeline-payload stat grid, Stems list
- Stem playback via Supabase Storage signed URLs (1-hour expiry, HTML5 audio)

**End-to-end verified**: a producer can ingest MIDI + WhisperX → produce
MusicXML + sidecar → publish to Supabase → upload stems → and a choir
member can browse, open, and hear the stems in the browser.

---

## Phase 3 — Mixer integration  🔜 next

The Vocal Booth mixer prototype still runs on mock data. Phase 3 wires it
to real songs.

- "Open in mixer" button on SongDetail that hands the song record to the
  prototype mixer
- Adapter that converts `SongRecord` → the prototype's expected shape
  (TRACKS, sections, partStatus). Where real data is missing (sections,
  partStatus), the adapter falls back to sensible defaults.
- Mixer's `useAudioEngine.loadStem` extended to accept a signed URL
  instead of a `File` object (fetch + decodeAudioData)
- Multi-stem playback: click/band/lead/harmonies playing in sync
- Quick-mix presets + per-track fader behavior preserved from the prototype

Stretch within Phase 3:
- Persisted user state (last song opened, current preset) in
  `localStorage`
- Refresh-Library button (currently a hard reload)

## Phase 4 — Sections + harmony parts  📋

Real arrangement data lands so the mixer's section bar and part-status
display work for actual songs.

- Pipeline parses MusicXML rehearsal marks (or accepts a structure map)
  and writes a `sections: Section[]` array into `songs.record` (or a
  dedicated column, decided at the start of the phase)
- Pipeline writes `parts: PartLayer[]` from the aligner output
- Vocal Booth mixer renders real section boundaries + real part-status
- Pipeline batch-upload for the 7-track stem set (click, band, lead +
  4 harmonies) instead of one at a time

## Phase 5 — Charter persistence  📋

Charter's chord-chart prototype currently saves nothing.

- Port the magic-link auth slice from Vocal Booth (same pattern works
  for the workspace's `.env.local`)
- Charter writes chord-chart structure into `songs.record` (likely a
  `charter` sub-object alongside `summary` / `items` / `stems`)
- Read path: Charter loads a song's chart from the row; round-trips
  edits without conflicting with the Pipeline's payload writes (last
  writer wins per top-level key, or namespaced merge)
- Print mode preserved from the prototype

## Phase 6 — Sharing + setlists  📋

The `song_shares` and `setlists` / `setlist_songs` tables already exist
with RLS. The UI is missing.

- Vocal Booth: "Share" button on owned songs → email lookup + insert into
  `song_shares` (optional can_edit toggle)
- Setlist editor: create a setlist, drag songs in, reorder positions
- Setlist view replaces the Library home for active-rehearsal context
  (think "this Sunday's service")
- Choir-member UX: notification when a setlist is shared with you

## Phase 7 — Demucs + WhisperX integration  📋

Pipeline currently picks up *after* Demucs (source separation) and
WhisperX (word timing) have run. Phase 7 makes Pipeline orchestrate
those steps too — so the producer workflow becomes "drop the recording
in, watch the stages roll."

- Demucs subprocess wrapper (separate stems from a mixed recording)
- WhisperX subprocess wrapper (produce the `word_segments` JSON)
- Pipeline UI: pipeline diagram with per-stage status
- Cached intermediates so re-running one stage doesn't recompute the
  upstream ones

## Phase 8 — Polish + share with humans  📋

- Production deploy of Vocal Booth (web) and Charter (web). Supabase
  Auth redirect URLs updated.
- Tauri builds of Pipeline distributable
- Onboarding flow for first-time choir members
- Real user testing
