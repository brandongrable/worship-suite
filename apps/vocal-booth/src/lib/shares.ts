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
 * joined in. Only the song owner can read non-self rows (per the
 * song_shares_owner_manages policy), but the join still works for
 * the recipient's own row (song_shares_recipient_reads_own).
 */
export async function listSharesForSong(songId: string): Promise<ShareWithRecipient[]> {
  const { data, error } = await supabase
    .from('song_shares')
    .select('*, profiles:user_id(display_name)')
    .eq('song_id', songId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    // PostgREST returns the joined profile as an object (FK is to a
    // single profiles row). Be defensive against the array form.
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      ...row,
      display_name:
        profile && typeof profile === 'object' && 'display_name' in profile
          ? ((profile as { display_name: string | null }).display_name ?? null)
          : null,
    } as ShareWithRecipient;
  });
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
