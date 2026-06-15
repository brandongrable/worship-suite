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

/**
 * Look up a single song by id. RLS still filters server-side, so this
 * returns null when the song doesn't exist or isn't visible to the
 * current user (deleted, revoked share, etc.). Used by the restore-
 * last-session path on app load.
 */
export async function fetchSongById(id: string): Promise<Song | null> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
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

export type StemUploadAttempt = {
  track: string;
  file: File;
};

export type StemUploadOutcome =
  | { track: string; file: File; ok: true; storageKey: string }
  | { track: string; file: File; ok: false; error: string };

/**
 * Best-effort guess of which stem slot a given filename belongs to,
 * based on case-insensitive substring matches. Returns null if no
 * confident match. Order matters — multi-word forms first so
 * "Lead Vocal.mp3" lands as `lead` (not as something matching
 * "vocal" against another slot), and "Sop (Melody)" matches
 * `soprano` (not `lead`).
 */
export function guessTrackFromFilename(filename: string): string | null {
  const base = filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '');
  if (base.includes('click') || base.includes('cuet') || base.includes('cue ')) {
    return 'click';
  }
  // Harmony parts before "lead/vocal" so "Soprano (Melody Vocal)"
  // resolves to soprano, not lead.
  if (base.includes('sopran') || /(?:^|[^a-z])sop(?:$|[^a-z])/.test(base)) {
    return 'soprano';
  }
  if (base.includes('alto')) return 'alto';
  if (base.includes('tenor') || /(?:^|[^a-z])ten(?:$|[^a-z])/.test(base)) {
    return 'tenor';
  }
  if (base.includes('baritone') || base.includes('bariton')) return 'baritone';
  if (base.includes('lead') || base.includes('vocal') || base.includes('melody')) {
    return 'lead';
  }
  if (base.includes('band') || base.includes('instrument')) return 'band';
  return null;
}

/**
 * Upload many stems in one pass: parallel storage PUTs, then a SINGLE
 * patch to `songs.record.stems` so concurrent uploads don't clobber
 * each other (the per-file `uploadAndRegisterStem` does read-modify-
 * write on `record` and would lose stems if called in parallel).
 *
 * Returns one outcome per attempted upload, plus the updated row (or
 * null if every upload failed and no patch was applied).
 */
export async function uploadStemsBatch(
  song: Song,
  attempts: StemUploadAttempt[],
): Promise<{ outcomes: StemUploadOutcome[]; song: Song | null }> {
  if (attempts.length === 0) return { outcomes: [], song: null };

  const outcomes = await Promise.all(
    attempts.map(async ({ track, file }): Promise<StemUploadOutcome> => {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
      if (!AUDIO_EXT_ALLOWLIST.includes(ext as (typeof AUDIO_EXT_ALLOWLIST)[number])) {
        return { track, file, ok: false, error: `Unsupported extension .${ext}` };
      }
      const objectPath = `${song.id}/${track}.${ext}`;
      const { error } = await supabase.storage
        .from('stems')
        .upload(objectPath, file, {
          upsert: true,
          contentType: file.type || `audio/${ext}`,
        });
      if (error) {
        return { track, file, ok: false, error: error.message };
      }
      return { track, file, ok: true, storageKey: `stems/${objectPath}` };
    }),
  );

  const successful = outcomes.filter(
    (o): o is Extract<StemUploadOutcome, { ok: true }> => o.ok,
  );
  if (successful.length === 0) return { outcomes, song: null };

  const existing = (song.record ?? {}) as Record<string, unknown>;
  const existingStems = (existing.stems ?? {}) as Record<string, string>;
  const nextStems = { ...existingStems };
  for (const ok of successful) {
    nextStems[ok.track] = ok.storageKey;
  }
  const nextRecord = { ...existing, stems: nextStems } as unknown as Song['record'];

  const { data, error } = await supabase
    .from('songs')
    .update({ record: nextRecord })
    .eq('id', song.id)
    .select()
    .single();
  if (error) {
    // Storage uploads succeeded but the patch failed; mark them
    // failed so the caller knows the manifest is out of sync.
    return {
      outcomes: outcomes.map((o) =>
        o.ok ? { ...o, ok: false as const, error: `record patch failed: ${error.message}` } : o,
      ),
      song: null,
    };
  }
  return { outcomes, song: data };
}

/**
 * Patch the song's sections array under `record.sections`. Used by
 * the SongDetail SectionsPanel when an owner authors sections by
 * hand — until Pipeline writes them automatically from MusicXML.
 * Leaves every other top-level key in `record` untouched (read-
 * modify-write semantics, same as Charter's saveSongCharter).
 */
export async function saveSongSections(
  song: Song,
  sections: unknown[],
): Promise<Song> {
  const existing = (song.record ?? {}) as Record<string, unknown>;
  const nextRecord = { ...existing, sections } as unknown as Song['record'];
  const { data, error } = await supabase
    .from('songs')
    .update({ record: nextRecord })
    .eq('id', song.id)
    .select()
    .single();
  if (error) throw error;
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
