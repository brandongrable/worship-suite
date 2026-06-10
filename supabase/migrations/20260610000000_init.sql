-- Worship Suite — initial schema (Phase 0).
--
-- Locks identity/ownership/visibility and the setlist + share model.
-- The full normalized song record (sections, lyrics, harmony part layers,
-- stem manifest) lands in Phase 1 — until then, the expanded body lives
-- in `songs.record` as JSONB so we can iterate the shape without a
-- migration per change.
--
-- Private-first is enforced at the database. Row-level security is on
-- for every public table; `songs.visibility = 'public'` is gated by a
-- single policy that can be flipped off entirely while the licensing
-- question is open.

-- ---------- enums -----------------------------------------------------------

create type visibility as enum ('private', 'shared', 'public');
create type user_role  as enum ('user', 'contributor', 'admin');
create type lead_gender as enum ('male', 'female');

-- ---------- profiles (joined 1:1 with auth.users) ---------------------------

create table public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    display_name text,
    role        user_role not null default 'user',
    created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_read_all
    on public.profiles for select
    using (true);

create policy profiles_update_self
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- new auth.users rows get a matching profile automatically
create function public.handle_new_user()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
as $$
begin
    insert into public.profiles (id) values (new.id);
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------- songs -----------------------------------------------------------

create table public.songs (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users(id) on delete cascade,
    title       text not null,
    key         text not null,                 -- e.g. 'B', 'Eb'
    bpm         numeric(5,2) not null,
    lead_gender lead_gender not null,
    visibility  visibility not null default 'private',
    record      jsonb not null default '{}'::jsonb,   -- Phase 1 expands
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index songs_owner_idx on public.songs(owner_id);
create index songs_visibility_idx on public.songs(visibility);

alter table public.songs enable row level security;

-- public visibility GATE — flip the using-clause to `false` to disable
-- the public bucket entirely while licensing is unresolved.
create policy songs_read_public
    on public.songs for select
    using (visibility = 'public');

create policy songs_read_own
    on public.songs for select
    using (owner_id = auth.uid());

create policy songs_read_shared
    on public.songs for select
    using (exists (
        select 1 from public.song_shares s
        where s.song_id = songs.id and s.user_id = auth.uid()
    ));

create policy songs_write_own
    on public.songs for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

create policy songs_write_shared_editor
    on public.songs for update
    using (exists (
        select 1 from public.song_shares s
        where s.song_id = songs.id
          and s.user_id = auth.uid()
          and s.can_edit = true
    ));

-- ---------- song_shares -----------------------------------------------------

create table public.song_shares (
    song_id   uuid not null references public.songs(id) on delete cascade,
    user_id   uuid not null references auth.users(id) on delete cascade,
    can_edit  boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (song_id, user_id)
);

alter table public.song_shares enable row level security;

create policy song_shares_owner_manages
    on public.song_shares for all
    using (exists (
        select 1 from public.songs g
        where g.id = song_shares.song_id and g.owner_id = auth.uid()
    ))
    with check (exists (
        select 1 from public.songs g
        where g.id = song_shares.song_id and g.owner_id = auth.uid()
    ));

create policy song_shares_recipient_reads_own
    on public.song_shares for select
    using (user_id = auth.uid());

-- ---------- setlists --------------------------------------------------------

create table public.setlists (
    id          uuid primary key default gen_random_uuid(),
    owner_id    uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    created_at  timestamptz not null default now()
);

create index setlists_owner_idx on public.setlists(owner_id);

alter table public.setlists enable row level security;

create policy setlists_owner_all
    on public.setlists for all
    using (owner_id = auth.uid())
    with check (owner_id = auth.uid());

-- ---------- setlist_songs ---------------------------------------------------

create table public.setlist_songs (
    setlist_id uuid not null references public.setlists(id) on delete cascade,
    song_id    uuid not null references public.songs(id) on delete cascade,
    position   integer not null,
    primary key (setlist_id, song_id)
);

create index setlist_songs_setlist_position_idx
    on public.setlist_songs(setlist_id, position);

alter table public.setlist_songs enable row level security;

create policy setlist_songs_owner_all
    on public.setlist_songs for all
    using (exists (
        select 1 from public.setlists s
        where s.id = setlist_songs.setlist_id and s.owner_id = auth.uid()
    ))
    with check (exists (
        select 1 from public.setlists s
        where s.id = setlist_songs.setlist_id and s.owner_id = auth.uid()
    ));

-- ---------- updated_at trigger for songs -----------------------------------

create function public.touch_updated_at()
    returns trigger
    language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger songs_touch_updated_at
    before update on public.songs
    for each row execute function public.touch_updated_at();

-- ---------- storage bucket: stems ------------------------------------------

insert into storage.buckets (id, name, public)
    values ('stems', 'stems', false)
    on conflict (id) do nothing;

-- stems layout: {song_id}/{track_id}.mp3
-- read access mirrors the song's read policies (owner / shared / public)
-- write access only by the song's owner

create policy stems_read_song_visible
    on storage.objects for select
    using (
        bucket_id = 'stems'
        and exists (
            select 1 from public.songs g
            where (storage.foldername(name))[1] = g.id::text
              and (
                g.owner_id = auth.uid()
                or g.visibility = 'public'
                or exists (
                    select 1 from public.song_shares s
                    where s.song_id = g.id and s.user_id = auth.uid()
                )
              )
        )
    );

create policy stems_write_song_owner
    on storage.objects for insert
    with check (
        bucket_id = 'stems'
        and exists (
            select 1 from public.songs g
            where (storage.foldername(name))[1] = g.id::text
              and g.owner_id = auth.uid()
        )
    );

create policy stems_update_song_owner
    on storage.objects for update
    using (
        bucket_id = 'stems'
        and exists (
            select 1 from public.songs g
            where (storage.foldername(name))[1] = g.id::text
              and g.owner_id = auth.uid()
        )
    );

create policy stems_delete_song_owner
    on storage.objects for delete
    using (
        bucket_id = 'stems'
        and exists (
            select 1 from public.songs g
            where (storage.foldername(name))[1] = g.id::text
              and g.owner_id = auth.uid()
        )
    );
