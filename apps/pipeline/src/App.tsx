import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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

type CacheStatus = {
  cached: boolean;
  artifact: string | null;
  detail: string[];
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
      // WhisperX input + default the WhisperX output dir to the
      // same parent.
      if (r.success) {
        const vocals = r.stems.find((p) => /vocals\.wav$/i.test(p));
        if (vocals && !whisperxInput) setWhisperxInput(vocals);
        if (vocals && !whisperxOutDir) {
          const sep = Math.max(vocals.lastIndexOf('/'), vocals.lastIndexOf('\\'));
          if (sep > 0) setWhisperxOutDir(vocals.slice(0, sep));
        }
      }
    } catch (e) {
      setDemucsErr(String(e));
    } finally {
      setDemucsRunning(false);
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
            >
              {['htdemucs', 'htdemucs_ft', 'mdx_extra', 'mdx_extra_q'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
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
            >
              <option value="two_stems_vocals">vocals + instrumental (2)</option>
              <option value="four_stems">drums + bass + other + vocals (4)</option>
            </select>
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
