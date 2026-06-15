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

function deriveOutPath(midiPath: string): string {
  // foo/bar/baz.mid → foo/bar/baz-aligned.musicxml
  const lastSep = Math.max(midiPath.lastIndexOf('/'), midiPath.lastIndexOf('\\'));
  const dir = lastSep >= 0 ? midiPath.slice(0, lastSep + 1) : '';
  const base = lastSep >= 0 ? midiPath.slice(lastSep + 1) : midiPath;
  const stem = base.replace(/\.(mid|midi)$/i, '');
  return dir + stem + '-aligned.musicxml';
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  const [python, setPython] = useState<PythonInfo | null>(null);
  const [pythonChecking, setPythonChecking] = useState(false);
  const [pythonErr, setPythonErr] = useState<string | null>(null);

  // Aligner stage state.
  const [alignerDir, setAlignerDir] = useState<string | null>(null);
  const [midi, setMidi] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [outPath, setOutPath] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AlignerResult | null>(null);
  const [runErr, setRunErr] = useState<string | null>(null);

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
    } catch (e) {
      setRunErr(String(e));
    } finally {
      setRunning(false);
    }
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
            <li>
              <span className="k">IPC</span>
              <span className="v">{health.ok ? 'connected' : 'down'}</span>
            </li>
            <li>
              <span className="k">Rust</span>
              <span className="v">{health.rust}</span>
            </li>
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
            <li>
              <span className="k">found</span>
              <span className="v">{python.found ? 'yes' : 'no'}</span>
            </li>
            {python.version && (
              <li>
                <span className="k">version</span>
                <span className="v">{python.version}</span>
              </li>
            )}
            {python.error && (
              <li>
                <span className="k">error</span>
                <span className="v error-text">{python.error}</span>
              </li>
            )}
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
          <PickerRow
            label="aligner dir"
            value={alignerDir}
            onPick={pickAlignerDir}
            disabled={running}
          />
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
                <li>
                  <span className="k">wrote</span>
                  <span className="v path-cell">{result.out_path}</span>
                </li>
              )}
            </ul>
            {result.stdout && (
              <details open>
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
              <button
                className="btn btn-ghost"
                onClick={revealOutput}
                style={{ marginTop: 10 }}
              >
                Reveal output in Finder
              </button>
            )}
          </div>
        )}
      </section>
    </main>
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
