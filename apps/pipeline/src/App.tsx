import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';
import './App.css';

type Health = { ok: boolean; rust: string };
type PythonInfo = { found: boolean; version: string | null; error: string | null };
type StageTool = { found: boolean; version: string | null; error: string | null };
type AlignerResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  out_path: string;
};

type DemucsResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  output_dir: string;
  stems: string[];
};

type WhisperXResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  json_path: string;
};

type DeepFilterNetResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  output_path: string;
};

type AudioSeparatorResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  stems: string[];
};

type ExtractMelodyResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  midi_path: string;
};

type CacheStatus = {
  cached: boolean;
  artifact: string | null;
  detail: string[];
};

// Inline descriptors for the Demucs models we expose. Both the
// option's hover tooltip and the always-visible hint below the
// dropdown read from here so they stay in sync.
const DEMUCS_MODEL_INFO: Record<
  string,
  { label: string; short: string; long: string }
> = {
  htdemucs: {
    label: 'htdemucs',
    short: 'Recommended · current default · fast + clean',
    long:
      'Hybrid Transformer Demucs v4. Time + spectrogram domain. ~80MB, ~2min per song on CPU. Best general-purpose choice.',
  },
  htdemucs_ft: {
    label: 'htdemucs_ft',
    short: 'Fine-tuned · highest quality · ~4× slower',
    long:
      'Per-stem fine-tuned weights. Marginally cleaner vocals than htdemucs, but runs the model 4× (once per stem). Worth it only when bleed is unacceptable.',
  },
  mdx_extra: {
    label: 'mdx_extra',
    short: 'Older v3 · spectrogram-only · MDX 2021 winner',
    long:
      'Demucs v3 era. Spectrogram-only, different artifact profile than htdemucs. Mostly historical at this point.',
  },
  mdx_extra_q: {
    label: 'mdx_extra_q',
    short: 'Quantized mdx_extra · smaller download, lower quality',
    long:
      'Quantized version of mdx_extra. Useful if disk space matters; otherwise skip.',
  },
};

type ReviewItem = {
  kind: string; // 'low_confidence' | 'long_run' | ...
  word: string;
  word_index: number;
  time_sec: number;
  measure: number;
  owned_notes: number;
  score?: number;
  note: string;
};

type ReviewSidecar = {
  song?: string;
  source_midi?: string;
  source_json?: string;
  output_musicxml?: string;
  summary: {
    notes_total: number;
    words_total: number;
    word_start_notes: number;
    continuation_notes: number;
    instrumental_notes: number;
    measure_count: number;
    tempo_bpm: number;
    ticks_per_beat: number;
    key_fifths: number;
    beats_per_bar: number;
    divisions: number;
  };
  items: ReviewItem[];
  structure_check: StructureCheck | null;
};

type StructureCheck = {
  ok: boolean;
  message: string;
  expected_words: number;
  actual_words: number;
  actual_notes: number;
  suspect_section: string | null;
  suggested_repeats: number | null;
};

type PublishConfig = {
  has_url: boolean;
  has_service_key: boolean;
  has_producer_id: boolean;
  url_host: string | null;
};

type PublishResult = {
  id: string;
  owner_id: string;
  title: string;
};

type StemTrack =
  | 'click'
  | 'band'
  | 'lead'
  | 'soprano'
  | 'alto'
  | 'tenor'
  | 'baritone';

const STEM_TRACKS: StemTrack[] = [
  'click',
  'band',
  'lead',
  'soprano',
  'alto',
  'tenor',
  'baritone',
];

