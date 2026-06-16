-- Worship Suite — Phase 6 stretch additions.
--
-- Two small additive columns:
--
--   1. `setlist_songs.service_key text` — per-setlist-entry
--      transposition override. Null means "use the song's default
--      key from the songs table". A choir leader who wants Verb in
--      Eb for Sunday morning but A on Friday writes a different
--      service_key on each setlist entry without touching the
--      song row's permanent key.
--
--   2. `song_shares.viewed_at timestamptz` — null when a share is
--      new (recipient hasn't opened it yet); set to now() when the
--      recipient first opens the shared song. Drives an "N new
--      songs" badge in the recipient's UI.
--
-- Both columns default null so no existing-row migration is
-- needed. RLS policies don't reference either column, so no
-- policy work either.

alter table public.setlist_songs
    add column service_key text default null;

alter table public.song_shares
    add column viewed_at timestamptz default null;
