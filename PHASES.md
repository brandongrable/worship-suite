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

## Phase 3 — Mixer integration  ✅ done

The Vocal Booth mixer prototype now consumes real songs from Supabase.

### 3.1 — SongDetail → Mixer wiring  ✅

- 3.1a — `songToMixerSong()` adapter maps `Tables<'songs'>` → the
  prototype's expected shape. Sections/lyrics fall back to a single
  "Full Song" block + `[]` when absent
- 3.1b — `useAudioEngine.loadStem` accepts `File | { url, label }`;
  signed-URL path fetches + decodes via `AudioContext`. Returns the
  decoded buffer so callers can read `duration`
- 3.1c — "Open in Mixer" CTA on SongDetail, new `"loading-remote"`
  phase in the mixer that batch-signs every entry in `record.stems`,
  decodes them, and advances to the playback surface

### 3.2 — Browser stem uploader  ✅

- `uploadAndRegisterStem` + `removeStem` helpers mirror Pipeline's
  path convention (`<song_id>/<track>.<ext>`, `stems/` prefix in
  `record.stems`)
- SongDetail's Stems section becomes a 7-slot panel: Upload / ▶
  preview / Replace / ✕ remove per track. Owners only

### 3.3 — Persisted view state  ✅

Per-user localStorage of `{view, selectedSongId, selectedSetlistId}`.
Reloading drops the user back where they left off

### 3.4 — Library refresh button  ✅

⟳ button next to the title; surfaces freshly-published rows without a
hard reload

## Phase 4 — Sections + harmony parts  ✅ done

Real arrangement data lands so the mixer's section bar and part-status
display work for actual songs.

- 4.1 ✅ — `mixer-adapter` reads `record.sections: Section[]` and
  `record.lyrics` when present. Normalizes via core's `sectionLabel` /
  `sectionShortLabel`. Sorted by `startTime` ascending. Old songs
  keep the synthetic "Full Song" fallback
- 4.2 ✅ — End-to-end automated section authoring:
    * **4.2a (aligner repo)** — `structure.compute_timings(structure,
      alignment, notes)` walks the literal performance order and
      emits one timed entry per section instance. Vocal sections
      anchored to first/last owned word; instrumental sections
      sandwiched between adjacent vocal windows with leading/trailing
      clamps. Sidecar JSON gains a `sections` field; null when no
      structure map was provided.
    * **4.2b (Pipeline / this repo)** — `publish_song` normalizes the
      raw aligner timings into core's `Section[]` shape (id, type,
      instanceNumber, startTime, endTime, partStatus). Per-type
      instance counter assigns VERSE/1, VERSE/2 across `verse 1` +
      `verse 1 (repeat)` automatically. Raw timings preserved on
      `record.section_timings_raw` for debugging.
    * **4.2c (interim)** — `SectionsPanel` in SongDetail lets an
      owner author or edit sections by hand. Owners can fix mis-
      classified types or fill in `partStatus` (the producer side
      always emits all-inactive; harmony arrangement is the owner's
      authoring concern).
- 4.3 ✅ — `parts: PartLayer[]` flow established end-to-end:
    * **4.3a (aligner)** — new `parts.compute_lead_part` walks the
      alignment and emits the lead vocal melody as one PartLayer
      keyed `unison` (the reference melody during unison sections).
      Each PartNote carries col / section_index / onset / duration /
      pitch / syllable / confidence. Always emitted, even when no
      structure drove the run (section_index is null in that case).
    * **4.3b (Pipeline)** — `normalize_parts_in_record` rewrites
      each note's `section_index` to the canonical `sectionId` from
      the matching position in `record.sections`. Out-of-range or
      null indices land as `sectionId: ""` rather than failing the
      publish.

    Schema now matches `@worship/core`'s PartLayer exactly. No
    consumer UI yet — future score / pitch-reference features
    (post-MVP) will read from `record.parts` directly. Harmony
    parts (separate MIDI inputs per voice) deferred to a later
    slice; the schema is ready when they land.
- 4.4 ✅ — Vocal Booth mixer renders real section boundaries via the
  4.1 adapter; verified with 4.2 producer output. Real part-status
  flows when authored via 4.2c.
- 4.5 ✅ — Multi-file stem upload in Vocal Booth (Pipeline batch
  upload deferred to a Pipeline-only slice). `guessTrackFromFilename`
  + `uploadStemsBatch` do parallel storage PUTs followed by ONE
  record patch — six TGIF stems land in one round-trip.

## Phase 5 — Charter persistence  ✅ done

Charter is now auth-gated and round-trips chord charts through Supabase.

- Magic-link auth ported from Vocal Booth (amber theme to match
  Charter's accent)
- `SongPicker` lists every song visible to the user; "+ New chart"
  creates + opens in one click
- `saveSongCharter(songId, patch)` updates top-level `title/key/bpm`
  and merges a `charter` sub-object into `record`. Read-modify-write
  on `record` so Pipeline's `summary / items / stems / sections /
  parts` keys are never clobbered
- ChartFormatter accepts `{ song, onExit }` props (JSDoc-typed);
  initial state hydrated via `songToCharterState()`. Cloud-save
  button + "‹ Songs" back affordance in the toolbar. Existing
  file-export + PDF-print paths unchanged
- Last-opened song id persisted per-user in localStorage

## Phase 6 — Sharing + setlists  ✅ done

### 6.1 — Setlists CRUD  ✅

- `lib/setlists.ts` — list/create/rename/delete + `addSongToSetlist`
  (append at max+1), `removeSongFromSetlist`, `moveSongInSetlist`
  (neighbor-swap by position)
- `Setlists.tsx` list view + new-setlist form + ⟳ refresh
- `SetlistDetail.tsx` — numbered list with ▲/▼/✕ controls, inline
  song picker showing every visible song not yet in the setlist,
  click-to-rename header
- Home gets a third amber tile. SongDetail's back button knows
  whether the user came from a setlist vs. Library

### 6.2 — Share-by-email  ✅

- New migration `20260615120000_share_lookup.sql` adds a SECURITY
  DEFINER `find_user_by_email(p_email)` RPC on `auth.users` (granted
  to `authenticated` only). Applied to remote via `supabase db push`
- `lib/shares.ts` wraps the RPC + `song_shares` table ops
- SongDetail's owner view gains a Sharing panel: email + can-edit
  checkbox + share button, plus a list of existing shares with
  display_name when available (otherwise user_id) and per-row Revoke

### Out of scope (deferred)

- Drag-to-reorder setlists (▲/▼ is good enough for now)
- Per-song service-key / lead-vocal overrides on setlist entries
- Choir-member notification UI when a setlist is shared with you
- Setlist-as-rehearsal-home (replacing Library default)

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
