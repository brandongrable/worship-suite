import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import './App.css';

type Health = { ok: boolean; rust: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    invoke<Health>('health_check')
      .then(setHealth)
      .catch((e) => setErr(String(e)));
  }, []);

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
        {err && <div className="error">Rust IPC error: {err}</div>}
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
        ) : !err ? (
          <div className="muted">Pinging Rust…</div>
        ) : null}
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
