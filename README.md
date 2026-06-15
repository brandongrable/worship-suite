# Worship Suite

Three apps + one shared backend.

| What | Where | Stack | State |
|---|---|---|---|
| **Pipeline** | `apps/pipeline/` | Tauri desktop — orchestrates Demucs → WhisperX → aligner → publish | skeleton (Tauri scaffold pending Rust install) |
| **Charter** | `apps/charter/` | Vite + React + Tailwind — chord/lyric chart authoring | prototype runs on `:5174` |
| **Vocal Booth** | `apps/vocal-booth/` | Vite + React — picks setlist, picks part, practices against stems | prototype + auth + songs CRUD on `:5173` |
| **Aligner** | `aligner/` (sibling repo) | Python — words → MIDI alignment, MusicXML emission | tested, repo at `github.com/brandongrable/lyric-midi-aligner` |
| **Backend** | `supabase/` | Dedicated Supabase project: profiles, songs, song_shares, setlists, setlist_songs + `stems` bucket | live, RLS enforced |

## Quick start

```bash
corepack enable pnpm        # one-time on a new machine
pnpm install
pnpm dev                    # boots both apps in parallel
```

- Vocal Booth: http://localhost:5173/
- Charter: http://localhost:5174/

Other top-level scripts: `pnpm build`, `pnpm typecheck`, `pnpm test` — each runs `-r` across all workspace members.

## Environment

Copy `.env.local.example` → `.env.local` and fill in:

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key from dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service-role key — server only, never bundled>
VITE_SUPABASE_URL=<same as SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

The `VITE_`-prefixed pair is what Vite exposes to the browser. The unprefixed pair stays available for any Node scripts (admin tools, migrations). Vite reads from the workspace root (`envDir: '../..'`).

## Shared packages

- `packages/core/` — typed contracts shared by all apps.
  - `visibility.ts` — public/shared/private + ROLES
  - `parts.ts` — PARTS, Part, PART_COLOR (brand palette), HARMONY_PARTS
  - `partlayer.ts` — STEM_TRACKS, StemTrack, PartNote, PartLayer
  - `section.ts` — SectionType + SECTION_META + Section + label helpers
  - `song.ts` — SongRecord, Setlist, SetlistSong, SongShare
  - `music.ts` — note arrays, transposeNote/Key, getKeyOptions, formatTime
- `packages/db/` — generated Supabase Database type + Tables<T>, TablesInsert<T>, TablesUpdate<T>, Enums<T> helpers. Regenerate after schema changes:
  ```
  pnpm exec supabase gen types typescript --linked > packages/db/src/supabase.gen.ts
  ```

## Backend

A dedicated Supabase project (ref in `supabase/config.toml`). Schema in `supabase/migrations/`. Apply with:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push
```

RLS policies: songs are private by default; `song_shares` surfaces shared rows to recipients; `visibility = 'public'` opts in to the public bucket.

The Pipeline is the only writer of the full song record. Charter writes chord-chart edits. Vocal Booth reads + manages user setlists.

## Prototypes

Each app keeps its original single-file prototype in `apps/<app>/prototypes/`:

- `apps/vocal-booth/prototypes/worship-mixer.jsx`
- `apps/charter/prototypes/chart-formatter.jsx` (+ standalone HTML version)

These are the source of truth for the visual design and the data shapes we're migrating off of. Production code in `src/` consumes them through wrappers, not by copy.

## The aligner

The aligner is a Python package with its own README/tests/git history. Pipeline shells out to it as a subprocess at publish time. Not a workspace member.

## Other directories

- `scratch/` — dev-only sandboxes (per-song WhisperX runs etc.). Not deployed.
- `fixtures/` — real source material to validate the pipeline.

## Roadmap

See [`PHASES.md`](./PHASES.md) for the full phased plan and current state.

Current: **Phase 2 done** (producer Pipeline + audio playback round-trip). Next: **Phase 3** (wire the Vocal Booth mixer to real songs).
