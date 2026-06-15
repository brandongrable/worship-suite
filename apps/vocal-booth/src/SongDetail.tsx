import { useEffect, useRef, useState } from 'react';
import type { Song } from './lib/songs';
import { supabase } from './lib/supabase';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

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

        <SectionLabel>Pipeline payload</SectionLabel>
        <PipelinePayload record={song.record} />

        <SectionLabel>Stems</SectionLabel>
        <StemsList record={song.record} />

        <SectionLabel>Sections</SectionLabel>
        <Muted>
          No structured sections yet. Pipeline will populate <code>sections</code> and{' '}
          <code>parts</code> as dedicated columns in a future slice.
        </Muted>
      </div>
    </div>
  );
}

function StemsList({ record }: { record: Song['record'] }) {
  const r = (record ?? {}) as RecordShape;
  const stems = r.stems;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      // Stop any audio when leaving the page.
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  async function play(track: string, storageKey: string) {
    setErr(null);

    // Toggle off if this track is the one playing.
    if (playing === track) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    setLoading(track);
    try {
      // Storage key is "stems/<song_id>/<track>.<ext>". The bucket
      // create-signed-url API wants the path WITHIN the bucket.
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
      setLoading(null);
    }
  }

  if (!stems || Object.keys(stems).length === 0) {
    return (
      <Muted>
        No stems uploaded yet. Pipeline writes audio files to the <code>stems</code>{' '}
        bucket and registers them in <code>record.stems</code>.
      </Muted>
    );
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
      {Object.entries(stems).map(([track, storageKey]) => {
        const isPlaying = playing === track;
        const isLoading = loading === track;
        return (
          <div
            key={track}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: '8px 12px',
              borderRadius: 6,
              background: isPlaying
                ? 'rgba(155,106,216,0.08)'
                : 'rgba(91,140,62,0.06)',
              border: isPlaying
                ? '1px solid rgba(155,106,216,0.4)'
                : '1px solid rgba(91,140,62,0.2)',
              fontSize: 12,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            <span
              style={{
                color: isPlaying ? '#9B6AD8' : '#5B8C3E',
                fontFamily: monoFont,
                textTransform: 'uppercase',
                fontSize: 10,
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {track}
            </span>
            <span
              style={{
                fontFamily: monoFont,
                color: 'rgba(255,255,255,0.6)',
                wordBreak: 'break-all',
                fontSize: 11,
              }}
            >
              {storageKey}
            </span>
            <button
              onClick={() => play(track, storageKey)}
              disabled={isLoading}
              style={{
                background: isPlaying ? '#9B6AD8' : 'transparent',
                border: `1px solid ${isPlaying ? '#9B6AD8' : 'rgba(255,255,255,0.15)'}`,
                color: isPlaying ? '#fff' : 'rgba(255,255,255,0.7)',
                padding: '4px 12px',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: monoFont,
                cursor: isLoading ? 'wait' : 'pointer',
                fontWeight: 600,
              }}
            >
              {isLoading ? '…' : isPlaying ? '◼ Stop' : '▶ Play'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

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
