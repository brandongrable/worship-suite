# supabase/

Dedicated Supabase project for the Worship Suite — separate from any
other app's project.

## Setup

1. Create the project in the Supabase dashboard. Pick a name (e.g.
   `worship-suite`) and a region close to where you operate.
2. Drop the project ref into `config.toml` (`project_id`).
3. Drop the credentials into `Worship_Suite/.env.local`:

   ```
   SUPABASE_URL=...
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server-side only, never ship to client
   ```

4. Apply migrations:

   ```bash
   pnpm dlx supabase link --project-ref <REF>
   pnpm dlx supabase db push
   ```

5. Regenerate `@worship/db` types:

   ```bash
   pnpm --filter @worship/db dlx supabase gen types typescript \
       --project-id <REF> > packages/db/src/supabase.gen.ts
   ```

## Schema (v1, Phase 0)

`migrations/20260610000000_init.sql` defines:

- `profiles` (1:1 with `auth.users`, carries `role`)
- `songs` — identity, ownership, key/tempo, visibility, JSONB `record`
  for the Phase 1 expansion
- `song_shares` — selective sharing with optional edit permission
- `setlists` + `setlist_songs`
- `stems` storage bucket with read policies mirroring song visibility
- Enums: `visibility` (private/shared/public), `user_role`
  (user/contributor/admin), `lead_gender` (male/female)

Row-level security is on for every public table; the public bucket on
`songs` is a single policy that can be flipped off entirely while the
licensing question is open.

## When the song record shape lands (Phase 1)

The expanded body lives in `songs.record` (JSONB) until Phase 1 finalizes
the normalized shape. At that point either:

- Move common fields out of `record` into typed columns + index them, or
- Add a JSON-schema check constraint on `record` to enforce the shape

Decide based on which fields actually get queried/filtered. Anything
that's only ever read whole (`sections`, `lyrics`, harmony `parts`,
`stems` manifest) is fine in JSONB.
