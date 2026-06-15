import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import './App.css';

type Health = { ok: boolean; rust: string };
type PythonInfo = { found: boolean; version: string | null; error: string | null };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  const [python, setPython] = useState<PythonInfo | null>(null);
  const [pythonChecking, setPythonChecking] = useState(false);
  const [pythonErr, setPythonErr] = useState<string | null>(null);

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
            Click <strong>Detect</strong> to check that <code>python3</code> is on PATH. The
            aligner stage shells out to it.
          </div>
        )}
      </section>

      <section className="card">
        <h2>Next</h2>
        <p className="muted">
          Wire the lyric-midi aligner as the first subprocess stage. File pickers for MIDI + JSON,
          stream stdout, write the MusicXML, surface the sidecar review flags.
        </p>
      </section>
    </main>
  );
}
