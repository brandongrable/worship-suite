import type { Tables, TablesInsert } from '@worship/db';
import { supabase } from './supabase';

export type Song = Tables<'songs'>;
export type NewSong = TablesInsert<'songs'>;

/**
 * List songs visible to the current user — own + shared + public —
 * ordered newest first. RLS filters server-side; we just `select *`.
 */
export async function listMySongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export type CreateSongInput = {
  title: string;
  key: string;
  bpm: number;
  lead_gender: 'male' | 'female';
};

export async function createSong(input: CreateSongInput, ownerId: string): Promise<Song> {
  const { data, error } = await supabase
    .from('songs')
    .insert({
      owner_id: ownerId,
      title: input.title,
      key: input.key,
      bpm: input.bpm,
      lead_gender: input.lead_gender,
      visibility: 'private',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw error;
}

const AUDIO_EXT_ALLOWLIST = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] as const;

/**
 * Upload a stem file to the `stems` bucket at the same path convention
 * Pipeline uses (`<song_id>/<track>.<ext>`), then merge the resulting
 * storage key into `songs.record.stems`. Returns the updated row so
 * callers can refresh their local copy.
 *
 * The RLS policy `stems_write_song_owner` enforces server-side that
 * only the song's owner can write into `<song_id>/...`. Uploads use
 * upsert so re-picking a track just replaces the file.
 */
export async function uploadAndRegisterStem(
  song: Song,
  track: string,
  file: File,
): Promise<Song> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  if (!AUDIO_EXT_ALLOWLIST.includes(ext as (typeof AUDIO_EXT_ALLOWLIST)[number])) {
    throw new Error(`Unsupported audio extension: .${ext}`);
  }

  const objectPath = `${song.id}/${track}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('stems')
    .upload(objectPath, file, {
      upsert: true,
      contentType: file.type || `audio/${ext}`,
    });
  if (uploadErr) throw uploadErr;

  const storageKey = `stems/${objectPath}`;
  const existing = (song.record ?? {}) as Record<string, unknown>;
  const existingStems = (existing.stems ?? {}) as Record<string, string>;
  const nextRecord = {
    ...existing,
    stems: { ...existingStems, [track]: storageKey },
  };

  const { data, error: patchErr } = await supabase
    .from('songs')
    .update({ record: nextRecord })
    .eq('id', song.id)
    .select()
    .single();
  if (patchErr) throw patchErr;
  return data;
}

/**
 * Remove a stem from both Storage and `songs.record.stems`. Used by
 * the SongDetail "Replace" / "Remove" affordance.
 */
export async function removeStem(song: Song, track: string): Promise<Song> {
  const existing = (song.record ?? {}) as Record<string, unknown>;
  const existingStems = { ...((existing.stems ?? {}) as Record<string, string>) };
  const storageKey = existingStems[track];
  if (!storageKey) return song;

  const objectPath = storageKey.replace(/^stems\//, '');
  const { error: removeErr } = await supabase.storage
    .from('stems')
    .remove([objectPath]);
  if (removeErr) throw removeErr;

  delete existingStems[track];
  const nextRecord = { ...existing, stems: existingStems };
  const { data, error: patchErr } = await supabase
    .from('songs')
    .update({ record: nextRecord })
    .eq('id', song.id)
    .select()
    .single();
  if (patchErr) throw patchErr;
  return data;
}
