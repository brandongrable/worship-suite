-- Fix RLS infinite recursion (42P17) between songs ↔ song_shares.
--
-- Bug (caught via integration test against the live project):
--   * songs_read_shared queries song_shares
--   * song_shares_owner_manages queries songs
--   * Evaluating either policy invokes the other → infinite loop →
--     Postgres aborts with `42P17: infinite recursion detected in
--     policy for relation "songs"`.
--   * Every PostgREST call from apps/vocal-booth/src/lib/songs.ts
--     failed, even queries that matched zero rows.
--   * Stems policies on storage.objects were on the same path and
--     would have surfaced the same error on first download.
--
-- Fix: break the cycle with SECURITY DEFINER helpers that run with
-- the function-owner's privileges (BYPASSRLS) and therefore don't
-- re-enter the calling policy. Each policy now calls a helper
-- instead of EXISTS'ing into another RLS-controlled table.

-- ---------- helpers ---------------------------------------------------------

create or replace function public.user_owns_song(p_song_id uuid)
    returns boolean
    language sql
    security definer
    set search_path = public
    stable
as $$
    select exists (
        select 1 from public.songs s
        where s.id = p_song_id and s.owner_id = auth.uid()
    );
$$;

create or replace function public.user_shares_song(p_song_id uuid)
    returns boolean
    language sql
    security definer
    set search_path = public
    stable
as $$
    select exists (
        select 1 from public.song_shares sh
        where sh.song_id = p_song_id and sh.user_id = auth.uid()
    );
$$;

create or replace function public.user_can_edit_song(p_song_id uuid)
    returns boolean
    language sql
    security definer
    set search_path = public
    stable
as $$
    select exists (
        select 1 from public.song_shares sh
        where sh.song_id = p_song_id
          and sh.user_id = auth.uid()
          and sh.can_edit = true
    );
$$;

-- These helpers only matter for authenticated callers; deny anon.
revoke execute on function public.user_owns_song(uuid)     from public;
revoke execute on function public.user_shares_song(uuid)   from public;
revoke execute on function public.user_can_edit_song(uuid) from public;
grant  execute on function public.user_owns_song(uuid)     to authenticated;
grant  execute on function public.user_shares_song(uuid)   to authenticated;
grant  execute on function public.user_can_edit_song(uuid) to authenticated;

-- ---------- rewrite songs policies that queried song_shares ----------------

drop policy if exists songs_read_shared on public.songs;
create policy songs_read_shared
    on public.songs for select
    using (public.user_shares_song(id));

drop policy if exists songs_write_shared_editor on public.songs;
create policy songs_write_shared_editor
    on public.songs for update
    using (public.user_can_edit_song(id));

-- ---------- rewrite song_shares policy that queried songs ------------------

drop policy if exists song_shares_owner_manages on public.song_shares;
create policy song_shares_owner_manages
    on public.song_shares for all
    using      (public.user_owns_song(song_id))
    with check (public.user_owns_song(song_id));

-- ---------- rewrite stems policies that queried both -----------------------

drop policy if exists stems_read_song_visible on storage.objects;
create policy stems_read_song_visible
    on storage.objects for select
    using (
        bucket_id = 'stems'
        and exists (
            select 1 from public.songs g
            where (storage.foldername(name))[1] = g.id::text
              and (
                g.visibility = 'public'
                or public.user_owns_song(g.id)
                or public.user_shares_song(g.id)
              )
        )
    );

drop policy if exists stems_write_song_owner on storage.objects;
create policy stems_write_song_owner
    on storage.objects for insert
    with check (
        bucket_id = 'stems'
        and public.user_owns_song(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists stems_update_song_owner on storage.objects;
create policy stems_update_song_owner
    on storage.objects for update
    using (
        bucket_id = 'stems'
        and public.user_owns_song(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists stems_delete_song_owner on storage.objects;
create policy stems_delete_song_owner
    on storage.objects for delete
    using (
        bucket_id = 'stems'
        and public.user_owns_song(((storage.foldername(name))[1])::uuid)
    );
