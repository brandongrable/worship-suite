import { useEffect, useRef, useState } from 'react';
import type { Song } from './lib/songs';
import { removeStem, uploadAndRegisterStem } from './lib/songs';
import {
  addShare,
  findUserIdByEmail,
  listSharesForSong,
  removeShare,
  type ShareWithRecipient,
} from './lib/shares';
import { supabase } from './lib/supabase';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

// Track slots that map 1:1 to mixer channels. Order matches the
// mixer's TRACKS array so uploads and playback line up visually.
const TRACK_SLOTS: { id: string; label: string; color: string }[] = [
  { id: 'click', label: 'Click', color: '#8A8A8A' },
  { id: 'band', label: 'Band', color: '#4A9EE5' },
  { id: 'lead', label: 'Lead', color: '#5BB8D4' },
  { id: 'soprano', label: 'Soprano', color: '#E8C840' },
  { id: 'alto', label: 'Alto', color: '#D94545' },
  { id: 'tenor', label: 'Tenor', color: '#4FBCD0' },
  { id: 'baritone', label: 'Baritone', color: '#5B8C3E' },
];

type RecordSummary = {
  notes_total?: number;
  words_total?: number;
  word_start_notes?: number;
  continuation_notes?: number;
  instrumental_notes?: number;
  measure_count?: number;
  tempo_bpm?: number;
  ticks_per_beat?: number;
  key_fifths?: number;
  beats_per_bar?: number;
  divisions?: number;
};

type RecordShape = {
  song?: string;
  source_midi?: string;
  source_json?: string;
  output_musicxml?: string;
  summary?: RecordSummary;
  items?: Array<{ kind: string }>;
  structure_check?: { ok: boolean; message: string } | null;
  stems?: Record<string, string>;
};

export default function SongDetail({
  song: songProp,
  ownedByMe,
  onBack,
  onOpenMixer,
  onUpdated,
}: {
  song: Song;
  ownedByMe: boolean;
  onBack: () => void;
  onOpenMixer: () => void;
  onUpdated: (next: Song) => void;
}) {
  // Local copy so stem uploads/removals reflect immediately without
  // waiting for the parent to round-trip a refetch. The parent is
  // notified via onUpdated so it stays in sync (the mixer route reads
  // App's selectedSong, which must include freshly uploaded stems).
  const [song, setSong] = useState<Song>(songProp);
  useEffect(() => { setSong(songProp); }, [songProp.id]);

  const created = new Date(song.created_at).toLocaleString();
  const updated = new Date(song.updated_at).toLocaleString();
  const stemCount = Object.keys(((song.record ?? {}) as RecordShape).stems ?? {}).length;

  function handleSongUpdate(next: Song) {
    setSong(next);
    onUpdated(next);
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
              marginBottom: 16,
            }}
          >
            {song.key} · {song.bpm} bpm · {song.lead_gender} lead · {song.visibility}
          </div>
          <button
            onClick={onOpenMixer}
            disabled={stemCount === 0}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background:
                stemCount > 0
                  ? 'linear-gradient(135deg, #E8C840, #D94545)'
                  : 'rgba(255,255,255,0.06)',
              color: stemCount > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              fontWeight: 700,
              cursor: stemCount > 0 ? 'pointer' : 'not-allowed',
              fontFamily: sansFont,
              boxShadow: stemCount > 0 ? '0 4px 20px rgba(232,200,64,0.25)' : 'none',
            }}
          >
            {stemCount > 0
              ? `▶ Open in Mixer (${stemCount} stem${stemCount === 1 ? '' : 's'})`
              : '▶ Open in Mixer · no stems yet'}
          </button>
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

        <SectionLabel>Pipeline payload</SectionLabel>
        <PipelinePayload record={song.record} />

        <SectionLabel>Stems</SectionLabel>
        <StemsPanel
          song={song}
          ownedByMe={ownedByMe}
          onUpdated={handleSongUpdate}
        />

        {ownedByMe && (
          <>
            <SectionLabel>Sharing</SectionLabel>
            <SharingPanel songId={song.id} />
          </>
        )}

        <SectionLabel>Sections</SectionLabel>
        <Muted>
          No structured sections yet. Pipeline will populate <code>sections</code> and{' '}
          <code>parts</code> as dedicated columns in a future slice.
        </Muted>
      </div>
    </div>
  );
}

