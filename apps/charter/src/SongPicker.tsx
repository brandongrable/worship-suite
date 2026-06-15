import { useEffect, useState, type FormEvent } from 'react';
import { createSong, listMySongs, type Song } from './lib/songs';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";
const KEYS = ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab'];

export default function SongPicker({
  ownerId,
  email,
  onSelect,
  onSignOut,
}: {
  ownerId: string;
  email: string;
  onSelect: (song: Song) => void;
  onSignOut: () => void;
}) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setError(null);
    setRefreshing(true);
    try {
      setSongs(await listMySongs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Charter</h1>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: monoFont }}>
              {email}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={refresh}
              disabled={refreshing}
              style={{ ...btnSecondary, cursor: refreshing ? 'wait' : 'pointer' }}
            >
              {refreshing ? '…' : '⟳ Refresh'}
            </button>
            <button onClick={onSignOut} style={btnSecondary}>
              Sign out
            </button>
          </div>
        </div>

        <NewSongForm ownerId={ownerId} onCreated={onSelect} />

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

        <SectionLabel>Existing songs</SectionLabel>
        {songs === null ? (
          <Muted>Loading…</Muted>
        ) : songs.length === 0 ? (
          <Muted>
            No songs yet. Create one above, or publish a song from Pipeline / Vocal Booth first.
          </Muted>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {songs.map((song) => {
              const record = (song.record ?? {}) as { charter?: object };
              const hasChart = !!record.charter;
              return (
                <li
                  key={song.id}
                  onClick={() => onSelect(song)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelect(song);
                    }
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: hasChart ? 'rgba(232,200,64,0.05)' : 'rgba(255,255,255,0.04)',
                    border: hasChart
                      ? '1px solid rgba(232,200,64,0.25)'
                      : '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{song.title}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: monoFont,
                        marginTop: 2,
                      }}
                    >
                      {song.key} · {song.bpm} bpm · {song.lead_gender} lead ·{' '}
                      {hasChart ? 'chart saved' : 'no chart yet'}
                    </div>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18 }}>›</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewSongForm({
  ownerId,
  onCreated,
}: {
  ownerId: string;
  onCreated: (song: Song) => void;
}) {
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
      const song = await createSong(
        { title: title.trim(), key, bpm: Number(bpm), lead_gender: leadGender },
        ownerId,
      );
      onCreated(song);
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
      <SectionLabel>+ New chart</SectionLabel>
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
            background: status === 'saving' ? 'rgba(232,200,64,0.4)' : '#E8C840',
            color: '#0a0a0a',
            fontWeight: 600,
            fontSize: 13,
            cursor: status === 'saving' ? 'wait' : 'pointer',
            fontFamily: sansFont,
          }}
        >
          {status === 'saving' ? 'Creating…' : 'Create + open chart'}
        </button>
        {error && <div style={{ color: '#D94545', fontSize: 12 }}>{error}</div>}
      </div>
    </form>
  );
}

const btnSecondary: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.6)',
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: monoFont,
};

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
