import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { useEffect, useState } from 'react';
import './App.css';

type Health = { ok: boolean; rust: string };
type PythonInfo = { found: boolean; version: string | null; error: string | null };
type AlignerResult = {
  success: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  out_path: string;
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
  structure_check: unknown | null;
};

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
  const [outPath, setOutPath] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AlignerResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

  const [review, setReview] = useState<ReviewSidecar | null>(null);
  const [reviewPath, setReviewPath] = useState<string | null>(null);
  const [reviewErr, setReviewErr] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  useEffect(() => {
    invoke<Health>('health_check').then(setHealth).catch((e) => setHealthErr(String(e)));
  }, []);

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
          <h2>Aligner</h2>
          <button className="btn" onClick={runAligner} disabled={!canRun}>
            {running ? 'Running…' : 'Run'}
          </button>
        </div>

        <div className="picker-grid">
          <PickerRow label="aligner dir" value={alignerDir} onPick={pickAlignerDir} disabled={running} />
          <PickerRow label="midi" value={midi} onPick={pickMidi} disabled={running} />
          <PickerRow label="json" value={json} onPick={pickJson} disabled={running} />
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
            <FlagsList items={review.items} />
          </>
        )}
      </section>
    </main>
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
  disabled,
}: {
  label: string;
  value: string | null;
  onPick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="picker-row">
      <span className="k">{label}</span>
      <span className={'v path-cell ' + (value ? '' : 'muted')}>{value ?? '(not set)'}</span>
      <button className="btn btn-ghost" onClick={onPick} disabled={disabled}>
        Pick…
      </button>
    </div>
  );
}
