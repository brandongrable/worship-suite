#!/usr/bin/env python3
"""Monophonic melody extraction: vocal audio in, MIDI file out.

Uses torchcrepe (CREPE ported to PyTorch) to estimate the fundamental
frequency at every timestep, then quantizes the F0 contour into
discrete MIDI notes for downstream consumption by the aligner.

Key idea: CREPE is *purely monophonic* by construction — it outputs
one pitch per frame, the most prominent one. This is exactly what we
want for live-recorded worship vocals where the "lead" stem still
contains background vocal bleed and audience noise after separation.
Other tools (basic-pitch, melodyne, etc.) try to detect multiple
simultaneous pitches and would pick up the BGV harmonies as
additional notes; CREPE just tracks the dominant pitch contour.

Pipeline:
  1. Load + downmix audio to mono, resample to 16kHz (CREPE's
     trained sample rate).
  2. Run torchcrepe.predict for per-frame F0 + periodicity
     (confidence).
  3. Drop frames where confidence < threshold OR F0 is outside the
     vocal range we expect.
  4. Quantize remaining frames to nearest MIDI semitone.
  5. Apply pitch hysteresis (don't switch notes until the new pitch
     has held for several frames) — kills octave-jump jitter that
     sometimes appears at note boundaries.
  6. Run-length encode consecutive same-pitch frames into notes.
  7. Drop notes shorter than min_duration (filters out the residual
     jitter from step 5).
  8. Write the result as a MIDI file at the requested tempo.
"""
import argparse
import math
import sys


