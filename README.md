# Worship Suite

Three apps + one shared backend.

| What | Where | Stack |
|---|---|---|
| **Pipeline** | `apps/pipeline/` | Tauri desktop — orchestrates Demucs → WhisperX → aligner → publish |
| **Charter** | `apps/charter/` | Web — chord/lyric chart authoring & presentation |
| **Vocal Booth** | `apps/vocal-booth/` | Web/PWA — picks setlist, picks part, practices against stems |
| **Aligner** | `aligner/` (sibling, own git repo) | Python — words → MIDI alignment, MusicXML emission |
| **Backend** | `supabase/` | Dedicated Supabase project: typed song record + stems bucket |

## Workspace

pnpm workspaces. Node 20+, pnpm pinned via `packageManager` in `package.json`.

```bash
corepack enable pnpm     # one-time on a new machine
pnpm install
pnpm -r build
pnpm -r test
```

## Shared packages

- `packages/core/` — typed song-record contract, part-color map,
  visibility/role enums. Read by Charter, Vocal Booth, Pipeline.
- `packages/db/` — generated Supabase types + thin client helpers.

## The aligner

The aligner is a Python package, not a pnpm workspace member, and lives
at `aligner/` with its own README/tests/git history. Pipeline shells out
to it as a subprocess at publish time.

## Other directories

- `scratch/` — dev-only sandboxes (currently the per-song WhisperX runs
  for "Washed"). Not part of the deployed surface.
- `fixtures/` — real source material used to validate the pipeline:
  sample vocal charts, stem sets, the Washed test bed.

## Backend

A dedicated Supabase project (separate from any other app's project).
Schema in `supabase/migrations/`. The Pipeline is the only writer of the
song record; Charter writes back light text edits; Vocal Booth reads.

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.local` once the
project exists.

## Roadmap

Phase plan lives outside the repo (in conversation). Current phase:
**Phase 0 — Foundation & repo hygiene**.
