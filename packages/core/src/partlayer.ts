import type { Part } from './parts.js';

/**
 * Tracks that show up in the Vocal Booth mixer. The four harmony
 * voices (Part) plus the source tracks the lead and band were
 * recorded as. The stems bucket is keyed by these names.
 */
export const STEM_TRACKS = ['click', 'band', 'lead'] as const;
export type SourceTrack = (typeof STEM_TRACKS)[number];

/** Anything that can appear as a key in `songs.stems`. */
export type StemTrack = SourceTrack | Part;

/**
 * One note in a part's rendered line. Pipeline emits these from the
 * lyric-midi-aligner output; Vocal Booth doesn't read them directly
 * (it plays the stem audio instead), but Pipeline's review UI and
 * any future "look at the score" view do.
 */
export type PartNote = {
  /** Position in the song's aligned grid. Columns are shared across
   *  all parts, so soprano's col=5 lines up with alto's col=5 for the
   *  same lyric beat. */
  col: number;

  /** Section this note belongs to — references Section.id. */
  sectionId: string;

  /** Onset time from song start, in seconds. Authoritative for any
   *  symbolic playback (MIDI preview, score scrubbing). The actual
   *  audio playback in Vocal Booth uses the rendered stem instead. */
  onset: number;

  /** Note duration in seconds. */
  duration: number;

  /** MIDI pitch (0–127). Middle C = 60. */
  pitch: number;

  /** Lyric syllable sung on this note. Empty for melismas continuing
   *  a previous syllable, or for purely instrumental parts. */
  syllable?: string;

  /** Aligner confidence 0–1. Notes below ~0.5 surface in Pipeline's
   *  review UI for manual correction before the stem is rendered. */
  confidence?: number;
};

/**
 * The rendered harmony line for one vocal part. Both the symbolic note
 * data (notes[]) and the rendered audio (stems bucket via song.stems
 * keyed by `part`) live independently — songs can have either alone:
 *
 *   - Notes only → not yet rendered to audio; review/edit phase.
 *   - Stem only  → legacy import without symbolic data; still playable.
 *   - Both       → fully produced; the common steady state.
 */
export type PartLayer = {
  part: Part;
  notes: PartNote[];
};
