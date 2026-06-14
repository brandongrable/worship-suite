import { describe, expect, test } from 'vitest';
import {
  SECTION_TYPES,
  SECTION_META,
  sectionLabel,
  sectionShortLabel,
} from './section.js';

describe('SECTION_TYPES + SECTION_META', () => {
  test('every SECTION_TYPE has a META entry', () => {
    for (const t of SECTION_TYPES) {
      expect(SECTION_META[t]).toBeDefined();
      expect(SECTION_META[t].label).toBeTruthy();
      expect(SECTION_META[t].code).toBeTruthy();
    }
  });

  test('META covers exactly the SECTION_TYPES set', () => {
    expect(Object.keys(SECTION_META).sort()).toEqual([...SECTION_TYPES].sort());
  });

  test('codes are short (≤4 chars) for waveform display', () => {
    for (const t of SECTION_TYPES) {
      expect(SECTION_META[t].code.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('sectionLabel', () => {
  test('derives label from type + instanceNumber', () => {
    expect(sectionLabel({ type: 'VERSE', instanceNumber: 1 })).toBe('Verse 1');
    expect(sectionLabel({ type: 'CHORUS', instanceNumber: 2 })).toBe('Chorus 2');
    expect(sectionLabel({ type: 'PRE_CHORUS', instanceNumber: 1 })).toBe('Pre-Chorus 1');
    expect(sectionLabel({ type: 'POST_CHORUS', instanceNumber: 3 })).toBe('Post-Chorus 3');
  });

  test('instanceNumber 0 drops the number', () => {
    expect(sectionLabel({ type: 'INTRO', instanceNumber: 0 })).toBe('Intro');
    expect(sectionLabel({ type: 'OUTRO', instanceNumber: 0 })).toBe('Outro');
    expect(sectionLabel({ type: 'BRIDGE', instanceNumber: 0 })).toBe('Bridge');
  });

  test('explicit label overrides derivation', () => {
    expect(
      sectionLabel({ type: 'VERSE', instanceNumber: 1, label: 'Opening Verse' }),
    ).toBe('Opening Verse');
    // Override beats even an instanceNumber=0 case.
    expect(
      sectionLabel({ type: 'INTRO', instanceNumber: 0, label: 'Pickup' }),
    ).toBe('Pickup');
  });
});

describe('sectionShortLabel', () => {
  test('derives short code from type + instanceNumber', () => {
    expect(sectionShortLabel({ type: 'VERSE', instanceNumber: 1 })).toBe('V1');
    expect(sectionShortLabel({ type: 'CHORUS', instanceNumber: 2 })).toBe('C2');
    expect(sectionShortLabel({ type: 'BRIDGE', instanceNumber: 3 })).toBe('Br3');
  });

  test('instanceNumber 0 drops the number', () => {
    expect(sectionShortLabel({ type: 'INTRO', instanceNumber: 0 })).toBe('I');
    expect(sectionShortLabel({ type: 'TURNAROUND', instanceNumber: 0 })).toBe('Tn');
  });

  test('explicit shortLabel overrides derivation', () => {
    expect(
      sectionShortLabel({ type: 'VERSE', instanceNumber: 1, shortLabel: 'V1a' }),
    ).toBe('V1a');
    expect(
      sectionShortLabel({ type: 'CHORUS', instanceNumber: 2, shortLabel: '🎵' }),
    ).toBe('🎵');
  });
});