function StemsPanel({
  song,
  ownedByMe,
  onUpdated,
}: {
  song: Song;
  ownedByMe: boolean;
  onUpdated: (next: Song) => void;
}) {
  const stems = (((song.record ?? {}) as RecordShape).stems ?? {}) as Record<
    string,
    string
  >;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function preview(track: string, storageKey: string) {
    setErr(null);
    if (playing === track) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    setPreviewLoading(track);
    try {
      const objectPath = storageKey.replace(/^stems\//, '');
      const { data, error } = await supabase.storage
        .from('stems')
        .createSignedUrl(objectPath, 3600);
      if (error) throw error;
      audioRef.current?.pause();
      const audio = new Audio(data.signedUrl);
      audio.onended = () => setPlaying(null);
      audio.onerror = () => {
        setErr(`Audio element failed to load ${track}`);
        setPlaying(null);
      };
      audioRef.current = audio;
      await audio.play();
      setPlaying(track);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setPlaying(null);
    } finally {
      setPreviewLoading(null);
    }
  }

  async function upload(track: string, file: File) {
    setErr(null);
    setBusy(track);
    try {
      const next = await uploadAndRegisterStem(song, track, file);
      onUpdated(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(track: string) {
    if (!confirm(`Remove "${track}" stem? This deletes the file from Storage.`)) return;
    setErr(null);
    setBusy(track);
    if (playing === track) {
      audioRef.current?.pause();
      setPlaying(null);
    }
    try {
      const next = await removeStem(song, track);
      onUpdated(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!ownedByMe && Object.keys(stems).length === 0) {
    return <Muted>No stems uploaded yet.</Muted>;
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {err && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(217,69,69,0.06)',
            border: '1px solid rgba(217,69,69,0.3)',
            color: '#D94545',
            fontSize: 12,
            fontFamily: monoFont,
          }}
        >
          {err}
        </div>
      )}
      {TRACK_SLOTS.map((slot) => {
        const storageKey = stems[slot.id];
        const isPlaying = playing === slot.id;
        const isPreviewLoading = previewLoading === slot.id;
        const isBusy = busy === slot.id;
        const loaded = !!storageKey;

        // Non-owners only see populated slots, and read-only.
        if (!ownedByMe && !loaded) return null;

        return (
          <div
            key={slot.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 8,
              background: loaded
                ? `${slot.color}0a`
                : 'rgba(255,255,255,0.02)',
              border: loaded
                ? `1px solid ${slot.color}55`
                : '1px dashed rgba(255,255,255,0.1)',
              fontSize: 12,
            }}
          >
            <span
              style={{
                color: loaded ? slot.color : 'rgba(255,255,255,0.4)',
                fontFamily: monoFont,
                textTransform: 'uppercase',
                fontSize: 10,
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              {slot.label}
            </span>

            <span
              style={{
                fontFamily: monoFont,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 11,
                wordBreak: 'break-all',
              }}
            >
              {isBusy
                ? 'Working…'
                : loaded
                  ? storageKey.split('/').pop()
                  : ownedByMe
                    ? 'No file — pick one below'
                    : '—'}
            </span>

            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {loaded && (
                <button
                  onClick={() => preview(slot.id, storageKey)}
                  disabled={isPreviewLoading || isBusy}
                  style={btnPrimary(isPlaying ? '#9B6AD8' : 'transparent', isPlaying ? '#9B6AD8' : 'rgba(255,255,255,0.15)', isPlaying ? '#fff' : 'rgba(255,255,255,0.75)')}
                >
                  {isPreviewLoading ? '…' : isPlaying ? '◼' : '▶'}
                </button>
              )}
              {ownedByMe && (
                <>
                  <label style={btnLabel(isBusy)}>
                    {loaded ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept=".mp3,.wav,.ogg,.flac,.m4a,.aac"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) upload(slot.id, f);
                        e.target.value = '';
                      }}
                      disabled={isBusy}
                    />
                  </label>
                  {loaded && (
                    <button
                      onClick={() => remove(slot.id)}
                      disabled={isBusy}
                      style={btnDanger}
                    >
                      ✕
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SharingPanel({ songId }: { songId: string }) {
  const [shares, setShares] = useState<ShareWithRecipient[] | null>(null);
  const [email, setEmail] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState<'idle' | 'looking' | 'sharing'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function refresh() {
    try {
      setShares(await listSharesForSong(songId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  async function submitShare() {
    const trimmed = email.trim();
    if (!trimmed) return;
    setErr(null);
    setInfo(null);
    setStatus('looking');
    try {
      const userId = await findUserIdByEmail(trimmed);
      if (!userId) {
        setErr(`No Worship Suite account found for ${trimmed}.`);
        setStatus('idle');
        return;
      }
      setStatus('sharing');
      await addShare(songId, userId, canEdit);
      setEmail('');
      setCanEdit(false);
      setInfo(`Shared with ${trimmed}.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus('idle');
    }
  }

  async function revoke(userId: string) {
    if (!confirm('Revoke this share? The recipient will lose access.')) return;
    setErr(null);
    try {
      await removeShare(songId, userId);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {err && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(217,69,69,0.06)',
            border: '1px solid rgba(217,69,69,0.3)',
            color: '#D94545',
            fontSize: 12,
            fontFamily: monoFont,
          }}
        >
          {err}
        </div>
      )}
      {info && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(91,140,62,0.08)',
            border: '1px solid rgba(91,140,62,0.3)',
            color: '#5B8C3E',
            fontSize: 12,
            fontFamily: monoFont,
          }}
        >
          {info}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 12,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="email"
          placeholder="recipient@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitShare();
          }}
          style={{
            flex: '1 1 200px',
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            fontSize: 12,
            fontFamily: sansFont,
          }}
        />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            fontFamily: monoFont,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={canEdit}
            onChange={(e) => setCanEdit(e.target.checked)}
          />
          can edit
        </label>
        <button
          onClick={submitShare}
          disabled={status !== 'idle' || !email.trim()}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: 'none',
            background: status !== 'idle' ? 'rgba(155,106,216,0.4)' : '#9B6AD8',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            cursor: status !== 'idle' ? 'wait' : 'pointer',
            fontFamily: sansFont,
          }}
        >
          {status === 'looking' ? 'Looking up…' : status === 'sharing' ? 'Sharing…' : 'Share'}
        </button>
      </div>

      {shares === null ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading shares…</div>
      ) : shares.length === 0 ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          Not shared with anyone yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {shares.map((s) => (
            <div
              key={s.user_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    fontFamily: sansFont,
                  }}
                >
                  {s.display_name ?? s.user_id}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.4)',
                    fontFamily: monoFont,
                    marginTop: 2,
                  }}
                >
                  {s.can_edit ? 'editor' : 'reader'} ·{' '}
                  {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => revoke(s.user_id)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(217,69,69,0.3)',
                  color: '#D94545',
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: monoFont,
                }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function btnPrimary(bg: string, border: string, color: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    color,
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: monoFont,
    fontWeight: 600,
    cursor: 'pointer',
    minWidth: 30,
  };
}

function btnLabel(busy: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: busy ? 'rgba(255,255,255,0.04)' : 'rgba(232,200,64,0.1)',
    border: busy ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(232,200,64,0.3)',
    color: busy ? 'rgba(255,255,255,0.4)' : '#E8C840',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: monoFont,
    fontWeight: 600,
    cursor: busy ? 'wait' : 'pointer',
  };
}

const btnDanger: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(217,69,69,0.3)',
  color: '#D94545',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: monoFont,
  fontWeight: 600,
  cursor: 'pointer',
};

function PipelinePayload({ record }: { record: Song['record'] }) {
  const r = (record ?? {}) as RecordShape;
  const summary = r.summary;
  const itemCount = r.items?.length ?? 0;

  if (!summary && !r.source_midi) {
    return (
      <Muted>
        This song was published with no Pipeline payload (just the metadata above).
      </Muted>
    );
  }

  return (
    <div>
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 6,
            marginBottom: 12,
          }}
        >
          <Stat label="tempo" value={`${summary.tempo_bpm ?? '?'} bpm`} />
          <Stat
            label="key fifths"
            value={
              summary.key_fifths != null
                ? `${summary.key_fifths >= 0 ? '+' : ''}${summary.key_fifths}`
                : '?'
            }
          />
          <Stat label="meter" value={`${summary.beats_per_bar ?? '?'}/4`} />
          <Stat label="measures" value={String(summary.measure_count ?? '?')} />
          <Stat label="words" value={String(summary.words_total ?? '?')} />
          <Stat label="notes" value={String(summary.notes_total ?? '?')} />
          <Stat
            label="continuations"
            value={String(summary.continuation_notes ?? '?')}
          />
          <Stat
            label="instrumental"
            value={String(summary.instrumental_notes ?? '?')}
          />
        </div>
      )}
      {itemCount > 0 && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(232,200,64,0.06)',
            border: '1px solid rgba(232,200,64,0.2)',
            fontSize: 12,
            fontFamily: monoFont,
            color: '#E8C840',
            marginBottom: 8,
          }}
        >
          {itemCount} review flag{itemCount === 1 ? '' : 's'} from the aligner — open
          Pipeline to inspect.
        </div>
      )}
      {r.structure_check && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: r.structure_check.ok
              ? 'rgba(91,140,62,0.08)'
              : 'rgba(217,69,69,0.08)',
            border: r.structure_check.ok
              ? '1px solid rgba(91,140,62,0.3)'
              : '1px solid rgba(217,69,69,0.3)',
            fontSize: 12,
            color: r.structure_check.ok ? '#5B8C3E' : '#D94545',
            marginBottom: 8,
          }}
        >
          structure: {r.structure_check.message}
        </div>
      )}
      {r.source_midi && <Kv k="source midi" v={r.source_midi} mono />}
      {r.source_json && <Kv k="source json" v={r.source_json} mono />}
      {r.output_musicxml && <Kv k="output xml" v={r.output_musicxml} mono />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '8px 10px',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontFamily: monoFont,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontFamily: monoFont, fontWeight: 600 }}>{value}</div>
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
