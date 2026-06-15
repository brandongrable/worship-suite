-- Worship Suite — share-by-email helper (Phase 6.2).
--
-- The `song_shares` table existed since Phase 0 with full RLS, but
-- there was no way for a song owner to look up a recipient by email
-- from the client: auth.users is not exposed to the JS API, and
-- `profiles` has no email column on purpose (avoiding a public email
-- directory).
--
-- This migration adds a single SECURITY DEFINER function that takes
-- an email and returns the matching user id (or NULL). It is granted
-- only to authenticated users.
--
-- Privacy note: any authenticated user can probe email existence via
-- this RPC. That matches the leak you'd get from a typical password
-- reset flow on most apps, and is a deliberate tradeoff for share UX.
-- If we ever need to tighten it, future work can restrict the lookup
-- to emails of users who already share at least one song with the
-- caller, but that adds friction to the first-share flow.

create or replace function public.find_user_by_email(p_email text)
    returns uuid
    language sql
    security definer
    set search_path = auth, public
as $$
    select id
    from auth.users
    where lower(email) = lower(trim(p_email))
    limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;
