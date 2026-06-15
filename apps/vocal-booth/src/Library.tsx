import { useEffect, useState, type FormEvent } from 'react';
import {
  listMySongs,
  createSong,
  deleteSong,
  type Song,
} from './lib/songs';

const KEYS = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

export default function Library({
  ownerId,
  onBack,
  onSelect,
}: {
  ownerId: string;
  onBack: () => void;
  onSelect: (song: Song) => void;
}) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      setSongs(await listMySongs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: sansFont,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Header onBack={onBack} />

        <NewSongForm ownerId={ownerId} onCreated={refresh} />

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              border: '1px solid rgba(217,69,69,0.3)',
              background: 'rgba(217,69,69,0.06)',
              borderRadius: 10,
              fontSize: 13,
              color: '#D94545',
            }}
          >
            {error}
          </div>
        )}

        <SectionLabel>Songs</SectionLabel>
        {songs === null ? (
          <Muted>Loading…</Muted>
        ) : songs.length === 0 ? (
          <Muted>No songs yet. Create one above.</Muted>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {songs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                ownedByMe={song.owner_id === ownerId}
                onSelect={() => onSelect(song)}
                onDeleted={refresh}
                onDeleteError={(msg) => setError(msg)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
      <button
        onClick={onBack}
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.6)',
          padding: '6px 12px',
          borderRadius: 8,
          fontSize: 12,
          cursor: 'pointer',
          fontFamily: monoFont,
        }}
      >
        ← Home
      </button>
      <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>My Library</h1>
      <div style={{ width: 70 }} />
    </div>
  );
}

function NewSongForm({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('C');
  const [bpm, setBpm] = useState('120');
  const [leadGender, setLeadGender] = useState<'male' | 'female'>('male');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      await createSong(
        { title: title.trim(), key, bpm: Number(bpm), lead_gender: leadGender },
        ownerId,
      );
      setTitle('');
      setBpm('120');
      setStatus('idle');
      onCreated();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        marginBottom: 28,
        padding: 16,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <SectionLabel>New song</SectionLabel>
      <div style={{ display: 'grid', gap: 8 }}>
        <input
          required
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <select value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle}>
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={30}
            max={300}
            step={1}
            placeholder="BPM"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            style={inputStyle}
          />
          <select
            value={leadGender}
            onChange={(e) => setLeadGender(e.target.value as 'male' | 'female')}
            style={inputStyle}
          >
            <option value="male">Male lead</option>
            <option value="female">Female lead</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={status === 'saving' || !title.trim()}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: 'none',
            background: status === 'saving' ? 'rgba(155,106,216,0.4)' : '#9B6AD8',
            color: '#fff',
            fontWeight: 600,
            fontSize: 13,
            cursor: status === 'saving' ? 'wait' : 'pointer',
            fontFamily: sansFont,
          }}
        >
          {status === 'saving' ? 'Saving…' : 'Create song'}
        </button>
        {error && (
          <div style={{ color: '#D94545', fontSize: 12 }}>{error}</div>
        )}
      </div>
    </form>
  );
}

function SongRow({
  song,
  ownedByMe,
  onSelect,
  onDeleted,
  onDeleteError,
}: {
  song: Song;
  ownedByMe: boolean;
  onSelect: () => void;
  onDeleted: () => void;
  onDeleteError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${song.title}"?`)) return;
    setBusy(true);
    try {
      await deleteSong(song.id);
      onDeleted();
    } catch (err) {
      onDeleteError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <li
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      tabIndex={0}
      role="button"
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{song.title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: monoFont }}>
          {song.key} · {song.bpm} bpm · {song.lead_gender} lead · {song.visibility}
          {!ownedByMe && ' · shared'}
        </div>
      </div>
      {ownedByMe && (
        <button
          onClick={handleDelete}
          disabled={busy}
          style={{
            background: 'transparent',
            border: '1px solid rgba(217,69,69,0.3)',
            color: '#D94545',
            padding: '5px 10px',
            borderRadius: 6,
            fontSize: 11,
            cursor: busy ? 'wait' : 'pointer',
            fontFamily: monoFont,
            flexShrink: 0,
          }}
        >
          {busy ? '…' : 'Delete'}
        </button>
      )}
    </li>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
        fontFamily: monoFont,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 13,
  fontFamily: sansFont,
  boxSizing: 'border-box',
  width: '100%',
};