def hz_to_midi(hz: float) -> float:
    return 12.0 * math.log2(hz / 440.0) + 69.0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input', required=True,
                   help='Vocal audio file (wav, mp3, flac, etc.)')
    p.add_argument('--output', required=True,
                   help='Output MIDI file path')
    p.add_argument('--confidence', type=float, default=0.5,
                   help='Minimum CREPE confidence (0..1). Lower = '
                        'more notes detected, but more spurious. '
                        'Vocal sustained notes typically score >0.9.')
    p.add_argument('--min-duration', type=float, default=0.05,
                   help='Minimum note duration in seconds. Below this '
                        'are dropped as jitter / artifacts.')
    p.add_argument('--fmin', type=float, default=65.0,
                   help='Lowest expected pitch in Hz (~C2 = 65). Frames '
                        'below this are treated as out of range.')
    p.add_argument('--fmax', type=float, default=1100.0,
                   help='Highest expected pitch in Hz (~C#6 = 1109). '
                        'Frames above this are treated as out of range.')
    p.add_argument('--hop-length-ms', type=float, default=10.0,
                   help='CREPE analysis hop length in milliseconds. '
                        'Smaller = finer time resolution + slower run.')
    p.add_argument('--model', default='full', choices=['tiny', 'full'],
                   help='CREPE model size. "full" is accurate but '
                        'slower; "tiny" is ~10x faster, ~3%% worse pitch.')
    p.add_argument('--hysteresis-frames', type=int, default=3,
                   help='Number of consecutive same-pitch frames before '
                        'we accept a note change. Suppresses octave-jump '
                        'jitter at note boundaries.')
    p.add_argument('--bpm', type=float, default=120.0,
                   help='Tempo for the output MIDI. Affects only how '
                        'note durations are encoded as ticks; the wall-'
                        'clock timing is preserved exactly.')
    p.add_argument('--batch-size', type=int, default=128,
                   help='torchcrepe batch size. Bigger = faster on GPU, '
                        'more RAM. CREPE-full on CPU with batch=512 can '
                        'use 8GB+ and OOM the machine; 128 keeps peak '
                        'under ~2GB for typical service-length audio.')
    args = p.parse_args()

    # Late imports so --help is fast even when the env is broken.
    try:
        import torch
        import torchaudio
        import torchcrepe
        import mido
    except ImportError as e:
        print(f"missing dependency: {e}", file=sys.stderr)
        print("install with: pip install torchcrepe mido", file=sys.stderr)
        return 2

    print(f"loading audio: {args.input}", flush=True)
    audio, sr = torchaudio.load(args.input)
    duration_sec = audio.shape[1] / sr
    print(f"  {audio.shape[0]} channels, {sr} Hz, {duration_sec:.1f}s",
          flush=True)

    # CREPE expects mono 16kHz.
    if audio.shape[0] > 1:
        audio = audio.mean(dim=0, keepdim=True)
    if sr != 16000:
        print(f"resampling {sr} → 16000 Hz", flush=True)
        audio = torchaudio.functional.resample(audio, sr, 16000)
        sr = 16000

    hop = max(1, int(sr * args.hop_length_ms / 1000.0))

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"running CREPE ({args.model} model) on {device}…", flush=True)

    # torchcrepe.predict returns (pitch, periodicity) when
    # return_periodicity=True. Internally it tqdm-progress-bars the
    # batches; piping its stderr is how Pipeline shows progress.
    pitch, periodicity = torchcrepe.predict(
        audio,
        sr,
        hop_length=hop,
        fmin=args.fmin,
        fmax=args.fmax,
        model=args.model,
        batch_size=args.batch_size,
        device=device,
        return_periodicity=True,
    )

    # Smooth the periodicity estimate over a short window — single-
    # frame confidence dips during sustained notes (vocal vibrato,
    # breath transients) wouldn't otherwise survive the threshold.
    periodicity = torchcrepe.filter.median(periodicity, 3)
    # Light smoothing of the pitch trace itself to reduce flutter
    # before quantization. 3 frames @ 10ms = 30ms window; small
    # enough to not soften real note transitions.
    pitch = torchcrepe.filter.mean(pitch, 3)

    f0 = pitch.squeeze().detach().cpu().numpy()
    conf = periodicity.squeeze().detach().cpu().numpy()
    n_frames = len(f0)
    print(f"  {n_frames} frames analyzed", flush=True)

    # Per-frame MIDI pitch (None = below confidence / out of range).
    raw_pitch_per_frame = []
    for hz, c in zip(f0, conf):
        if c < args.confidence or hz < args.fmin or hz > args.fmax \
                or not math.isfinite(hz):
            raw_pitch_per_frame.append(None)
        else:
            raw_pitch_per_frame.append(round(hz_to_midi(float(hz))))

    # Hysteresis: require N consecutive frames of the same pitch
    # before committing to a note change. Smooths over single-frame
    # octave glitches that occasionally appear right at vowel onsets.
    stable_pitch_per_frame = []
    current = None
    candidate = None
    candidate_count = 0
    for p_raw in raw_pitch_per_frame:
        if p_raw == current:
            candidate = None
            candidate_count = 0
        else:
            if p_raw == candidate:
                candidate_count += 1
            else:
                candidate = p_raw
                candidate_count = 1
            if candidate_count >= args.hysteresis_frames:
                current = candidate
                candidate = None
                candidate_count = 0
        stable_pitch_per_frame.append(current)

    # Run-length encode → list of (start_sec, end_sec, midi_pitch).
    times = [i * hop / sr for i in range(n_frames)]
    end_of_song = audio.shape[1] / sr
    notes = []
    current = None
    current_start_idx = 0
    for i, p in enumerate(stable_pitch_per_frame):
        if p != current:
            if current is not None:
                notes.append((times[current_start_idx], times[i], current))
            current = p
            current_start_idx = i
    if current is not None:
        notes.append((times[current_start_idx], end_of_song, current))

    # Minimum-duration filter (kills residual jitter).
    notes = [n for n in notes if (n[1] - n[0]) >= args.min_duration]
    print(f"  {len(notes)} notes after quantization + filtering",
          flush=True)

    # ── MIDI emit ──────────────────────────────────────────────
    mid = mido.MidiFile()
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage('track_name', name='Lead Vocal'))
    track.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(args.bpm)))

    ticks_per_beat = mid.ticks_per_beat
    seconds_per_tick = (60.0 / args.bpm) / ticks_per_beat

    # Build the (tick, message) event list, then sort + delta-encode.
    events = []
    for start_sec, end_sec, p in notes:
        start_tick = max(0, int(round(start_sec / seconds_per_tick)))
        end_tick = max(start_tick + 1, int(round(end_sec / seconds_per_tick)))
        events.append((start_tick, 0, mido.Message('note_on', note=p, velocity=80)))
        events.append((end_tick, 1, mido.Message('note_off', note=p, velocity=80)))
    # Sort by tick, then prefer note_off before note_on at the same
    # tick so abutting notes don't double-trigger.
    events.sort(key=lambda e: (e[0], e[1]))

    last_tick = 0
    for tick, _kind, msg in events:
        msg.time = tick - last_tick
        track.append(msg)
        last_tick = tick

    mid.save(args.output)
    print(f"wrote {args.output}", flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
