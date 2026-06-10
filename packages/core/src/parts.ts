/**
 * The five vocal parts a song record can carry, plus their UI color
 * mapping. This is the brand decision; Charter and Vocal Booth both read
 * `PART_COLOR` so the color of each part is identical across the suite.
 */
export const PARTS = [
  'soprano',
  'alto',
  'tenor',
  'baritone',
  'unison',
] as const;
export type Part = (typeof PARTS)[number];

export const PART_COLOR: Record<Part, string> = {
  soprano:  '#f1c40f', // yellow
  alto:     '#e74c3c', // red
  tenor:    '#16a085', // teal
  baritone: '#27ae60', // green
  unison:   '#8e44ad', // purple
};

/**
 * A predicted/tuned harmony layer for one part, structurally keyed to
 * aligned columns. The exact shape (degrees? intervals?) is finalized in
 * Phase 1's contract work; this stub keeps the part identity locked.
 */
export type PartLayer = {
  part: Part;
  /** Phase 1 expands: degrees per aligned column, render hints, etc. */
};
