#!/usr/bin/env python3
"""Forced alignment of a known lyric script to vocal audio using WhisperX.

The default WhisperX pipeline does transcribe (Whisper) → align (Wav2Vec2).
The transcribe step is a guess: for worship audio where the lyrics are
known in advance, that guess introduces errors (rhyming words confused,
proper names dropped, mumbled phrases hallucinated). When you already
know the script, transcription is the wrong tool.

This helper skips transcribe entirely. It loads the audio, loads the
Wav2Vec2 align model, builds a single segment spanning the full audio
that contains the user-provided lyric text verbatim, then asks the
alignment model to distribute those words across the timeline.

Output JSON shape exactly matches the existing
`whisperx --output_format json` output that the aligner consumes:
  {"segments": [{"start": s, "end": e, "text": "...", "words": [...]}]}
"""
import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input', required=True,
                   help='Audio file (typically the lead vocal stem).')
    p.add_argument('--script', required=True,
                   help='Plain-text file of the known lyrics. Line breaks '
                        'are collapsed to spaces; punctuation is preserved.')
    p.add_argument('--output', required=True,
                   help='Output JSON path. Matches the schema the aligner '
                        'expects from `whisperx --output_format json`.')
    p.add_argument('--language', default='en',
                   help='Language code passed to the Wav2Vec2 align model.')
    args = p.parse_args()

    # Late imports so --help is fast even when the env is broken.
    try:
        import whisperx
        import torch
    except ImportError as e:
        print(f"missing dependency: {e}", file=sys.stderr)
        print("install with: pip install whisperx", file=sys.stderr)
        return 2

    script_path = Path(args.script)
    if not script_path.exists():
        print(f"script file not found: {script_path}", file=sys.stderr)
        return 3
    script_text = script_path.read_text(encoding='utf-8').strip()
    if not script_text:
        print("script file is empty", file=sys.stderr)
        return 3
    # Collapse any whitespace runs to single spaces so the align model
    # sees a clean stream of words and not stray newlines/tabs.
    script_text = ' '.join(script_text.split())

    print(f"loading audio: {args.input}", flush=True)
    audio = whisperx.load_audio(args.input)
    duration = len(audio) / 16000.0  # WhisperX/Wav2Vec2 fixed sample rate
    print(f"  {duration:.1f}s of audio", flush=True)

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"loading Wav2Vec2 align model ({args.language}) on {device}…",
          flush=True)
    align_model, metadata = whisperx.load_align_model(
        language_code=args.language, device=device)

    # Single segment spanning the full audio; the align model distributes
    # words within. WhisperX expects a list of dicts with start/end/text.
    segments = [{
        'start': 0.0,
        'end': duration,
        'text': script_text,
    }]

    n_words = len(script_text.split())
    print(f"force-aligning {n_words} words…", flush=True)
    result = whisperx.align(
        segments,
        align_model,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )

    # whisperx.align returns {'segments': [...], 'word_segments': [...]}.
    # The aligner reads word_segments (flat list of all words) as its
    # primary input; segments is kept for parity with the CLI output.
    out = {
        'segments': result['segments'],
        'word_segments': result.get('word_segments', []),
    }
    Path(args.output).write_text(json.dumps(out), encoding='utf-8')
    print(f"wrote {args.output} ({len(out['word_segments'])} aligned words)",
          flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
