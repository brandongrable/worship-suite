import type { Tables } from '@worship/db';
import { supabase } from './supabase';

export type SongShare = Tables<'song_shares'>;

/**
 * One entry in the "people I've shared this song with" view. Joined
 * with profiles.display_name when present; otherwise the owner just
 * sees the recipient's user_id as a fallback (the share itself still
 * works regardless of display_name presence).
 */
export type ShareWithRecipient = SongShare & {
  display_name: string | null;
};

/**
 * Resolve an email to a Supabase user_id via the SECURITY DEFINER
 * `find_user_by_email` RPC. Returns null if no such user exists.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('find_user_by_email', {
    p_email: email,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * All shares for a given song, with the recipient's display_name
 * joined in. Done as two queries because both `song_shares.user_id`
 * and `profiles.id` reference `auth.users.id` independently — there's
 * no direct FK between them for PostgREST to resource-embed against,
 * so we fetch profiles separately and merge.
 *
 * Only the song owner can read non-self rows (per the
 * `song_shares_owner_manages` policy); the recipient sees their own
 * row via `song_shares_recipient_reads_own`. Both policies leave the
 * profiles read open (`profiles_read_all`).
 */
export async function listSharesForSong(songId: string): Promise<ShareWithRecipient[]> {
  const { data: shareRows, error: shareErr } = await supabase
    .from('song_shares')
    .select('*')
    .eq('song_id', songId);
  if (shareErr) throw shareErr;
  const shares = shareRows ?? [];
  if (shares.length === 0) return [];

  const userIds = shares.map((s) => s.user_id);
  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);
  if (profileErr) throw profileErr;

  const nameById = new Map<string, string | null>();
  for (const p of profileRows ?? []) nameById.set(p.id, p.display_name ?? null);

  return shares.map((s) => ({
    ...s,
    display_name: nameById.get(s.user_id) ?? null,
  }));
}

export async function addShare(
  songId: string,
  recipientUserId: string,
  canEdit: boolean,
): Promise<SongShare> {
  const { data, error } = await supabase
    .from('song_shares')
    .upsert(
      { song_id: songId, user_id: recipientUserId, can_edit: canEdit },
      { onConflict: 'song_id,user_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeShare(songId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('song_shares')
    .delete()
    .eq('song_id', songId)
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Count songs shared with the current user that haven't been viewed
 * yet (viewed_at is null). Drives the "N new" badge on Home /
 * Library so a choir member knows when a worship leader has dropped
 * something into their queue.
 *
 * RLS: the `song_shares_recipient_reads_own` policy lets the
 * recipient see their own rows; this query just filters those.
 */
export async function countUnviewedShares(currentUserId: string): Promise<number> {
  const { count, error } = await supabase
    .from('song_shares')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUserId)
    .is('viewed_at', null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Mark a share as viewed by stamping `viewed_at = now()` on the
 * recipient's own row. Called the first time the user opens a song
 * that was shared with them. Idempotent — re-stamping does nothing
 * meaningful, but we no-op if the row already has a non-null
 * viewed_at to avoid a needless write.
 */
export async function markShareViewed(
  songId: string,
  currentUserId: string,
): Promise<void> {
  const { data, error: readErr } = await supabase
    .from('song_shares')
    .select('viewed_at')
    .eq('song_id', songId)
    .eq('user_id', currentUserId)
    .maybeSingle();
  if (readErr) throw readErr;
  // No share row for this user (e.g. they own the song outright)
  // — nothing to mark.
  if (!data) return;
  if (data.viewed_at != null) return;

  const { error } = await supabase
    .from('song_shares')
    .update({ viewed_at: new Date().toISOString() })
    .eq('song_id', songId)
    .eq('user_id', currentUserId);
  if (error) throw error;
}
