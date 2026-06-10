# Vocal Booth

Mobile-first web/PWA — the team member picks a setlist, picks their
part, and practices against the stems in any key.

## Drop point for the React mockup

This folder is the destination for the existing Vocal Booth React
mockup. Two ways to import it:

1. **As a full project** — drop the entire mockup project (its own
   `package.json`, vite config, `src/`, etc.) into this folder. If
   `name` in its `package.json` becomes `@worship/vocal-booth`, pnpm
   picks it up as a workspace member automatically.
2. **As source files only** — drop the `src/` (or equivalent) into
   `apps/vocal-booth/src/` and let me wire up `package.json`, Vite
   config, and `@worship/core` dependency.

Either way is fine; just tell me which form arrives.

## Phase 3 (planned)

- Connect to Supabase (`@worship/db`) for `songs`, `setlists`,
  `setlist_songs`, stems bucket.
- Replace mock/local stems with real ones; wire the Web Audio mixer
  (waveform, section loops, transpose, Quick Mix presets, part
  selector) to live data.
- Private-first visibility; shared songs surface to recipients only.
- First usable product. The full "I sing alto, practice against my
  part" experience completes once harmony parts arrive in Phase 4.
