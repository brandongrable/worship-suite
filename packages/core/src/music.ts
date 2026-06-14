export const NOTES_SHARP: readonly string[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];
export const NOTES_FLAT: readonly string[] = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

/**
 * Transpose a single note name by N semitones.
 *
 * `useFlats` controls the output spelling. If omitted, the input is
 * inspected: notes containing "b" or "♭" round-trip as flats, everything
 * else as sharps. Pass an explicit boolean when the caller already knows
 * (e.g., Charter's transpose toggle).
 */
export function transposeNote(note: string, semi: number, useFlats?: boolean): string {
  let i = NOTES_SHARP.indexOf(note);
  if (i === -1) i = NOTES_FLAT.indexOf(note);
  if (i === -1) return note;
  const flats = useFlats ?? (note.includes('b') || note.includes('♭'));
  const out = flats ? NOTES_FLAT : NOTES_SHARP;
  return out[((i + semi) % 12 + 12) % 12]!;
}

/** Alias for callers thinking in song-key terms (Vocal Booth). */
export const transposeKey = transposeNote;

export type KeyOption = { key: string; offset: number; label: string };

/**
 * Build the ±2 semitone window around a base key, used by the Vocal Booth
 * key picker. Ordered descending (+2 → -2) to match the existing dropdown.
 */
export function getKeyOptions(baseKey: string): KeyOption[] {
  const opts: KeyOption[] = [];
  for (let i = 2; i >= -2; i--) {
    const k = transposeNote(baseKey, i);
    opts.push({
      key: k,
      offset: i,
      label: i === 0 ? `${k} (Original)` : `${k} (${i > 0 ? '+' : ''}${i})`,
    });
  }
  return opts;
}

/** Format seconds as m:ss (e.g., 65.4 → "1:05"). */
export function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}
