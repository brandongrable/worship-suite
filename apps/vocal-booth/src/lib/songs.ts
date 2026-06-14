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
