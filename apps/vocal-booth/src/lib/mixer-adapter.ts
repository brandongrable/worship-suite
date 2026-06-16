import { sectionLabel, sectionShortLabel, type Section } from '@worship/core';
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
 * Phase 3.1 wired real DB rows into this shape via `songToMixerSong()`.
 * Phase 4 anticipates Pipeline writing `record.sections: Section[]` and
 * `record.lyrics: MixerLyric[]` — when present, the adapter normalizes
 * them; when absent, it falls back to a synthetic "Full Song" block and
 * an empty lyrics array.
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

export type MixerPartNote = {
  col: number;
  sectionId: string;
  onset: number;
  duration: number;
  pitch: number;
  syllable?: string;
  confidence?: number;
};

export type MixerPart = {
  part: string;
  notes: MixerPartNote[];
};

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
  parts: MixerPart[];
};

type RecordShape = {
  summary?: { beats_per_bar?: number };
  sections?: unknown;
  lyrics?: unknown;
  parts?: unknown;
};

const HARMONY_KEYS = ['soprano', 'alto', 'tenor', 'baritone'] as const;
const ALL_INACTIVE: MixerHarmonyPartStatus = {
  soprano: 'inactive',
  alto: 'inactive',
  tenor: 'inactive',
  baritone: 'inactive',
};

/**
 * Map a DB song row + a runtime-measured duration (seconds, from the
 * first decoded stem) into the mixer's expected shape. Sections and
 * lyrics use real data from `record` when present, defaults otherwise.
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
    sections: buildSections(record.sections, durationSec),
    lyrics: buildLyrics(record.lyrics),
    parts: buildParts(record.parts),
  };
}

function buildParts(raw: unknown): MixerPart[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p): MixerPart | null => {
      if (!p || typeof p !== 'object') return null;
      const layer = p as { part?: unknown; notes?: unknown };
      if (typeof layer.part !== 'string') return null;
      if (!Array.isArray(layer.notes)) return null;
      const notes = layer.notes
        .map((n): MixerPartNote | null => {
          if (!n || typeof n !== 'object') return null;
          const note = n as Partial<MixerPartNote>;
          if (
            typeof note.col !== 'number' ||
            typeof note.onset !== 'number' ||
            typeof note.duration !== 'number' ||
            typeof note.pitch !== 'number'
          ) {
            return null;
          }
          return {
            col: note.col,
            sectionId: typeof note.sectionId === 'string' ? note.sectionId : '',
            onset: note.onset,
            duration: note.duration,
            pitch: note.pitch,
            syllable:
              typeof note.syllable === 'string' ? note.syllable : undefined,
            confidence:
              typeof note.confidence === 'number' ? note.confidence : undefined,
          };
        })
        .filter((n): n is MixerPartNote => n !== null)
        .sort((a, b) => a.onset - b.onset);
      return { part: layer.part, notes };
    })
    .filter((p): p is MixerPart => p !== null);
}

function buildSections(raw: unknown, durationSec: number): MixerSection[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [fullSongSection(durationSec)];
  }
  const normalized = raw
    .map((s) => normalizeSection(s as Section, durationSec))
    .filter((s): s is MixerSection => s !== null);
  if (normalized.length === 0) return [fullSongSection(durationSec)];
  return normalized.sort((a, b) => a.startTime - b.startTime);
}

function normalizeSection(s: Section, durationSec: number): MixerSection | null {
  if (!s || typeof s.id !== 'string' || typeof s.type !== 'string') return null;
  const partStatus = { ...ALL_INACTIVE };
  if (s.partStatus) {
    for (const key of HARMONY_KEYS) {
      const v = s.partStatus[key];
      if (v === 'unison' || v === 'harmony') partStatus[key] = v;
    }
  }
  return {
    id: s.id,
    label: sectionLabel(s),
    shortLabel: sectionShortLabel(s),
    startTime: typeof s.startTime === 'number' ? s.startTime : 0,
    endTime: typeof s.endTime === 'number' ? s.endTime : durationSec,
    partStatus,
  };
}

function fullSongSection(durationSec: number): MixerSection {
  return {
    id: 'full',
    label: 'Full Song',
    shortLabel: 'FULL',
    startTime: 0,
    endTime: durationSec,
    partStatus: { ...ALL_INACTIVE },
  };
}

function buildLyrics(raw: unknown): MixerLyric[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is MixerLyric =>
      l != null &&
      typeof l === 'object' &&
      typeof (l as MixerLyric).start === 'number' &&
      typeof (l as MixerLyric).end === 'number' &&
      typeof (l as MixerLyric).text === 'string',
  );
}
