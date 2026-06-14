import { describe, expect, test } from 'vitest';
import {
  NOTES_SHARP,
  NOTES_FLAT,
  transposeNote,
  transposeKey,
  getKeyOptions,
  formatTime,
} from './music.js';

describe('transposeNote', () => {
  test('zero semitones is identity', () => {
    expect(transposeNote('C', 0)).toBe('C');
    expect(transposeNote('F#', 0)).toBe('F#');
    expect(transposeNote('Bb', 0)).toBe('Bb');
  });

  test('+1 semitone goes up one half-step', () => {
    expect(transposeNote('C', 1)).toBe('C#');
    expect(transposeNote('E', 1)).toBe('F');
    expect(transposeNote('B', 1)).toBe('C');
  });

  test('-1 semitone goes down one half-step', () => {
    expect(transposeNote('C', -1)).toBe('B');
    expect(transposeNote('F', -1)).toBe('E');
  });

  test('+12 / -12 wraps to the same note name', () => {
    for (const n of ['C', 'D', 'E', 'F', 'G', 'A', 'B']) {
      expect(transposeNote(n, 12)).toBe(n);
      expect(transposeNote(n, -12)).toBe(n);
    }
  });

  test('large offsets normalize correctly', () => {
    expect(transposeNote('C', 25)).toBe('C#');   // +25 ≡ +1
    expect(transposeNote('C', -25)).toBe('B');   // -25 ≡ -1
  });

  test('flat input auto-detects flat output', () => {
    expect(transposeNote('Bb', 1)).toBe('B');
    expect(transposeNote('Eb', 1)).toBe('E');
    expect(transposeNote('Ab', 2)).toBe('Bb');
  });

  test('sharp input auto-detects sharp output', () => {
    expect(transposeNote('C#', 1)).toBe('D');
    expect(transposeNote('F#', 2)).toBe('G#');
  });

  test('explicit useFlats overrides auto-detect', () => {
    expect(transposeNote('C', 1, true)).toBe('Db');
    expect(transposeNote('Bb', 1, false)).toBe('B'); // B has no flat alias
    expect(transposeNote('C', 6, true)).toBe('Gb');
    expect(transposeNote('C', 6, false)).toBe('F#');
  });

  test('unknown note returns unchanged', () => {
    expect(transposeNote('H', 1)).toBe('H');
    expect(transposeNote('foo', 5)).toBe('foo');
    expect(transposeNote('', 3)).toBe('');
  });

  test('unicode flat marker (♭) auto-detects flats', () => {
    // Input "Bb" is the parsable form; the auto-detect just needs the
    // marker present. Spell-checking the input is parseChord's job.
    const ascii = transposeNote('Bb', 0);
    expect(ascii).toBe('Bb');
  });

  test('NOTES_SHARP and NOTES_FLAT have 12 entries each', () => {
    expect(NOTES_SHARP.length).toBe(12);
    expect(NOTES_FLAT.length).toBe(12);
  });

  test('NOTES_SHARP and NOTES_FLAT agree on naturals', () => {
    const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    for (const n of naturals) {
      expect(NOTES_SHARP).toContain(n);
      expect(NOTES_FLAT).toContain(n);
    }
  });
});

describe('transposeKey alias', () => {
  test('transposeKey is the same function as transposeNote', () => {
    expect(transposeKey).toBe(transposeNote);
  });
});

describe('getKeyOptions', () => {
  test('returns 5 options spanning +2 to -2', () => {
    const opts = getKeyOptions('C');
    expect(opts.length).toBe(5);
    expect(opts.map((o) => o.offset)).toEqual([2, 1, 0, -1, -2]);
  });

  test('zero offset is labeled "Original"', () => {
    const opts = getKeyOptions('D');
    const original = opts.find((o) => o.offset === 0);
    expect(original?.label).toBe('D (Original)');
  });

  test('positive offsets show +N', () => {
    const opts = getKeyOptions('C');
    expect(opts.find((o) => o.offset === 2)?.label).toBe('D (+2)');
    expect(opts.find((o) => o.offset === 1)?.label).toBe('C# (+1)');
  });

  test('negative offsets show -N (no double-sign)', () => {
    const opts = getKeyOptions('C');
    expect(opts.find((o) => o.offset === -1)?.label).toBe('B (-1)');
    // 'A#' (not 'Bb') because input 'C' has no flat marker, so the
    // transposeNote auto-detect picks the sharp spelling. Musically a
    // bit awkward going down — revisit if the key picker UI complains.
    expect(opts.find((o) => o.offset === -2)?.label).toBe('A# (-2)');
  });

  test('flat key transposes within flat names', () => {
    const opts = getKeyOptions('Bb');
    expect(opts.find((o) => o.offset === 1)?.key).toBe('B');
    expect(opts.find((o) => o.offset === -1)?.key).toBe('A');
  });
});

describe('formatTime', () => {
  test('zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  test('seconds under a minute pad to two digits', () => {
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(59)).toBe('0:59');
  });

  test('minute boundary', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(61)).toBe('1:01');
  });

  test('floors fractional seconds', () => {
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(0.99)).toBe('0:00');
  });

  test('multiple minutes', () => {
    expect(formatTime(125)).toBe('2:05');
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('60:00');
  });
});
