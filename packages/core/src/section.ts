import type { Part } from './parts.js';

/**
 * Canonical section type vocabulary. Charter's UI uses these as the
 * SECTION_TYPES dropdown values; Vocal Booth's song library encodes
 * the same concepts via its ad-hoc `id` strings ("v1", "c2"). When
 * both apps round-trip sections through Supabase, this is the union
 * they agree on.
 *
 * PRE_CHORUS and POST_CHORUS use underscores (not hyphens) so the
 * values are valid as TS literal types without quoting. Charter's
 * legacy strings ('PRE-CHORUS') normalize to underscore form when
 * persisted.
 */
export const SECTION_TYPES = [
  'INTRO',
  'VERSE',
  'PRE_CHORUS',
  'CHORUS',
  'POST_CHORUS',
  'BRIDGE',
  'REFRAIN',
  'TAG',
  'OUTRO',
  'ENDING',
  'INSTRUMENTAL',
  'INTERLUDE',
  'VAMP',
  'TURNAROUND',
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

/**
 * Display label + waveform short code for each section type. Charter
 * writes labels (`"Verse"`) into the section editor; Vocal Booth
 * writes short codes (`"V"`) into the section bar above the mixer.
 */
export const SECTION_META: Record<SectionType, { label: string; code: string }> = {
  INTRO:        { label: 'Intro',        code: 'I'   },
  VERSE:        { label: 'Verse',        code: 'V'   },
  PRE_CHORUS:   { label: 'Pre-Chorus',   code: 'Pc'  },
  CHORUS:       { label: 'Chorus',       code: 'C'   },
  POST_CHORUS:  { label: 'Post-Chorus',  code: 'PC'  },
  BRIDGE:       { label: 'Bridge',       code: 'Br'  },
  REFRAIN:      { label: 'Refrain',      code: 'Rf'  },
  TAG:          { label: 'Tag',          code: 'Tg'  },
  OUTRO:        { label: 'Outro',        code: 'O'   },
  ENDING:       { label: 'Ending',       code: 'E'   },
  INSTRUMENTAL: { label: 'Instrumental', code: 'Ist' },
  INTERLUDE:    { label: 'Interlude',    code: 'Int' },
  VAMP:         { label: 'Vamp',         code: 'Vp'  },
  TURNAROUND:   { label: 'Turnaround',   code: 'Tn'  },
};

/**
 * Whether a given vocal part is inactive, doubling the lead in unison,
 * or singing its own harmony line in a section. Vocal Booth uses this
 * to render the section bar colors and gate stem playback.
 */
export const PART_ARRANGEMENTS = ['inactive', 'unison', 'harmony'] as const;
export type PartArrangement = (typeof PART_ARRANGEMENTS)[number];

/**
 * One chord placed above lyrics at a character offset. Charter's
 * editor produces these; the chart renderer reads them. `position` is
 * the character index into `lyrics` at which the chord is anchored.
 */
export type Chord = {
  name: string;        // 'D', 'Bm7', 'F#sus4/A'
  position: number;    // char offset into the line's lyrics
};

/**
 * A chord/lyric line within a section. Lines stack vertically inside
 * the section block. Charter is the authoritative author of these.
 */
export type ChordLine = {
  id: string;
  lyrics: string;
  chords: Chord[];
};

/**
 * The unified section record. Both apps round-trip this shape through
 * Supabase; each app populates the slots it owns:
 *
 *   - Charter writes: type, instanceNumber, lines, productionNotes,
 *     mirror config, optionally label/shortLabel overrides.
 *   - Vocal Booth writes: startTime, endTime, partStatus. It may also
 *     write label/shortLabel overrides when the auto-generated values
 *     don't match the recording's actual phrasing.
 *
 * Required fields are the section's identity (id, type, instanceNumber).
 * Everything else is optional and read defensively.
 */
export type Section = {
  /** Unique within the song. Charter generates via uid(); Vocal Booth's
   *  legacy ids ("intro", "c1") are migrated to uids on first save. */
  id: string;

  /** Section role in the form. */
  type: SectionType;

  /** Nth occurrence of this type (1, 2, 3...). 0 is reserved for
   *  one-off intros where the number reads weird ("Intro 1"). */
  instanceNumber: number;

  /** Display name override. If absent, derive via `sectionLabel()`. */
  label?: string;

  /** Compact label for the waveform bar. If absent, derive via
   *  `sectionShortLabel()`. */
  shortLabel?: string;

  // ── Temporal (Vocal Booth) ─────────────────────────────────────────
  /** Seconds from song start. */
  startTime?: number;
  /** Seconds from song start. */
  endTime?: number;

  // ── Vocal arrangement (Vocal Booth) ────────────────────────────────
  /** Per-part status for this section. Parts absent from the map are
   *  treated as 'inactive'. */
  partStatus?: Partial<Record<Part, PartArrangement>>;

  // ── Chord/lyric content (Charter) ──────────────────────────────────
  lines?: ChordLine[];
  productionNotes?: string;
  /** ID of another section whose chord chart this one mirrors. When
   *  set, the renderer reads chords from that section. */
  mirrorSourceId?: string | null;
  mirrorEnabled?: boolean;
};

/**
 * Compute the human-readable section label, respecting an explicit
 * override when the author has set one.
 *
 *   sectionLabel({ type: 'VERSE', instanceNumber: 2 }) === 'Verse 2'
 *   sectionLabel({ type: 'INTRO', instanceNumber: 0 }) === 'Intro'
 */
export function sectionLabel(s: Pick<Section, 'type' | 'instanceNumber' | 'label'>): string {
  if (s.label) return s.label;
  const base = SECTION_META[s.type].label;
  return s.instanceNumber > 0 ? `${base} ${s.instanceNumber}` : base;
}

/**
 * Compute the compact waveform label.
 *
 *   sectionShortLabel({ type: 'CHORUS', instanceNumber: 2 }) === 'C2'
 *   sectionShortLabel({ type: 'INTRO',  instanceNumber: 0 }) === 'I'
 */
export function sectionShortLabel(s: Pick<Section, 'type' | 'instanceNumber' | 'shortLabel'>): string {
  if (s.shortLabel) return s.shortLabel;
  const code = SECTION_META[s.type].code;
  return s.instanceNumber > 0 ? `${code}${s.instanceNumber}` : code;
}
