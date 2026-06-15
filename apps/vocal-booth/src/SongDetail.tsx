import type { Song } from './lib/songs';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

export default function SongDetail({
  song,
  ownedByMe,
  onBack,
}: {
  song: Song;
  ownedByMe: boolean;
  onBack: () => void;
}) {
  const created = new Date(song.created_at).toLocaleString();
  const updated = new Date(song.updated_at).toLocaleString();

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
            ← Library
          </button>
          <div
            style={{
              fontSize: 10,
              fontFamily: monoFont,
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {ownedByMe ? 'owned' : 'shared'}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>{song.title}</h1>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              fontFamily: monoFont,
            }}
          >
            {song.key} · {song.bpm} bpm · {song.lead_gender} lead · {song.visibility}
          </div>
        </div>

        <SectionLabel>Record</SectionLabel>
        <Kv k="id" v={song.id} mono />
        <Kv k="owner_id" v={song.owner_id} mono />
        <Kv k="title" v={song.title} />
        <Kv k="key" v={song.key} mono />
        <Kv k="bpm" v={String(song.bpm)} mono />
        <Kv k="lead_gender" v={song.lead_gender} mono />
        <Kv k="visibility" v={song.visibility} mono />
        <Kv k="created_at" v={created} mono />
        <Kv k="updated_at" v={updated} mono />

        <SectionLabel>Sections</SectionLabel>
        <Muted>
          No sections yet. Pipeline will populate <code>sections</code>, <code>parts</code>, and
          the stems manifest in a future slice; for now this song carries only the
          metadata above.
        </Muted>
      </div>
    </div>
  );
}

function Kv({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        fontSize: 12,
      }}
    >
      <span
        style={{
          color: 'rgba(255,255,255,0.4)',
          fontFamily: monoFont,
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: mono ? monoFont : sansFont,
          wordBreak: 'break-all',
        }}
      >
        {v}
      </span>
    </div>
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
        margin: '24px 0 10px',
      }}
    >
      {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}
