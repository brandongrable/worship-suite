import type { Song } from './songs';

/**
 * Shape the prototype mixer (`WorshipMixer.jsx`) expects for the currently
 * selected song. It pre-dates the DB schema and diverges in two ways:
 *
 *   - It lumps section info inline (label, time bounds, per-part status)
 *     rather than referencing the core `Section` type.
 *   - Its `partStatus` map is keyed by harmony parts only ('soprano' …
 *     'baritone'). 'unison' is a section behavior in the mixer, not a key.
 *
 * Phase 3.1 wires real DB rows into this shape via `songToMixerSong()`.
 * Phase 4 will land Pipeline-authored sections/lyrics and the defaults
 * here will narrow to real data.
 */

export type MixerPartStatus = 'inactive' | 'unison' | 'harmony';

export type MixerHarmonyPartStatus = Record<
  'soprano' | 'alto' | 'tenor' | 'baritone',
  MixerPartStatus
>;

export type MixerSection = {
  id: string;
  label: string;
  shortLabel: string;
  startTime: number;
  endTime: number;
  partStatus: MixerHarmonyPartStatus;
};

export type MixerLyric = { start: number; end: number; text: string };

export type MixerSong = {
  id: string;
  title: string;
  artist: string;
  originalKey: string;
  bpm: number;
  time: string;
  duration: number;
  sections: MixerSection[];
  lyrics: MixerLyric[];
};

type RecordShape = {
  summary?: { beats_per_bar?: number };
};

/**
 * Map a DB song row + a runtime-measured duration (seconds, from the
 * first decoded stem) into the mixer's expected shape. Sections and
 * lyrics fall back to defaults until Pipeline writes them.
 */
export function songToMixerSong(row: Song, durationSec: number): MixerSong {
  const record = (row.record ?? {}) as RecordShape;
  const beatsPerBar = record.summary?.beats_per_bar;

  return {
    id: row.id,
    title: row.title,
    artist: '',
    originalKey: row.key,
    bpm: row.bpm,
    time: beatsPerBar ? `${beatsPerBar}/4` : '4/4',
    duration: durationSec,
    sections: [
      {
        id: 'full',
        label: 'Full Song',
        shortLabel: 'FULL',
        startTime: 0,
        endTime: durationSec,
        partStatus: {
          soprano: 'inactive',
          alto: 'inactive',
          tenor: 'inactive',
          baritone: 'inactive',
        },
      },
    ],
    lyrics: [],
  };
}
