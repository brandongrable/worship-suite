import { useEffect, useState } from 'react';
import {
  addSongToSetlist,
  getSetlistWithSongs,
  moveSongInSetlist,
  removeSongFromSetlist,
  renameSetlist,
  type Setlist,
  type SetlistSongRow,
} from './lib/setlists';
import { listMySongs, type Song } from './lib/songs';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

export default function SetlistDetail({
  setlistId,
  ownerId,
  onBack,
  onOpenSong,
}: {
  setlistId: string;
  ownerId: string;
  onBack: () => void;
  onOpenSong: (song: Song) => void;
}) {
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [songs, setSongs] = useState<SetlistSongRow[]>([]);
  const [allSongs, setAllSongs] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const data = await getSetlistWithSongs(setlistId);
      if (!data) {
        setError('Setlist not found or not accessible.');
        return;
      }
      setSetlist(data.setlist);
      setSongs(data.songs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    listMySongs()
      .then(setAllSongs)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
  }, [setlistId]);

  const ownedByMe = setlist?.owner_id === ownerId;
  const inSetlistIds = new Set(songs.map((s) => s.song.id));
  const candidateSongs =
    allSongs?.filter((s) => !inSetlistIds.has(s.id)) ?? [];

  async function handleAdd(songId: string) {
    setBusy(`add:${songId}`);
    try {
      await addSongToSetlist(setlistId, songId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(songId: string) {
    setBusy(`remove:${songId}`);
    try {
      await removeSongFromSetlist(setlistId, songId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleMove(songId: string, direction: 'up' | 'down') {
    setBusy(`move:${songId}`);
    try {
      await moveSongInSetlist(setlistId, songId, direction);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function commitRename() {
    if (editingName === null || !setlist || editingName.trim() === setlist.name) {
      setEditingName(null);
      return;
    }
    setBusy('rename');
    try {
      const next = await renameSetlist(setlistId, editingName);
      setSetlist(next);
      setEditingName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

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
            marginBottom: 16,
          }}
        >
          <button onClick={onBack} style={btnSecondary}>
            ← Setlists
          </button>
        </div>

        {setlist && (
          <div style={{ marginBottom: 24 }}>
            {editingName !== null && ownedByMe ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingName(null);
                  }}
                  style={{ ...inputStyle, fontSize: 22, fontWeight: 700 }}
                />
                <button onClick={commitRename} style={btnPrimary}>
                  Save
                </button>
              </div>
            ) : (
              <h1
                onClick={() => ownedByMe && setEditingName(setlist.name)}
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  margin: '0 0 6px',
                  cursor: ownedByMe ? 'text' : 'default',
                }}
                title={ownedByMe ? 'Click to rename' : ''}
              >
                {setlist.name}
              </h1>
            )}
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: monoFont }}>
              {songs.length} song{songs.length === 1 ? '' : 's'} ·{' '}
              {new Date(setlist.created_at).toLocaleDateString()}
              {!ownedByMe && ' · read only'}
            </div>
          </div>
        )}

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

        <SectionLabel>Songs in order</SectionLabel>
        {songs.length === 0 ? (
          <Muted>No songs yet. Add some from the picker below.</Muted>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {songs.map((row, idx) => {
              const moving = busy?.startsWith('move:') || busy?.startsWith('remove:');
              const stems = ((row.song.record ?? {}) as { stems?: object }).stems;
              const stemCount = stems ? Object.keys(stems).length : 0;
              return (
                <li
                  key={row.song.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'rgba(255,255,255,0.5)',
                      fontFamily: monoFont,
                      flexShrink: 0,
                    }}
                  >
                    {idx + 1}
                  </div>
                  <button
                    onClick={() => onOpenSong(row.song)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: '#fff',
                      padding: 0,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{row.song.title}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: monoFont,
                        marginTop: 2,
                      }}
                    >
                      {row.song.key} · {row.song.bpm} bpm · {stemCount} stem
                      {stemCount === 1 ? '' : 's'}
                    </div>
                  </button>
                  {ownedByMe && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleMove(row.song.id, 'up')}
                        disabled={idx === 0 || moving}
                        style={btnIcon}
                        title="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMove(row.song.id, 'down')}
                        disabled={idx === songs.length - 1 || moving}
                        style={btnIcon}
                        title="Move down"
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => handleRemove(row.song.id)}
                        disabled={moving}
                        style={{
                          ...btnIcon,
                          borderColor: 'rgba(217,69,69,0.3)',
                          color: '#D94545',
                        }}
                        title="Remove from setlist"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {ownedByMe && (
          <>
            <div style={{ height: 24 }} />
            <SectionLabel>Add a song</SectionLabel>
            {allSongs === null ? (
              <Muted>Loading library…</Muted>
            ) : candidateSongs.length === 0 ? (
              <Muted>Every visible song is already in this setlist.</Muted>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {candidateSongs.map((song) => (
                  <div
                    key={song.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{song.title}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.4)',
                          fontFamily: monoFont,
                          marginTop: 2,
                        }}
                      >
                        {song.key} · {song.bpm} bpm
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(song.id)}
                      disabled={busy === `add:${song.id}`}
                      style={btnPrimarySmall}
                    >
                      {busy === `add:${song.id}` ? '…' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
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

const btnPrimary: React.CSSProperties = {
  background: '#9B6AD8',
  border: 'none',
  color: '#fff',
  padding: '6px 14px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: sansFont,
};

const btnPrimarySmall: React.CSSProperties = {
  background: 'rgba(155,106,216,0.15)',
  border: '1px solid rgba(155,106,216,0.4)',
  color: '#9B6AD8',
  padding: '5px 10px',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: monoFont,
};

const btnIcon: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.6)',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: monoFont,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
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
