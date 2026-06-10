import type { Visibility } from './visibility.js';
import type { PartLayer } from './parts.js';

/**
 * The normalized song record. This is the contract Charter and Vocal
 * Booth read; only the Pipeline writes it.
 *
 * Phase 0 locks just identity, ownership, key/tempo, and visibility.
 * Phase 1 expands `sections`, `lyrics`, the full part layers, and the
 * stem manifest into rigorous shapes.
 */
export type SongRecord = {
  id: string;
  owner_id: string;
  title: string;
  key: string;          // e.g. 'B', 'Eb', 'F#'
  bpm: number;
  lead_gender: 'male' | 'female';
  visibility: Visibility;
  created_at: string;   // ISO timestamp
  updated_at: string;   // ISO timestamp

  /** Phase 1 expands. */
  sections?: unknown;
  /** Phase 1 expands. */
  lyrics?: unknown;
  /** Phase 1 expands; will be a list of typed PartLayer. */
  parts?: PartLayer[];
  /** Phase 1 expands. Maps part/track id → storage path under stems bucket. */
  stems?: Record<string, string>;
};

export type Setlist = {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
};

export type SetlistSong = {
  setlist_id: string;
  song_id: string;
  position: number;
};

export type SongShare = {
  song_id: string;
  user_id: string;
  can_edit: boolean;
  created_at: string;
};
