import type { Tables } from '@worship/db';
import { supabase } from './supabase';
import type { Song } from './songs';

export type Setlist = Tables<'setlists'>;
export type SetlistSong = Tables<'setlist_songs'>;

export type SetlistWithCount = Setlist & { song_count: number };

export type SetlistSongRow = {
  song: Song;
  position: number;
  service_key: string | null;
};

/** All setlists owned by the current user, newest first. */
export async function listMySetlists(): Promise<SetlistWithCount[]> {
  const { data, error } = await supabase
    .from('setlists')
    .select('*, setlist_songs(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  // PostgREST returns embedded `setlist_songs: [{ count: N }]` for the
  // aggregate; flatten into a single number on each row.
  return data.map((row) => ({
    ...row,
    song_count:
      Array.isArray(row.setlist_songs) && row.setlist_songs[0]?.count != null
        ? Number(row.setlist_songs[0].count)
        : 0,
  })) as SetlistWithCount[];
}

export async function createSetlist(name: string, ownerId: string): Promise<Setlist> {
  const { data, error } = await supabase
    .from('setlists')
    .insert({ owner_id: ownerId, name: name.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSetlist(id: string): Promise<void> {
  const { error } = await supabase.from('setlists').delete().eq('id', id);
  if (error) throw error;
}

export async function renameSetlist(id: string, name: string): Promise<Setlist> {
  const { data, error } = await supabase
    .from('setlists')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Fetch a setlist plus its songs in position order. Uses two queries
 * to keep the row->song mapping simple; the setlist_songs table is
 * tiny so this is fine.
 */
export async function getSetlistWithSongs(
  id: string,
): Promise<{ setlist: Setlist; songs: SetlistSongRow[] } | null> {
  const { data: setlist, error: setlistErr } = await supabase
    .from('setlists')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (setlistErr) throw setlistErr;
  if (!setlist) return null;

  const { data: entries, error: entriesErr } = await supabase
    .from('setlist_songs')
    .select('position, service_key, song:songs(*)')
    .eq('setlist_id', id)
    .order('position', { ascending: true });
  if (entriesErr) throw entriesErr;

  const songs: SetlistSongRow[] = (entries ?? []).flatMap((e) => {
    // PostgREST returns `song` as an object when the FK is to a single
    // row. Defensive against the array form just in case.
    const song = Array.isArray(e.song) ? e.song[0] : e.song;
    if (!song) return [];
    return [
      {
        song: song as Song,
        position: e.position,
        service_key: e.service_key ?? null,
      },
    ];
  });

  return { setlist, songs };
}

/**
 * Add a song to a setlist at the next available position (max+1).
 * Idempotent on the (setlist_id, song_id) primary key — re-adding a
 * song that's already there is a no-op rather than an error.
 */
export async function addSongToSetlist(
  setlistId: string,
  songId: string,
): Promise<void> {
  // Find current max position; null if the setlist is empty.
  const { data: maxRow, error: maxErr } = await supabase
    .from('setlist_songs')
    .select('position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const nextPosition = (maxRow?.position ?? 0) + 1;

  const { error } = await supabase
    .from('setlist_songs')
    .upsert(
      { setlist_id: setlistId, song_id: songId, position: nextPosition },
      { onConflict: 'setlist_id,song_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeSongFromSetlist(
  setlistId: string,
  songId: string,
): Promise<void> {
  const { error } = await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlistId)
    .eq('song_id', songId);
  if (error) throw error;
}

/**
 * Set or clear the per-setlist service-key override for one entry.
 * Pass null to revert to the song's default key.
 */
export async function setSetlistSongServiceKey(
  setlistId: string,
  songId: string,
  key: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('setlist_songs')
    .update({ service_key: key })
    .eq('setlist_id', setlistId)
    .eq('song_id', songId);
  if (error) throw error;
}

/**
 * Rewrite every entry's position so they're sequential 1..N in the
 * order of `orderedSongIds`. Used by the drag-and-drop reorder
 * affordance — one round-trip via PostgREST upsert keyed on the
 * composite PK so all rows change positions atomically from the
 * client's point of view (no in-between state visible to other
 * readers, since RLS scopes the rows to the setlist owner).
 */
export async function reorderSetlistSongs(
  setlistId: string,
  orderedSongIds: string[],
): Promise<void> {
  if (orderedSongIds.length === 0) return;
  const rows = orderedSongIds.map((song_id, i) => ({
    setlist_id: setlistId,
    song_id,
    position: i + 1,
  }));
  const { error } = await supabase
    .from('setlist_songs')
    .upsert(rows, { onConflict: 'setlist_id,song_id' });
  if (error) throw error;
}

/**
 * Move a song up or down in the setlist by swapping positions with
 * its neighbor. Returns true if the move happened, false if the song
 * was already at the boundary (top for 'up', bottom for 'down').
 */
export async function moveSongInSetlist(
  setlistId: string,
  songId: string,
  direction: 'up' | 'down',
): Promise<boolean> {
  const { data: entries, error } = await supabase
    .from('setlist_songs')
    .select('song_id, position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: true });
  if (error) throw error;
  if (!entries || entries.length < 2) return false;

  const idx = entries.findIndex((e) => e.song_id === songId);
  if (idx === -1) return false;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= entries.length) return false;

  const a = entries[idx];
  const b = entries[swapIdx];
  if (!a || !b) return false;

  // Position has a unique implicit constraint via the primary key but
  // not on its own — swapping via two updates is safe.
  const { error: e1 } = await supabase
    .from('setlist_songs')
    .update({ position: b.position })
    .eq('setlist_id', setlistId)
    .eq('song_id', a.song_id);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from('setlist_songs')
    .update({ position: a.position })
    .eq('setlist_id', setlistId)
    .eq('song_id', b.song_id);
  if (e2) throw e2;
  return true;
}
