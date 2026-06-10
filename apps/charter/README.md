# Charter

The worship leader's chart authoring + presentation surface.

## Current state

`index.html` is the Phase-0 prototype: a single-file React + Babel +
Tailwind page loaded entirely via CDN, no build step. It has the real
features (pdf.js chord parsing, chord-to-lyric anchors, transpose,
section mirroring, session JSON, 50-step undo/redo, drag + arrow-key
repositioning, print-to-PDF) but is not yet wired to the Supabase
record contract — that's Phase 5.

You can open `index.html` directly in a browser today, no install.

## Phase 5 (planned)

- Migrate into a proper Vite + React + TypeScript app inside this
  workspace so it can depend on `@worship/core` types.
- Point at the normalized song record (read) instead of session JSON.
- Resolve the two-chart-input convergence: the record's
  melody/lyric/harmony layer comes from the Pipeline; the chord layer
  keeps coming from Charter's own pdf.js parsing.
- Light text edits write back to the record; structural changes loop
  back to the Pipeline.
