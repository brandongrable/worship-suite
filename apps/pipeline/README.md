# Pipeline

Tauri desktop app — the *producer* in the suite. Ingests a recording,
runs the automated stages (Demucs → WhisperX → aligner), brackets the
two manual seams (Operation A: melody MIDI in Logic; Operation B:
harmony tuning in Logic + SynthV render), and publishes the finished
song record + stems to Supabase.

## Current state

Empty. The Tauri scaffold lands in Phase 2; it needs:

- Rust + Cargo installed locally (`rustup`).
- `pnpm create tauri-app` to drop a Tauri + Vite + React shell here.
- Then a thin orchestration layer: subprocess Demucs, WhisperX, aligner;
  preview each intermediate artifact (stems, MIDI, WhisperX timing,
  aligned MusicXML, sidecar flags); publish at the end.

## Why a desktop app and not a web app

Audio stays local. The producer's workflow already lives in Logic and
SynthV — a desktop tool slots in there with no context-switch tax. The
review-checklist UI from `aligner/review/index.html` will be absorbed
into this app as a native panel rather than running as a separate
localhost server.
