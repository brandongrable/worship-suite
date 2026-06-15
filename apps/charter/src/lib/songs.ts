import type { Database, Tables, TablesInsert } from '@worship/db';
import { supabase } from './supabase';

type Json = Database['public']['Tables']['songs']['Row']['record'];

export type Song = Tables<'songs'>;
export type NewSong = TablesInsert<'songs'>;

/** List songs visible to the current user — own + shared + public. */
export async function listMySongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchSongById(id: string): Promise<Song | null> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
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
      title: input.title.trim(),
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

/**
 * Save Charter's chord-chart state to a song row. We update the top-
 * level columns Charter authors (title, key, bpm) and merge a `charter`
 * sub-object into `record`, leaving every other top-level key in
 * `record` untouched. This is the contract Pipeline relies on — it
 * owns `summary` / `items` / `stems` / `sections` / `parts` and must
 * never have those clobbered by a Charter save.
 */
export async function saveSongCharter(
  songId: string,
  patch: {
    title: string;
    key: string;
    bpm: number;
    charter: unknown;
  },
): Promise<Song> {
  // Read-modify-write the record JSONB so we only touch `charter`.
  const { data: current, error: readErr } = await supabase
    .from('songs')
    .select('record')
    .eq('id', songId)
    .single();
  if (readErr) throw readErr;
  const existing = (current?.record ?? {}) as Record<string, unknown>;
  const nextRecord = { ...existing, charter: patch.charter } as unknown as Json;

  const { data, error } = await supabase
    .from('songs')
    .update({
      title: patch.title.trim(),
      key: patch.key,
      bpm: patch.bpm,
      record: nextRecord,
    })
    .eq('id', songId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
