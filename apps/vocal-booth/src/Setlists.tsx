import { useEffect, useState, type FormEvent } from 'react';
import {
  createSetlist,
  deleteSetlist,
  listMySetlists,
  type SetlistWithCount,
} from './lib/setlists';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

export default function Setlists({
  ownerId,
  onBack,
  onSelect,
}: {
  ownerId: string;
  onBack: () => void;
  onSelect: (id: string) => void;
}) {
  const [setlists, setSetlists] = useState<SetlistWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setError(null);
    setRefreshing(true);
    try {
      setSetlists(await listMySetlists());
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
          <button onClick={onBack} style={btnSecondary}>
            ← Home
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>My Setlists</h1>
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{ ...btnSecondary, width: 70, cursor: refreshing ? 'wait' : 'pointer' }}
          >
            {refreshing ? '…' : '⟳ Refresh'}
          </button>
        </div>

        <NewSetlistForm ownerId={ownerId} onCreated={refresh} />

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

        <SectionLabel>Setlists</SectionLabel>
        {setlists === null ? (
          <Muted>Loading…</Muted>
        ) : setlists.length === 0 ? (
          <Muted>No setlists yet. Create one above.</Muted>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {setlists.map((sl) => (
              <SetlistRow
                key={sl.id}
                setlist={sl}
                onSelect={() => onSelect(sl.id)}
                ownedByMe={sl.owner_id === ownerId}
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

function NewSetlistForm({ ownerId, onCreated }: { ownerId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError(null);
    try {
      await createSetlist(name, ownerId);
      setName('');
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
      <SectionLabel>New setlist</SectionLabel>
      <div style={{ display: 'grid', gap: 8 }}>
        <input
          required
          placeholder="Name (e.g. Sunday morning · Apr 5)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={status === 'saving' || !name.trim()}
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
          {status === 'saving' ? 'Creating…' : 'Create setlist'}
        </button>
        {error && <div style={{ color: '#D94545', fontSize: 12 }}>{error}</div>}
      </div>
    </form>
  );
}

function SetlistRow({
  setlist,
  onSelect,
  ownedByMe,
  onDeleted,
  onDeleteError,
}: {
  setlist: SetlistWithCount;
  onSelect: () => void;
  ownedByMe: boolean;
  onDeleted: () => void;
  onDeleteError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete setlist "${setlist.name}"? Songs are not deleted.`)) return;
    setBusy(true);
    try {
      await deleteSetlist(setlist.id);
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
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{setlist.name}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: monoFont }}>
          {setlist.song_count} song{setlist.song_count === 1 ? '' : 's'} ·{' '}
          {new Date(setlist.created_at).toLocaleDateString()}
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
