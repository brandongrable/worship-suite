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

/**
 * Brand palette for vocal parts. Tuned against the Vocal Booth dark UI
 * (verified visually); reads correctly on light backgrounds too.
 */
export const PART_COLOR: Record<Part, string> = {
  soprano:  '#E8C840', // mustard yellow
  alto:     '#D94545', // brick red
  tenor:    '#4FBCD0', // cyan-teal
  baritone: '#5B8C3E', // olive green
  unison:   '#9B6AD8', // lavender
};

/**
 * The four parts that sing harmony lines (everything except unison,
 * which describes a section behavior rather than a distinct layer).
 */
export const HARMONY_PARTS = ['soprano', 'alto', 'tenor', 'baritone'] as const;
export type HarmonyPart = (typeof HARMONY_PARTS)[number];