type UploadStemResult = {
  storage_key: string;
  bytes: number;
  content_type: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function deriveOutPath(midiPath: string): string {
  const lastSep = Math.max(midiPath.lastIndexOf('/'), midiPath.lastIndexOf('\\'));
  const dir = lastSep >= 0 ? midiPath.slice(0, lastSep + 1) : '';
  const base = lastSep >= 0 ? midiPath.slice(lastSep + 1) : midiPath;
  const stem = base.replace(/\.(mid|midi)$/i, '');
  return dir + stem + '-aligned.musicxml';
}

function deriveReviewPath(musicxmlPath: string): string {
  return musicxmlPath.replace(/\.musicxml$/i, '.review.json');
}

function fifthsToKey(fifths: number): string {
  // Major-key spelling for the circle of fifths. Negative = flats.
  const keys = [
    'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F',
    'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#',
  ];
  const idx = fifths + 7;
  return idx >= 0 && idx < keys.length ? keys[idx]! : `${fifths} fifths`;
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  const [python, setPython] = useState<PythonInfo | null>(null);
  const [pythonChecking, setPythonChecking] = useState(false);
  const [pythonErr, setPythonErr] = useState<string | null>(null);

  const [alignerDir, setAlignerDir] = useState<string | null>(null);
  const [midi, setMidi] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [structurePath, setStructurePath] = useState<string | null>(null);
  const [outPath, setOutPath] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AlignerResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  const [review, setReview] = useState<ReviewSidecar | null>(null);
  const [reviewPath, setReviewPath] = useState<string | null>(null);

  const [publishCfg, setPublishCfg] = useState<PublishConfig | null>(null);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishLead, setPublishLead] = useState<'male' | 'female'>('male');
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishErr, setPublishErr] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const [stemTrack, setStemTrack] = useState<StemTrack>('lead');
  const [stemFile, setStemFile] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [uploadedStems, setUploadedStems] = useState<
    Array<{ track: string; storage_key: string; bytes: number }>
  >([]);

  // Phase 7: Demucs source-separation stage.
  const [demucsCheck, setDemucsCheck] = useState<StageTool | null>(null);
  const [demucsChecking, setDemucsChecking] = useState(false);
  const [demucsInput, setDemucsInput] = useState<string | null>(null);
  const [demucsOutDir, setDemucsOutDir] = useState<string | null>(null);
  const [demucsModel, setDemucsModel] = useState<string>('htdemucs');
  const [demucsMode, setDemucsMode] = useState<'two_stems_vocals' | 'four_stems'>(
    'two_stems_vocals',
  );
  const [demucsRunning, setDemucsRunning] = useState(false);
  const [demucsResult, setDemucsResult] = useState<DemucsResult | null>(null);
  const [demucsErr, setDemucsErr] = useState<string | null>(null);
  const [demucsCache, setDemucsCache] = useState<CacheStatus | null>(null);
  const [demucsPercent, setDemucsPercent] = useState<number | null>(null);

  // Phase 7: DeepFilterNet noise suppression (chain step 2 — runs on
  // Demucs's vocals.wav before MDX karaoke separation).
  const [dfnCheck, setDfnCheck] = useState<StageTool | null>(null);
  const [dfnChecking, setDfnChecking] = useState(false);
  const [dfnInput, setDfnInput] = useState<string | null>(null);
  const [dfnOutDir, setDfnOutDir] = useState<string | null>(null);
  const [dfnAttenDb, setDfnAttenDb] = useState<number>(60);
  const [dfnRunning, setDfnRunning] = useState(false);
  const [dfnResult, setDfnResult] = useState<DeepFilterNetResult | null>(null);
  const [dfnErr, setDfnErr] = useState<string | null>(null);
  const [dfnCache, setDfnCache] = useState<CacheStatus | null>(null);

  // Phase 7: audio-separator (UVR) — lead vs background vocal isolation
  // (chain step 3 — runs on the denoised vocals from DeepFilterNet).
  const [asepCheck, setAsepCheck] = useState<StageTool | null>(null);
  const [asepChecking, setAsepChecking] = useState(false);
  const [asepInput, setAsepInput] = useState<string | null>(null);
  const [asepOutDir, setAsepOutDir] = useState<string | null>(null);
  // Default to the karaoke model — the producer asked for lead-vs-
  // backing-vocal separation, and that's what KARA_2 is built for.
  const [asepModel, setAsepModel] = useState<string>(
    'UVR_MDXNET_KARA_2.onnx',
  );
  const [asepRunning, setAsepRunning] = useState(false);
  const [asepResult, setAsepResult] = useState<AudioSeparatorResult | null>(null);
  const [asepErr, setAsepErr] = useState<string | null>(null);
  const [asepCache, setAsepCache] = useState<CacheStatus | null>(null);
  const [asepPercent, setAsepPercent] = useState<number | null>(null);

  // Phase 7: extract-melody (CREPE → MIDI). Replaces Synthesizer V's
  // pitch-extraction step in the producer workflow.
  const [melodyCheck, setMelodyCheck] = useState<StageTool | null>(null);
  const [melodyChecking, setMelodyChecking] = useState(false);
  const [melodyInput, setMelodyInput] = useState<string | null>(null);
  const [melodyOutput, setMelodyOutput] = useState<string | null>(null);
  const [melodyConfidence, setMelodyConfidence] = useState<number>(0.5);
  const [melodyMinDuration, setMelodyMinDuration] = useState<number>(0.05);
  const [melodyModel, setMelodyModel] = useState<'full' | 'tiny'>('full');
  const [melodyRunning, setMelodyRunning] = useState(false);
  const [melodyResult, setMelodyResult] = useState<ExtractMelodyResult | null>(null);
  const [melodyErr, setMelodyErr] = useState<string | null>(null);
  const [melodyCache, setMelodyCache] = useState<CacheStatus | null>(null);
  const [melodyPercent, setMelodyPercent] = useState<number | null>(null);

  // Phase 7: WhisperX transcription stage.
  const [whisperxCheck, setWhisperxCheck] = useState<StageTool | null>(null);
  const [whisperxChecking, setWhisperxChecking] = useState(false);
  const [whisperxInput, setWhisperxInput] = useState<string | null>(null);
  const [whisperxOutDir, setWhisperxOutDir] = useState<string | null>(null);
  const [whisperxModel, setWhisperxModel] = useState<string>('base');
  const [whisperxLanguage, setWhisperxLanguage] = useState<string>('en');
  const [whisperxRunning, setWhisperxRunning] = useState(false);
  const [whisperxResult, setWhisperxResult] = useState<WhisperXResult | null>(null);
  const [whisperxErr, setWhisperxErr] = useState<string | null>(null);
  const [whisperxCache, setWhisperxCache] = useState<CacheStatus | null>(null);

  // Auto-probe the cache when the user changes input / output / model.
  // Cheap: filesystem stat only; no subprocess.
  useEffect(() => {
    if (!demucsInput || !demucsOutDir) {
      setDemucsCache(null);
      return;
    }
    invoke<CacheStatus>('demucs_cache_status', {
      inputAudio: demucsInput,
      outputDir: demucsOutDir,
      model: demucsModel,
    })
      .then(setDemucsCache)
      .catch(() => setDemucsCache(null));
  }, [demucsInput, demucsOutDir, demucsModel]);

  useEffect(() => {
    if (!whisperxInput || !whisperxOutDir) {
      setWhisperxCache(null);
      return;
    }
    invoke<CacheStatus>('whisperx_cache_status', {
      inputAudio: whisperxInput,
      outputDir: whisperxOutDir,
    })
      .then(setWhisperxCache)
      .catch(() => setWhisperxCache(null));
  }, [whisperxInput, whisperxOutDir]);

  useEffect(() => {
    if (!dfnInput || !dfnOutDir) {
      setDfnCache(null);
      return;
    }
    invoke<CacheStatus>('deepfilternet_cache_status', {
      inputAudio: dfnInput,
      outputDir: dfnOutDir,
    })
      .then(setDfnCache)
      .catch(() => setDfnCache(null));
  }, [dfnInput, dfnOutDir]);

  useEffect(() => {
    if (!asepInput || !asepOutDir) {
      setAsepCache(null);
      return;
    }
    invoke<CacheStatus>('audio_separator_cache_status', {
      inputAudio: asepInput,
      outputDir: asepOutDir,
    })
      .then(setAsepCache)
      .catch(() => setAsepCache(null));
  }, [asepInput, asepOutDir]);

  useEffect(() => {
    if (!melodyOutput) {
      setMelodyCache(null);
      return;
    }
    invoke<CacheStatus>('extract_melody_cache_status', {
      midiPath: melodyOutput,
    })
      .then(setMelodyCache)
      .catch(() => setMelodyCache(null));
  }, [melodyOutput]);

  // Subscribe to Tauri progress events emitted by the streaming
  // subprocess wrappers (demucs_separate, audio_separator_run). The
  // listeners survive the component's lifetime; each new Run resets
  // the percent state to null first, then the events drive it back
  // up. `listen` returns an unsubscribe handle that we call on
  // unmount.
  useEffect(() => {
    let unsubDemucs: (() => void) | undefined;
    let unsubAsep: (() => void) | undefined;
    listen<{ percent: number; line: string }>('demucs:progress', (event) => {
      setDemucsPercent(event.payload.percent);
    }).then((u) => {
      unsubDemucs = u;
    });
    listen<{ percent: number; line: string }>('audio-separator:progress', (event) => {
      setAsepPercent(event.payload.percent);
    }).then((u) => {
      unsubAsep = u;
    });
    let unsubMelody: (() => void) | undefined;
    listen<{ percent: number; line: string }>('extract-melody:progress', (event) => {
      setMelodyPercent(event.payload.percent);
    }).then((u) => {
      unsubMelody = u;
    });
    return () => {
      unsubDemucs?.();
      unsubAsep?.();
      unsubMelody?.();
    };
  }, []);

  useEffect(() => {
    invoke<Health>('health_check').then(setHealth).catch((e) => setHealthErr(String(e)));
    invoke<PublishConfig>('publish_config').then(setPublishCfg).catch(() => {});
  }, []);

  // Pre-fill publish title from sidecar (song name or MIDI filename) when a
  // review loads.
  useEffect(() => {
    if (!review || publishTitle) return;
    const candidate =
      review.song ||
      review.source_midi?.split(/[/\\]/).pop()?.replace(/\.(mid|midi)$/i, '') ||
      '';
    if (candidate) setPublishTitle(candidate);
  }, [review, publishTitle]);

  async function detectPython() {
    setPythonChecking(true);
    setPythonErr(null);
    try {
      setPython(await invoke<PythonInfo>('python_check'));
    } catch (e) {
      setPythonErr(String(e));
    } finally {
      setPythonChecking(false);
    }
  }

  async function detectDemucs() {
    setDemucsChecking(true);
    try {
      setDemucsCheck(await invoke<StageTool>('demucs_check'));
    } catch (e) {
      setDemucsCheck({ found: false, version: null, error: String(e) });
    } finally {
      setDemucsChecking(false);
    }
  }

  async function detectWhisperX() {
    setWhisperxChecking(true);
    try {
      setWhisperxCheck(await invoke<StageTool>('whisperx_check'));
    } catch (e) {
      setWhisperxCheck({ found: false, version: null, error: String(e) });
    } finally {
      setWhisperxChecking(false);
    }
  }

  async function pickDemucsInput() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setDemucsInput(selected);
  }

  async function pickDemucsOutDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') setDemucsOutDir(selected);
  }

  async function pickWhisperXInput() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setWhisperxInput(selected);
  }

  async function pickWhisperXOutDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') setWhisperxOutDir(selected);
  }

  async function runDemucs(force = false) {
    if (!demucsInput || !demucsOutDir) return;
    setDemucsRunning(true);
    setDemucsResult(null);
    setDemucsErr(null);
    setDemucsPercent(0);
    try {
      const r = await invoke<DemucsResult>('demucs_separate', {
        inputAudio: demucsInput,
        outputDir: demucsOutDir,
        model: demucsModel,
        mode: demucsMode,
        force,
      });
      setDemucsResult(r);
      // Auto-chain: if a vocals stem was produced, prefill it as
      // input to BOTH the next chain step (DeepFilterNet for noise
      // cleanup) AND WhisperX (transcription). The producer can
      // override either later; this is the default fast path.
      if (r.success) {
        const vocals = r.stems.find((p) => /vocals\.wav$/i.test(p));
        if (vocals) {
          const sep = Math.max(vocals.lastIndexOf('/'), vocals.lastIndexOf('\\'));
          const parentDir = sep > 0 ? vocals.slice(0, sep) : '';
          if (!dfnInput) setDfnInput(vocals);
          if (parentDir && !dfnOutDir) setDfnOutDir(parentDir);
          if (!whisperxInput) setWhisperxInput(vocals);
          if (parentDir && !whisperxOutDir) setWhisperxOutDir(parentDir);
        }
      }
    } catch (e) {
      setDemucsErr(String(e));
    } finally {
      setDemucsRunning(false);
    }
  }

  async function detectDeepFilterNet() {
    setDfnChecking(true);
    try {
      setDfnCheck(await invoke<StageTool>('deepfilternet_check'));
    } catch (e) {
      setDfnCheck({ found: false, version: null, error: String(e) });
    } finally {
      setDfnChecking(false);
    }
  }

  async function detectAudioSeparator() {
    setAsepChecking(true);
    try {
      setAsepCheck(await invoke<StageTool>('audio_separator_check'));
    } catch (e) {
      setAsepCheck({ found: false, version: null, error: String(e) });
    } finally {
      setAsepChecking(false);
    }
  }

  async function pickDfnInput() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setDfnInput(selected);
  }

  async function pickDfnOutDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') setDfnOutDir(selected);
  }

  async function pickAsepInput() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setAsepInput(selected);
  }

  async function pickAsepOutDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') setAsepOutDir(selected);
  }

  async function runDeepFilterNet(force = false) {
    if (!dfnInput || !dfnOutDir) return;
    setDfnRunning(true);
    setDfnResult(null);
    setDfnErr(null);
    try {
      const r = await invoke<DeepFilterNetResult>('deepfilternet_run', {
        inputAudio: dfnInput,
        outputDir: dfnOutDir,
        attenuationDb: dfnAttenDb,
        force,
      });
      setDfnResult(r);
      // Auto-chain: feed the denoised file into audio-separator.
      if (r.success && r.output_path) {
        if (!asepInput) setAsepInput(r.output_path);
        const sep = Math.max(
          r.output_path.lastIndexOf('/'),
          r.output_path.lastIndexOf('\\'),
        );
        if (sep > 0 && !asepOutDir) setAsepOutDir(r.output_path.slice(0, sep));
      }
    } catch (e) {
      setDfnErr(String(e));
    } finally {
      setDfnRunning(false);
    }
  }

  async function runAudioSeparator(force = false) {
    if (!asepInput || !asepOutDir) return;
    setAsepRunning(true);
    setAsepResult(null);
    setAsepErr(null);
    setAsepPercent(0);
    try {
      const r = await invoke<AudioSeparatorResult>('audio_separator_run', {
        inputAudio: asepInput,
        outputDir: asepOutDir,
        model: asepModel,
        force,
      });
      setAsepResult(r);
      // Auto-chain: the (Vocals) output of audio-separator (the
      // cleanest lead vocal we'll get) feeds the melody extractor.
      if (r.success && r.stems.length > 0) {
        const lead = r.stems.find((p) => /vocals/i.test(p)) ?? r.stems[0]!;
        if (!melodyInput) setMelodyInput(lead);
        if (!melodyOutput) {
          const sep = Math.max(lead.lastIndexOf('/'), lead.lastIndexOf('\\'));
          const dir = sep > 0 ? lead.slice(0, sep) : '';
          const base = (sep > 0 ? lead.slice(sep + 1) : lead).replace(
            /\.[a-z0-9]+$/i,
            '',
          );
          if (dir) setMelodyOutput(`${dir}/${base}_melody.mid`);
        }
      }
    } catch (e) {
      setAsepErr(String(e));
    } finally {
      setAsepRunning(false);
    }
  }

  async function detectMelody() {
    setMelodyChecking(true);
    try {
      setMelodyCheck(await invoke<StageTool>('extract_melody_check'));
    } catch (e) {
      setMelodyCheck({ found: false, version: null, error: String(e) });
    } finally {
      setMelodyChecking(false);
    }
  }

  async function pickMelodyInput() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'ogg', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setMelodyInput(selected);
  }

  async function pickMelodyOutput() {
    // Save dialog (not open) — the user is choosing where to WRITE
    // a new file, not picking an existing one. openDialog requires
    // the file to exist; saveDialog lets the user type a name and
    // confirms before overwriting.
    const selected = await saveDialog({
      filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
      defaultPath: melodyOutput ?? undefined,
    });
    if (typeof selected === 'string') setMelodyOutput(selected);
  }

  async function runExtractMelody(force = false) {
    if (!melodyInput || !melodyOutput) return;
    setMelodyRunning(true);
    setMelodyResult(null);
    setMelodyErr(null);
    setMelodyPercent(0);
    try {
      const r = await invoke<ExtractMelodyResult>('extract_melody_run', {
        inputAudio: melodyInput,
        midiPath: melodyOutput,
        confidence: melodyConfidence,
        minDurationSec: melodyMinDuration,
        model: melodyModel,
        force,
      });
      setMelodyResult(r);
      // Auto-chain: the produced MIDI feeds the aligner's MIDI picker.
      if (r.success && r.midi_path && !midi) {
        setMidi(r.midi_path);
        if (!outPath) setOutPath(deriveOutPath(r.midi_path));
      }
    } catch (e) {
      setMelodyErr(String(e));
    } finally {
      setMelodyRunning(false);
    }
  }

  async function runWhisperX(force = false) {
    if (!whisperxInput || !whisperxOutDir) return;
    setWhisperxRunning(true);
    setWhisperxResult(null);
    setWhisperxErr(null);
    try {
      const r = await invoke<WhisperXResult>('whisperx_transcribe', {
        inputAudio: whisperxInput,
        outputDir: whisperxOutDir,
        model: whisperxModel,
        language: whisperxLanguage,
        force,
      });
      setWhisperxResult(r);
      // Auto-chain: produced JSON feeds the aligner.
      if (r.success && !json) setJson(r.json_path);
    } catch (e) {
      setWhisperxErr(String(e));
    } finally {
      setWhisperxRunning(false);
    }
  }

  async function pickAlignerDir() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') setAlignerDir(selected);
  }

  async function pickMidi() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'MIDI', extensions: ['mid', 'midi'] }],
    });
    if (typeof selected === 'string') {
      setMidi(selected);
      if (!outPath) setOutPath(deriveOutPath(selected));
    }
  }

  async function pickJson() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') setJson(selected);
  }

  async function pickStructure() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Structure JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') setStructurePath(selected);
  }

  async function runAligner() {
    if (!alignerDir || !midi || !json || !outPath) return;
    setRunning(true);
    setResult(null);
    setRunErr(null);
    try {
      const r = await invoke<AlignerResult>('run_aligner', {
        alignerDir,
        midiPath: midi,
        jsonPath: json,
        outPath,
        structurePath,
      });
      setResult(r);
      if (r.success) {
        loadReviewFromPath(deriveReviewPath(r.out_path));
      }
    } catch (e) {
      setRunErr(String(e));
    } finally {
      setRunning(false);
    }
  }

  async function loadReviewFromPath(path: string) {
    setReviewLoading(true);
    setReviewErr(null);
    setReviewPath(path);
    try {
      const data = await invoke<ReviewSidecar>('load_review', { path });
      setReview(data);
    } catch (e) {
      setReview(null);
      setReviewErr(String(e));
    } finally {
      setReviewLoading(false);
    }
  }

  async function pickReviewFile() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Review JSON', extensions: ['json'] }],
    });
    if (typeof selected === 'string') loadReviewFromPath(selected);
  }

  async function revealOutput() {
    if (!result?.out_path) return;
    try {
      await revealItemInDir(result.out_path);
    } catch (e) {
      console.error('reveal failed', e);
    }
  }

  async function publishSong() {
    if (!review) return;
    setPublishing(true);
    setPublishErr(null);
    setPublishResult(null);
    setUploadedStems([]);
    try {
      const res = await invoke<PublishResult>('publish_song', {
        input: {
          title: publishTitle.trim(),
          key: fifthsToKey(review.summary.key_fifths),
          bpm: review.summary.tempo_bpm,
          lead_gender: publishLead,
          record: review,
        },
      });
      setPublishResult(res);
    } catch (e) {
      setPublishErr(String(e));
    } finally {
      setPublishing(false);
    }
  }

  async function pickStem() {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }],
    });
    if (typeof selected === 'string') setStemFile(selected);
  }

  async function uploadStem() {
    if (!publishResult || !stemFile) return;
    setUploading(true);
    setUploadErr(null);
    try {
      const r = await invoke<UploadStemResult>('upload_stem', {
        input: { song_id: publishResult.id, track: stemTrack, file_path: stemFile },
      });
      await invoke('patch_song_stems', {
        input: { song_id: publishResult.id, track: stemTrack, storage_key: r.storage_key },
      });
      setUploadedStems((prev) => [
        ...prev.filter((s) => s.track !== stemTrack),
        { track: stemTrack, storage_key: r.storage_key, bytes: r.bytes },
      ]);
      setStemFile(null);
    } catch (e) {
      setUploadErr(String(e));
    } finally {
      setUploading(false);
    }
  }

  const canRun = !!alignerDir && !!midi && !!json && !!outPath && !running;

  return (
    <main className="container">
      <header className="header">
        <div className="logo-mark">⏸</div>
        <div>
          <h1>Worship Pipeline</h1>
          <p className="subtitle">Producer console — Demucs → WhisperX → aligner → publish</p>
        </div>
      </header>

      <section className="card">
        <h2>Status</h2>
        {healthErr && <div className="error">Rust IPC error: {healthErr}</div>}
        {health ? (
          <ul className="kv">
            <li><span className="k">IPC</span><span className="v">{health.ok ? 'connected' : 'down'}</span></li>
            <li><span className="k">Rust</span><span className="v">{health.rust}</span></li>
          </ul>
        ) : !healthErr ? (
          <div className="muted">Pinging Rust…</div>
        ) : null}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Python</h2>
          <button className="btn" onClick={detectPython} disabled={pythonChecking}>
            {pythonChecking ? 'Probing…' : 'Detect'}
          </button>
        </div>
        {pythonErr && <div className="error">IPC error: {pythonErr}</div>}
        {python && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{python.found ? 'yes' : 'no'}</span></li>
            {python.version && <li><span className="k">version</span><span className="v">{python.version}</span></li>}
            {python.error && <li><span className="k">error</span><span className="v error-text">{python.error}</span></li>}
          </ul>
        )}
        {!python && !pythonErr && (
          <div className="muted">
            Click <strong>Detect</strong> to check that <code>python3</code> is on PATH.
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Demucs — source separation</h2>
          <button className="btn" onClick={detectDemucs} disabled={demucsChecking}>
            {demucsChecking ? 'Probing…' : 'Check install'}
          </button>
        </div>
        {demucsCheck && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{demucsCheck.found ? 'yes' : 'no'}</span></li>
            {demucsCheck.version && <li><span className="k">version</span><span className="v">{demucsCheck.version}</span></li>}
            {demucsCheck.error && <li><span className="k">error</span><span className="v error-text">{demucsCheck.error}</span></li>}
          </ul>
        )}
        <div className="picker-grid">
          <PickerRow label="input audio" value={demucsInput} onPick={pickDemucsInput} disabled={demucsRunning} />
          <PickerRow label="output dir" value={demucsOutDir} onPick={pickDemucsOutDir} disabled={demucsRunning} />
          <div className="picker-row">
            <span className="picker-label">model</span>
            <select
              className="picker-input"
              value={demucsModel}
              disabled={demucsRunning}
              onChange={(e) => setDemucsModel(e.target.value)}
              title={DEMUCS_MODEL_INFO[demucsModel]?.long}
            >
              {['htdemucs', 'htdemucs_ft', 'mdx_extra', 'mdx_extra_q'].map((m) => (
                <option key={m} value={m} title={DEMUCS_MODEL_INFO[m]?.long}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              marginTop: 2,
              marginLeft: 4,
              fontStyle: 'italic',
            }}
          >
            {DEMUCS_MODEL_INFO[demucsModel]?.short}
          </div>
          <div className="picker-row">
            <span className="picker-label">stems</span>
            <select
              className="picker-input"
              value={demucsMode}
              disabled={demucsRunning}
              onChange={(e) =>
                setDemucsMode(e.target.value as 'two_stems_vocals' | 'four_stems')
              }
              title={
                demucsMode === 'two_stems_vocals'
                  ? 'Demucs --two-stems vocals: vocals.wav + no_vocals.wav. Right for worship vocal/band splits.'
                  : "Demucs's standard output: vocals + drums + bass + other. Use when you want to mix band stems independently."
              }
            >
              <option
                value="two_stems_vocals"
                title="vocals.wav + no_vocals.wav — the worship default"
              >
                vocals + instrumental (2)
              </option>
              <option
                value="four_stems"
                title="vocals + drums + bass + other — mix the band stems separately"
              >
                drums + bass + other + vocals (4)
              </option>
            </select>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              marginTop: 2,
              marginLeft: 4,
              fontStyle: 'italic',
            }}
          >
            {demucsMode === 'two_stems_vocals'
              ? 'Worship default · vocal isolate + band mix in one pass'
              : 'Full split · use when mixing band stems independently'}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn primary"
            onClick={() => runDemucs(false)}
            disabled={!demucsInput || !demucsOutDir || demucsRunning}
          >
            {demucsRunning
              ? 'Separating…'
              : demucsCache?.cached
                ? 'Use cached'
                : 'Run Demucs'}
          </button>
          {demucsCache?.cached && (
            <>
              <span style={{ fontSize: 12, color: '#5B8C3E', fontFamily: 'monospace' }}>
                ✓ cached at {demucsCache.artifact}
              </span>
              <button
                className="btn"
                onClick={() => runDemucs(true)}
                disabled={demucsRunning}
              >
                Re-run
              </button>
            </>
          )}
        </div>
        <RunningIndicator
          active={demucsRunning}
          label={`Separating with ${demucsModel}…`}
          accent="cyan"
          percent={demucsPercent}
        />
        {demucsErr && <div className="error">{demucsErr}</div>}
        {demucsResult && (
          <div style={{ marginTop: 12 }}>
            <ul className="kv">
              <li><span className="k">success</span><span className="v">{demucsResult.success ? 'yes' : 'no'}</span></li>
              {demucsResult.exit_code != null && <li><span className="k">exit</span><span className="v">{demucsResult.exit_code}</span></li>}
              {demucsResult.output_dir && <li><span className="k">out dir</span><span className="v">{demucsResult.output_dir}</span></li>}
            </ul>
            {demucsResult.stems.length > 0 && (
              <ul className="kv">
                {demucsResult.stems.map((s) => (
                  <li key={s}><span className="k">stem</span><span className="v">{s}</span></li>
                ))}
              </ul>
            )}
            {demucsResult.stderr && <pre className="log error-text">{demucsResult.stderr}</pre>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>DeepFilterNet — noise suppression</h2>
          <button className="btn" onClick={detectDeepFilterNet} disabled={dfnChecking}>
            {dfnChecking ? 'Probing…' : 'Check install'}
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontStyle: 'italic',
            marginBottom: 10,
          }}
        >
          Chain step 2 · cleans audience noise / HVAC / room hum from
          the Demucs vocals stem · output feeds audio-separator
        </div>
        {dfnCheck && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{dfnCheck.found ? 'yes' : 'no'}</span></li>
            {dfnCheck.version && <li><span className="k">bin</span><span className="v">{dfnCheck.version}</span></li>}
            {dfnCheck.error && <li><span className="k">error</span><span className="v error-text">{dfnCheck.error}</span></li>}
          </ul>
        )}
        <div className="picker-grid">
          <PickerRow label="input audio" value={dfnInput} onPick={pickDfnInput} disabled={dfnRunning} />
          <PickerRow label="output dir" value={dfnOutDir} onPick={pickDfnOutDir} disabled={dfnRunning} />
          <div className="picker-row">
            <span className="picker-label">atten dB</span>
            <input
              className="picker-input"
              type="number"
              min={20}
              max={120}
              step={5}
              value={dfnAttenDb}
              disabled={dfnRunning}
              onChange={(e) => setDfnAttenDb(Number(e.target.value))}
              title="Lower (40-60) for sustained sung vocals; higher (80-100) for spoken/talky takes. Default 60 is a safe middle ground for worship."
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              marginTop: 2,
              marginLeft: 4,
              fontStyle: 'italic',
            }}
          >
            {dfnAttenDb >= 80
              ? 'Aggressive · best for spoken/talky audio · may soften held notes'
              : dfnAttenDb >= 50
                ? 'Balanced · safe default for worship vocals'
                : 'Gentle · preserves vocal tone, removes less noise'}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn primary"
            onClick={() => runDeepFilterNet(false)}
            disabled={!dfnInput || !dfnOutDir || dfnRunning}
          >
            {dfnRunning
              ? 'Denoising…'
              : dfnCache?.cached
                ? 'Use cached'
                : 'Run DeepFilterNet'}
          </button>
          {dfnCache?.cached && (
            <>
              <span style={{ fontSize: 12, color: '#5B8C3E', fontFamily: 'monospace' }}>
                ✓ cached: {dfnCache.artifact}
              </span>
              <button
                className="btn"
                onClick={() => runDeepFilterNet(true)}
                disabled={dfnRunning}
              >
                Re-run
              </button>
            </>
          )}
        </div>
        <RunningIndicator
          active={dfnRunning}
          label={`Denoising at ${dfnAttenDb}dB attenuation…`}
          accent="cyan"
        />
        {dfnErr && <div className="error">{dfnErr}</div>}
        {dfnResult && (
          <div style={{ marginTop: 12 }}>
            <ul className="kv">
              <li><span className="k">success</span><span className="v">{dfnResult.success ? 'yes' : 'no'}</span></li>
              {dfnResult.exit_code != null && <li><span className="k">exit</span><span className="v">{dfnResult.exit_code}</span></li>}
              {dfnResult.output_path && <li><span className="k">output</span><span className="v">{dfnResult.output_path}</span></li>}
            </ul>
            {dfnResult.stderr && <pre className="log error-text">{dfnResult.stderr}</pre>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>audio-separator (UVR) — lead vs background vocals</h2>
          <button className="btn" onClick={detectAudioSeparator} disabled={asepChecking}>
            {asepChecking ? 'Probing…' : 'Check install'}
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontStyle: 'italic',
            marginBottom: 10,
          }}
        >
          Chain step 3 · isolates lead vocal from choir/backing vocal
          bleed · runs UVR's MDX-Net models · downloads weights on first use
        </div>
        {asepCheck && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{asepCheck.found ? 'yes' : 'no'}</span></li>
            {asepCheck.version && <li><span className="k">bin</span><span className="v">{asepCheck.version}</span></li>}
            {asepCheck.error && <li><span className="k">error</span><span className="v error-text">{asepCheck.error}</span></li>}
          </ul>
        )}
        <div className="picker-grid">
          <PickerRow label="input audio" value={asepInput} onPick={pickAsepInput} disabled={asepRunning} />
          <PickerRow label="output dir" value={asepOutDir} onPick={pickAsepOutDir} disabled={asepRunning} />
          <div className="picker-row">
            <span className="picker-label">model</span>
            <select
              className="picker-input"
              value={asepModel}
              disabled={asepRunning}
              onChange={(e) => setAsepModel(e.target.value)}
              title="Karaoke models (KARA_2, karokee) isolate LEAD vocal from background vocals. General vocal models (MDX-Inst, Kim) just isolate ALL vocals from any remaining instruments."
            >
              <option value="UVR_MDXNET_KARA_2.onnx">UVR_MDXNET_KARA_2 · ★ karaoke · lead vs backings</option>
              <option value="model_bs_roformer_ep_317_sdr_12.9755.ckpt">BS-Roformer · newest default · slow but best vocal</option>
              <option value="UVR-MDX-NET-Inst_HQ_4.onnx">UVR-MDX-NET-Inst_HQ_4 · clean vocal isolation</option>
              <option value="UVR-MDX-NET-Voc_FT.onnx">UVR-MDX-NET-Voc_FT · fine-tuned vocal isolation</option>
              <option value="Kim_Vocal_2.onnx">Kim_Vocal_2 · alt vocal isolation</option>
              <option value="MDX23C-8KFFT-InstVoc_HQ.ckpt">MDX23C-8KFFT-InstVoc_HQ · alt newest</option>
            </select>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              marginTop: 2,
              marginLeft: 4,
              fontStyle: 'italic',
            }}
          >
            {/karaoke|kara/i.test(asepModel)
              ? 'Karaoke model · separates LEAD vocal from background vocals'
              : 'Vocal isolation · pulls all vocals away from any remaining instruments'}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn primary"
            onClick={() => runAudioSeparator(false)}
            disabled={!asepInput || !asepOutDir || asepRunning}
          >
            {asepRunning
              ? 'Isolating…'
              : asepCache?.cached
                ? 'Use cached'
                : 'Run audio-separator'}
          </button>
          {asepCache?.cached && (
            <>
              <span style={{ fontSize: 12, color: '#5B8C3E', fontFamily: 'monospace' }}>
                ✓ cached · {asepCache.detail.length} stem(s)
              </span>
              <button
                className="btn"
                onClick={() => runAudioSeparator(true)}
                disabled={asepRunning}
              >
                Re-run
              </button>
            </>
          )}
        </div>
        <RunningIndicator
          active={asepRunning}
          label={`Running ${asepModel.replace(/\.[a-z]+$/, '')}…`}
          accent="cyan"
          percent={asepPercent}
        />
        {asepErr && <div className="error">{asepErr}</div>}
        {asepResult && (
          <div style={{ marginTop: 12 }}>
            <ul className="kv">
              <li><span className="k">success</span><span className="v">{asepResult.success ? 'yes' : 'no'}</span></li>
              {asepResult.exit_code != null && <li><span className="k">exit</span><span className="v">{asepResult.exit_code}</span></li>}
            </ul>
            {asepResult.stems.length > 0 && (
              <ul className="kv">
                {asepResult.stems.map((s) => (
                  <li key={s}><span className="k">stem</span><span className="v">{s}</span></li>
                ))}
              </ul>
            )}
            {asepResult.stderr && <pre className="log error-text">{asepResult.stderr}</pre>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Extract melody — vocal → MIDI (CREPE)</h2>
          <button className="btn" onClick={detectMelody} disabled={melodyChecking}>
            {melodyChecking ? 'Probing…' : 'Check install'}
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontStyle: 'italic',
            marginBottom: 10,
          }}
        >
          Chain step 4a · monophonic pitch tracker · most-prominent
          note only, no BGV bleed · output MIDI feeds the aligner
        </div>
        {melodyCheck && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{melodyCheck.found ? 'yes' : 'no'}</span></li>
            {melodyCheck.version && <li><span className="k">deps</span><span className="v">{melodyCheck.version}</span></li>}
            {melodyCheck.error && <li><span className="k">error</span><span className="v error-text">{melodyCheck.error}</span></li>}
          </ul>
        )}
        <div className="picker-grid">
          <PickerRow label="input audio" value={melodyInput} onPick={pickMelodyInput} disabled={melodyRunning} />
          <PickerRow label="output MIDI" value={melodyOutput} onPick={pickMelodyOutput} disabled={melodyRunning} />
          <div className="picker-row">
            <span className="picker-label">model</span>
            <select
              className="picker-input"
              value={melodyModel}
              disabled={melodyRunning}
              onChange={(e) => setMelodyModel(e.target.value as 'full' | 'tiny')}
              title="CREPE network size. 'full' is accurate; 'tiny' is ~10x faster, ~3% less accurate."
            >
              <option value="full">full · accurate · slower</option>
              <option value="tiny">tiny · ~10× faster · slight accuracy hit</option>
            </select>
          </div>
          <div className="picker-row">
            <span className="picker-label">confidence</span>
            <input
              className="picker-input"
              type="number"
              min={0.3}
              max={0.95}
              step={0.05}
              value={melodyConfidence}
              disabled={melodyRunning}
              onChange={(e) => setMelodyConfidence(Number(e.target.value))}
              title="CREPE confidence threshold. Lower captures more notes (incl. spurious); higher = stricter."
            />
          </div>
          <div className="picker-row">
            <span className="picker-label">min note (s)</span>
            <input
              className="picker-input"
              type="number"
              min={0.02}
              max={0.5}
              step={0.01}
              value={melodyMinDuration}
              disabled={melodyRunning}
              onChange={(e) => setMelodyMinDuration(Number(e.target.value))}
              title="Drops notes shorter than this (in seconds). Higher = fewer artifacts, may miss fast passages."
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
              marginTop: 2,
              marginLeft: 4,
              fontStyle: 'italic',
            }}
          >
            {melodyConfidence >= 0.7
              ? 'Strict · cleanest output · may miss soft / breathy notes'
              : melodyConfidence >= 0.45
                ? 'Balanced · safe default for worship vocals'
                : 'Permissive · catches more notes incl. spurious BGV detections'}
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn primary"
            onClick={() => runExtractMelody(false)}
            disabled={!melodyInput || !melodyOutput || melodyRunning}
          >
            {melodyRunning
              ? 'Tracking pitch…'
              : melodyCache?.cached
                ? 'Use cached'
                : 'Extract melody'}
          </button>
          {melodyCache?.cached && (
            <>
              <span style={{ fontSize: 12, color: '#5B8C3E', fontFamily: 'monospace' }}>
                ✓ cached: {melodyCache.artifact}
              </span>
              <button
                className="btn"
                onClick={() => runExtractMelody(true)}
                disabled={melodyRunning}
              >
                Re-run
              </button>
            </>
          )}
        </div>
        <RunningIndicator
          active={melodyRunning}
          label={`Running CREPE (${melodyModel}) on lead vocal…`}
          accent="cyan"
          percent={melodyPercent}
        />
        {melodyErr && <div className="error">{melodyErr}</div>}
        {melodyResult && (
          <div style={{ marginTop: 12 }}>
            <ul className="kv">
              <li><span className="k">success</span><span className="v">{melodyResult.success ? 'yes' : 'no'}</span></li>
              {melodyResult.exit_code != null && <li><span className="k">exit</span><span className="v">{melodyResult.exit_code}</span></li>}
              {melodyResult.midi_path && <li><span className="k">MIDI</span><span className="v">{melodyResult.midi_path}</span></li>}
            </ul>
            {melodyResult.stderr && <pre className="log error-text">{melodyResult.stderr}</pre>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>WhisperX — transcription</h2>
          <button className="btn" onClick={detectWhisperX} disabled={whisperxChecking}>
            {whisperxChecking ? 'Probing…' : 'Check install'}
          </button>
        </div>
        {whisperxCheck && (
          <ul className="kv">
            <li><span className="k">found</span><span className="v">{whisperxCheck.found ? 'yes' : 'no'}</span></li>
            {whisperxCheck.version && <li><span className="k">version</span><span className="v">{whisperxCheck.version}</span></li>}
            {whisperxCheck.error && <li><span className="k">error</span><span className="v error-text">{whisperxCheck.error}</span></li>}
          </ul>
        )}
        <div className="picker-grid">
          <PickerRow label="input audio" value={whisperxInput} onPick={pickWhisperXInput} disabled={whisperxRunning} />
          <PickerRow label="output dir" value={whisperxOutDir} onPick={pickWhisperXOutDir} disabled={whisperxRunning} />
          <div className="picker-row">
            <span className="picker-label">model</span>
            <select
              className="picker-input"
              value={whisperxModel}
              disabled={whisperxRunning}
              onChange={(e) => setWhisperxModel(e.target.value)}
            >
              {['tiny', 'base', 'small', 'medium', 'large-v2', 'large-v3'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="picker-row">
            <span className="picker-label">language</span>
            <input
              className="picker-input"
              type="text"
              value={whisperxLanguage}
              disabled={whisperxRunning}
              onChange={(e) => setWhisperxLanguage(e.target.value)}
              placeholder="en"
            />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn primary"
            onClick={() => runWhisperX(false)}
            disabled={!whisperxInput || !whisperxOutDir || whisperxRunning}
          >
            {whisperxRunning
              ? 'Transcribing…'
              : whisperxCache?.cached
                ? 'Use cached'
                : 'Run WhisperX'}
          </button>
          {whisperxCache?.cached && (
            <>
              <span style={{ fontSize: 12, color: '#5B8C3E', fontFamily: 'monospace' }}>
                ✓ cached: {whisperxCache.artifact}
              </span>
              <button
                className="btn"
                onClick={() => runWhisperX(true)}
                disabled={whisperxRunning}
              >
                Re-run
              </button>
            </>
          )}
        </div>
        <RunningIndicator
          active={whisperxRunning}
          label={`Transcribing with whisperx (${whisperxModel}, ${whisperxLanguage})…`}
          accent="cyan"
        />
        {whisperxErr && <div className="error">{whisperxErr}</div>}
        {whisperxResult && (
          <div style={{ marginTop: 12 }}>
            <ul className="kv">
              <li><span className="k">success</span><span className="v">{whisperxResult.success ? 'yes' : 'no'}</span></li>
              {whisperxResult.exit_code != null && <li><span className="k">exit</span><span className="v">{whisperxResult.exit_code}</span></li>}
              {whisperxResult.json_path && <li><span className="k">json</span><span className="v">{whisperxResult.json_path}</span></li>}
            </ul>
            {whisperxResult.stderr && <pre className="log error-text">{whisperxResult.stderr}</pre>}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Aligner</h2>
          <button className="btn" onClick={runAligner} disabled={!canRun}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        <div className="picker-grid">
          <PickerRow label="aligner dir" value={alignerDir} onPick={pickAlignerDir} disabled={running} />
          <PickerRow label="midi" value={midi} onPick={pickMidi} disabled={running} />
          <PickerRow label="json" value={json} onPick={pickJson} disabled={running} />
          <PickerRow
            label="structure"
            value={structurePath}
            placeholder="(optional)"
            onPick={pickStructure}
            onClear={() => setStructurePath(null)}
            disabled={running}
          />
          <div className="picker-row">
            <span className="k">out</span>
            <input
              className="path-input"
              value={outPath ?? ''}
              onChange={(e) => setOutPath(e.target.value || null)}
              placeholder="auto-derived from MIDI"
              disabled={running}
            />
          </div>
        </div>

        <RunningIndicator
          active={running}
          label="Running aligner subprocess…"
          accent="amber"
        />
        {runErr && <div className="error" style={{ marginTop: 12 }}>IPC error: {runErr}</div>}
        {result && (
          <div className="result">
            <ul className="kv" style={{ marginBottom: 10 }}>
              <li>
                <span className="k">exit</span>
                <span className={'v ' + (result.success ? 'ok-text' : 'error-text')}>
                  {result.success ? 'ok' : `failed (${result.exit_code ?? 'no code'})`}
                </span>
              </li>
              {result.success && (
                <li><span className="k">wrote</span><span className="v path-cell">{result.out_path}</span></li>
              )}
            </ul>
            {result.stdout && (
              <details>
                <summary>stdout ({result.stdout.length} chars)</summary>
                <pre className="log">{result.stdout}</pre>
              </details>
            )}
            {result.stderr && (
              <details open={!result.success}>
                <summary>stderr ({result.stderr.length} chars)</summary>
                <pre className="log">{result.stderr}</pre>
              </details>
            )}
            {result.success && (
              <button className="btn btn-ghost" onClick={revealOutput} style={{ marginTop: 10 }}>
                Reveal output in Finder
              </button>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Review</h2>
          <button className="btn btn-ghost" onClick={pickReviewFile} disabled={reviewLoading}>
            {reviewLoading ? 'Loading…' : 'Load review file…'}
          </button>
        </div>

        {reviewPath && (
          <div className="picker-row" style={{ marginBottom: 12, gridTemplateColumns: '80px 1fr' }}>
            <span className="k">file</span>
            <span className="v path-cell">{reviewPath}</span>
          </div>
        )}

        {reviewErr && <div className="error">{reviewErr}</div>}

        {!review && !reviewErr && !reviewLoading && (
          <div className="muted">
            Run the aligner above, or pick a <code>.review.json</code> manually to inspect
            flagged words.
          </div>
        )}

        {review && (
          <>
            <SummaryGrid summary={review.summary} />
            {review.structure_check && <StructureCheckCard check={review.structure_check} />}
            <FlagsList items={review.items} />
          </>
        )}
      </section>

      <section className="card">
        <h2>Publish</h2>
        {publishCfg && <PublishEnvStatus cfg={publishCfg} />}
        {!review && (
          <div className="muted" style={{ marginTop: 10 }}>
            Load a review above. Publish writes a minimal song record (title, key, BPM,
            lead gender) to Supabase.
          </div>
        )}
        {review && (
          <div style={{ marginTop: 12 }}>
            <div className="picker-grid">
              <div className="picker-row">
                <span className="k">title</span>
                <input
                  className="path-input"
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="Song title"
                  disabled={publishing}
                />
              </div>
              <div className="picker-row">
                <span className="k">key</span>
                <span className="v">{fifthsToKey(review.summary.key_fifths)}</span>
              </div>
              <div className="picker-row">
                <span className="k">bpm</span>
                <span className="v">{review.summary.tempo_bpm}</span>
              </div>
              <div className="picker-row">
                <span className="k">lead</span>
                <select
                  className="path-input"
                  value={publishLead}
                  onChange={(e) => setPublishLead(e.target.value as 'male' | 'female')}
                  disabled={publishing}
                >
                  <option value="male">male</option>
                  <option value="female">female</option>
                </select>
              </div>
            </div>
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={publishSong}
              disabled={
                publishing ||
                !publishTitle.trim() ||
                !publishCfg?.has_url ||
                !publishCfg?.has_service_key ||
                !publishCfg?.has_producer_id
              }
            >
              {publishing ? 'Publishing…' : 'Publish to Supabase'}
            </button>
            <RunningIndicator
              active={publishing}
              label="POSTing to PostgREST…"
              accent="lavender"
            />
            {publishErr && (
              <div className="error" style={{ marginTop: 10 }}>
                {publishErr}
              </div>
            )}
            {publishResult && (
              <>
                <div className="struct-check struct-ok" style={{ marginTop: 12 }}>
                  <div className="struct-head">
                    <span className="struct-badge">Published</span>
                    <span className="muted">id {publishResult.id.slice(0, 8)}…</span>
                  </div>
                  <div className="struct-msg">
                    <strong>{publishResult.title}</strong> is now in the songs table. Refresh
                    Vocal Booth's Library to see it.
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.5)',
                      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                      marginBottom: 8,
                    }}
                  >
                    Stems for this song
                  </div>
                  <div className="picker-row">
                    <span className="k">track</span>
                    <select
                      className="path-input"
                      value={stemTrack}
                      onChange={(e) => setStemTrack(e.target.value as StemTrack)}
                      disabled={uploading}
                    >
                      {STEM_TRACKS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost"
                      onClick={pickStem}
                      disabled={uploading}
                    >
                      Pick audio…
                    </button>
                  </div>
                  {stemFile && (
                    <div className="picker-row" style={{ marginTop: 6 }}>
                      <span className="k">file</span>
                      <span className="v path-cell">{stemFile}</span>
                      <button
                        className="btn"
                        onClick={uploadStem}
                        disabled={uploading || !stemFile}
                      >
                        {uploading ? 'Uploading…' : 'Upload'}
                      </button>
                    </div>
                  )}
                  <RunningIndicator
                    active={uploading}
                    label={`Uploading ${stemTrack} stem to Storage…`}
                    accent="amber"
                  />
                  {uploadErr && (
                    <div className="error" style={{ marginTop: 10 }}>
                      {uploadErr}
                    </div>
                  )}
                  {uploadedStems.length > 0 && (
                    <ul className="kv" style={{ marginTop: 12 }}>
                      {uploadedStems.map((s) => (
                        <li key={s.track}>
                          <span className="k">{s.track}</span>
                          <span className="v">
                            <span className="ok-text">✓ </span>
                            {s.storage_key} <span className="muted">({formatBytes(s.bytes)})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PublishEnvStatus({ cfg }: { cfg: PublishConfig }) {
  const allSet = cfg.has_url && cfg.has_service_key && cfg.has_producer_id;
  if (allSet) {
    return (
      <ul className="kv">
        <li>
          <span className="k">target</span>
          <span className="v ok-text">{cfg.url_host}</span>
        </li>
      </ul>
    );
  }
  return (
    <div className="muted">
      Set these in <code>.env.local</code> at the workspace root, then restart the dev
      server:
      <ul className="kv" style={{ marginTop: 8 }}>
        <li>
          <span className="k">SUPABASE_URL</span>
          <span className={'v ' + (cfg.has_url ? 'ok-text' : 'error-text')}>
            {cfg.has_url ? '✓ set' : '✗ missing'}
          </span>
        </li>
        <li>
          <span className="k">SUPABASE_SERVICE_ROLE_KEY</span>
          <span className={'v ' + (cfg.has_service_key ? 'ok-text' : 'error-text')}>
            {cfg.has_service_key ? '✓ set' : '✗ missing'}
          </span>
        </li>
        <li>
          <span className="k">WORSHIP_PRODUCER_USER_ID</span>
          <span className={'v ' + (cfg.has_producer_id ? 'ok-text' : 'error-text')}>
            {cfg.has_producer_id ? '✓ set' : '✗ missing'}
          </span>
        </li>
      </ul>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: ReviewSidecar['summary'] }) {
  const cells: Array<[string, string]> = [
    ['tempo', `${summary.tempo_bpm} BPM`],
    ['key', `${fifthsToKey(summary.key_fifths)} (${summary.key_fifths >= 0 ? '+' : ''}${summary.key_fifths})`],
    ['meter', `${summary.beats_per_bar}/4`],
    ['measures', String(summary.measure_count)],
    ['words', String(summary.words_total)],
    ['notes', String(summary.notes_total)],
    ['continuations', String(summary.continuation_notes)],
    ['instrumental', String(summary.instrumental_notes)],
  ];
  return (
    <div className="summary-grid">
      {cells.map(([k, v]) => (
        <div className="summary-cell" key={k}>
          <div className="summary-k">{k}</div>
          <div className="summary-v">{v}</div>
        </div>
      ))}
    </div>
  );
}

function StructureCheckCard({ check }: { check: StructureCheck }) {
  return (
    <div className={'struct-check ' + (check.ok ? 'struct-ok' : 'struct-fail')}>
      <div className="struct-head">
        <span className="struct-badge">{check.ok ? 'Structure OK' : 'Structure mismatch'}</span>
        <span className="muted">
          words {check.actual_words}/{check.expected_words} · notes {check.actual_notes}
        </span>
      </div>
      <div className="struct-msg">{check.message}</div>
      {check.suspect_section && (
        <div className="struct-suspect">
          <span className="muted">suspect</span> <strong>{check.suspect_section}</strong>
          {check.suggested_repeats != null && (
            <span className="muted"> · try repeats = {check.suggested_repeats}</span>
          )}
        </div>
      )}
    </div>
  );
}

function FlagsList({ items }: { items: ReviewItem[] }) {
  if (items.length === 0) {
    return <div className="muted" style={{ marginTop: 12 }}>No flags. Clean alignment.</div>;
  }
  const byKind = items.reduce<Record<string, ReviewItem[]>>((acc, item) => {
    (acc[item.kind] ??= []).push(item);
    return acc;
  }, {});
  const kinds = Object.keys(byKind).sort();
  return (
    <div style={{ marginTop: 16 }}>
      <div className="flags-head">
        <span>
          {items.length} flag{items.length !== 1 ? 's' : ''}
        </span>
        <span className="muted">{kinds.map((k) => `${byKind[k]!.length} ${k}`).join(' · ')}</span>
      </div>
      <ul className="flags">
        {items.map((item, i) => (
          <li key={i} className="flag">
            <span className={`flag-kind kind-${item.kind}`}>{item.kind.replace('_', ' ')}</span>
            <span className="flag-word">{item.word.trim()}</span>
            <span className="flag-meta">
              m{item.measure} · {item.time_sec.toFixed(2)}s · {item.owned_notes} note
              {item.owned_notes !== 1 ? 's' : ''}
              {typeof item.score === 'number' && ` · score ${item.score.toFixed(2)}`}
            </span>
            <span className="flag-note muted">{item.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Animated loading indicator for long-running stages. Shows a
 * spinner + label + marquee bar + elapsed-seconds counter so the
 * producer can tell at a glance that the subprocess is alive even
 * when Demucs / WhisperX don't surface intermediate progress.
 *
 * `active` toggles visibility — when false, the component renders
 * nothing and the elapsed-time tick is unmounted (no idle interval).
 *
 * `accent` picks the color tint:
 *   - 'cyan'     — Demucs / WhisperX (subprocess stages)
 *   - 'amber'    — Aligner / publish
 *   - 'lavender' — generic
 */
function RunningIndicator({
  active,
  label,
  accent = 'cyan',
  percent = null,
}: {
  active: boolean;
  label: string;
  accent?: 'cyan' | 'amber' | 'lavender';
  /**
   * 0-100. When provided, the bar fills determinately (real progress
   * from a subprocess streaming tqdm output). When null, the bar
   * uses the indeterminate marquee animation. Either way the
   * spinner + elapsed counter still render.
   */
  percent?: number | null;
}) {
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!active) {
      setStartMs(null);
      return;
    }
    const start = Date.now();
    setStartMs(start);
    setNow(start);
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;
  const elapsed = startMs == null ? 0 : Math.floor((now - startMs) / 1000);
  const mm = Math.floor(elapsed / 60);
  const ss = (elapsed % 60).toString().padStart(2, '0');
  const cls =
    accent === 'amber'
      ? 'running running-amber'
      : accent === 'lavender'
        ? 'running running-lavender'
        : 'running';
  const hasPercent = percent != null;
  const barCls = hasPercent ? 'bar bar-determinate' : 'bar';
  return (
    <div className={cls} role="status" aria-live="polite">
      <span className="spinner" />
      <span className="label">{label}</span>
      <span className={barCls}>
        {hasPercent && (
          <span
            className="bar-fill"
            style={{ width: `${Math.max(0, Math.min(100, percent!))}%` }}
          />
        )}
      </span>
      {hasPercent && (
        <span className="percent">{Math.round(percent!)}%</span>
      )}
      <span className="elapsed">
        {mm}:{ss}
      </span>
    </div>
  );
}

function PickerRow({
  label,
  value,
  onPick,
  onClear,
  disabled,
  placeholder,
}: {
  label: string;
  value: string | null;
  onPick: () => void;
  onClear?: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="picker-row">
      <span className="k">{label}</span>
      <span className={'v path-cell ' + (value ? '' : 'muted')}>
        {value ?? placeholder ?? '(not set)'}
      </span>
      <div className="picker-actions">
        {value && onClear && (
          <button className="btn btn-ghost btn-mini" onClick={onClear} disabled={disabled} title="Clear">
            ✕
          </button>
        )}
        <button className="btn btn-ghost" onClick={onPick} disabled={disabled}>
          Pick…
        </button>
      </div>
    </div>
  );
}
