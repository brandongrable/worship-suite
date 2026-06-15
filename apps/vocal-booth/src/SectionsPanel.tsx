import { useEffect, useMemo, useState } from 'react';
import {
  PART_COLOR,
  SECTION_META,
  SECTION_TYPES,
  sectionLabel,
  sectionShortLabel,
  type PartArrangement,
  type Section,
  type SectionType,
} from '@worship/core';
import { saveSongSections, type Song } from './lib/songs';

const monoFont = "'JetBrains Mono', 'SF Mono', monospace";
const sansFont = "'DM Sans', sans-serif";

const HARMONY_PARTS: ReadonlyArray<'soprano' | 'alto' | 'tenor' | 'baritone'> = [
  'soprano',
  'alto',
  'tenor',
  'baritone',
];
const ARRANGEMENT_VALUES: ReadonlyArray<PartArrangement> = [
  'inactive',
  'unison',
  'harmony',
];

type DraftSection = Section & {
  // Internal-only flag so editing controls know what the user touched.
  _dirty?: boolean;
};

let _uid = 0;
const localUid = () => `local_${Date.now()}_${++_uid}`;

function defaultSection(type: SectionType, instanceNumber: number): DraftSection {
  return {
    id: localUid(),
    type,
    instanceNumber,
    startTime: 0,
    endTime: 0,
    partStatus: {
      soprano: 'inactive',
      alto: 'inactive',
      tenor: 'inactive',
      baritone: 'inactive',
    },
  };
}

function loadFromRecord(record: unknown): DraftSection[] {
  if (!record || typeof record !== 'object') return [];
  const r = record as { sections?: unknown };
  if (!Array.isArray(r.sections)) return [];
  return r.sections
    .map((raw): DraftSection | null => {
      if (!raw || typeof raw !== 'object') return null;
      const s = raw as Partial<Section>;
      if (!s.type || !(SECTION_TYPES as readonly string[]).includes(s.type as string)) {
        return null;
      }
      return {
        id: typeof s.id === 'string' ? s.id : localUid(),
        type: s.type as SectionType,
        instanceNumber: typeof s.instanceNumber === 'number' ? s.instanceNumber : 1,
        label: typeof s.label === 'string' ? s.label : undefined,
        shortLabel: typeof s.shortLabel === 'string' ? s.shortLabel : undefined,
        startTime: typeof s.startTime === 'number' ? s.startTime : 0,
        endTime: typeof s.endTime === 'number' ? s.endTime : 0,
        partStatus: {
          soprano: coerceArrangement(s.partStatus?.soprano),
          alto: coerceArrangement(s.partStatus?.alto),
          tenor: coerceArrangement(s.partStatus?.tenor),
          baritone: coerceArrangement(s.partStatus?.baritone),
        },
      };
    })
    .filter((s): s is DraftSection => s !== null)
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
}

function coerceArrangement(v: unknown): PartArrangement {
  return v === 'unison' || v === 'harmony' ? v : 'inactive';
}

export default function SectionsPanel({
  song,
  ownedByMe,
  onUpdated,
}: {
  song: Song;
  ownedByMe: boolean;
  onUpdated: (next: Song) => void;
}) {
  const [drafts, setDrafts] = useState<DraftSection[]>(() => loadFromRecord(song.record));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // If the parent ships a fresh song row (e.g. after stem uploads),
  // resync the draft list only if the user hasn't started editing.
  useEffect(() => {
    if (status === 'saving') return;
    setDrafts(loadFromRecord(song.record));
    setStatus('idle');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  const hasOverlap = useMemo(() => {
    for (let i = 1; i < drafts.length; i++) {
      const prev = drafts[i - 1];
      const curr = drafts[i];
      if (!prev || !curr) continue;
      if ((curr.startTime ?? 0) < (prev.endTime ?? 0)) return true;
    }
    return false;
  }, [drafts]);

  function setDraft(idx: number, patch: Partial<DraftSection>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === idx ? { ...d, ...patch, _dirty: true } : d)),
    );
    setStatus('idle');
  }

  function setPartStatus(idx: number, part: 'soprano' | 'alto' | 'tenor' | 'baritone', value: PartArrangement) {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === idx
          ? {
              ...d,
              partStatus: { ...(d.partStatus ?? {}), [part]: value },
              _dirty: true,
            }
          : d,
      ),
    );
    setStatus('idle');
  }

  function move(idx: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      const a = next[idx];
      const b = next[swap];
      if (!a || !b) return prev;
      next[idx] = b;
      next[swap] = a;
      return next;
    });
    setStatus('idle');
  }

  function remove(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setStatus('idle');
  }

  function addRow() {
    // Default new sections to a VERSE with instanceNumber = next available
    // for that type, and start time picking up where the last section ended.
    const nextStart = drafts.length
      ? Math.max(...drafts.map((d) => d.endTime ?? 0))
      : 0;
    const verseCount = drafts.filter((d) => d.type === 'VERSE').length;
    setDrafts((prev) => [
      ...prev,
      {
        ...defaultSection('VERSE', verseCount + 1),
        startTime: nextStart,
        endTime: nextStart,
      },
    ]);
    setStatus('idle');
  }

  async function save() {
    setStatus('saving');
    setError(null);
    try {
      const clean = drafts
        .map((d) => {
          // Drop the internal _dirty flag before persisting.
          const { _dirty, ...rest } = d;
          void _dirty;
          return rest;
        })
        .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      const next = await saveSongSections(song, clean);
      onUpdated(next);
      setStatus('saved');
      setTimeout(() => {
        setStatus((s) => (s === 'saved' ? 'idle' : s));
      }, 2000);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!ownedByMe) {
    return (
      <ReadOnlyView drafts={drafts} />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {error && (
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
          {error}
        </div>
      )}
      {hasOverlap && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: 'rgba(232,200,64,0.06)',
            border: '1px solid rgba(232,200,64,0.3)',
            color: '#E8C840',
            fontSize: 12,
            fontFamily: monoFont,
          }}
        >
          Sections overlap. Adjust startTime / endTime so each section begins
          after the previous one ends.
        </div>
      )}

      {drafts.length === 0 && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.02)',
            border: '1px dashed rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 13,
          }}
        >
          No sections yet. Add rows below; each one becomes a block in the mixer's section bar.
        </div>
      )}

      {drafts.map((d, idx) => {
        const label = sectionLabel(d);
        const code = sectionShortLabel(d);
        return (
          <div
            key={d.id}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 32,
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#E8C840',
                  fontFamily: monoFont,
                }}
                title={`${label} (${code})`}
              >
                {code}
              </div>
              <select
                value={d.type}
                onChange={(e) => setDraft(idx, { type: e.target.value as SectionType })}
                style={selectStyle}
              >
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SECTION_META[t].label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={1}
                value={d.instanceNumber}
                onChange={(e) => setDraft(idx, { instanceNumber: Number(e.target.value) })}
                style={{ ...inputStyle, width: 60 }}
                title="Instance number (0 hides it from the label)"
              />
              <input
                type="number"
                min={0}
                step={0.001}
                value={d.startTime ?? 0}
                onChange={(e) => setDraft(idx, { startTime: Number(e.target.value) })}
                style={{ ...inputStyle, width: 90 }}
                title="Start time (sec)"
              />
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>→</span>
              <input
                type="number"
                min={0}
                step={0.001}
                value={d.endTime ?? 0}
                onChange={(e) => setDraft(idx, { endTime: Number(e.target.value) })}
                style={{ ...inputStyle, width: 90 }}
                title="End time (sec)"
              />
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={btnIcon} title="Move up">
                  ▲
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === drafts.length - 1}
                  style={btnIcon}
                  title="Move down"
                >
                  ▼
                </button>
                <button
                  onClick={() => remove(idx)}
                  style={{ ...btnIcon, borderColor: 'rgba(217,69,69,0.3)', color: '#D94545' }}
                  title="Remove section"
                >
                  ✕
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {HARMONY_PARTS.map((part) => (
                <PartChip
                  key={part}
                  part={part}
                  value={(d.partStatus?.[part] as PartArrangement) ?? 'inactive'}
                  onChange={(v) => setPartStatus(idx, part, v)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={addRow} style={btnSecondary}>
          + Add section
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={save}
          disabled={status === 'saving'}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background:
              status === 'saved' ? '#5B8C3E' : status === 'error' ? '#D94545' : '#9B6AD8',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: status === 'saving' ? 'wait' : 'pointer',
            fontFamily: sansFont,
          }}
        >
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved'
              ? 'Saved'
              : status === 'error'
                ? 'Save failed'
                : 'Save sections'}
        </button>
      </div>
    </div>
  );
}

function ReadOnlyView({ drafts }: { drafts: DraftSection[] }) {
  if (drafts.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
        No structured sections yet.
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {drafts.map((d) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            fontSize: 12,
          }}
        >
          <span style={{ width: 32, color: '#E8C840', fontFamily: monoFont, fontWeight: 700 }}>
            {sectionShortLabel(d)}
          </span>
          <span style={{ flex: 1, color: '#fff', fontFamily: sansFont }}>{sectionLabel(d)}</span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontFamily: monoFont, fontSize: 11 }}>
            {(d.startTime ?? 0).toFixed(2)}–{(d.endTime ?? 0).toFixed(2)}s
          </span>
        </div>
      ))}
    </div>
  );
}

function PartChip({
  part,
  value,
  onChange,
}: {
  part: 'soprano' | 'alto' | 'tenor' | 'baritone';
  value: PartArrangement;
  onChange: (v: PartArrangement) => void;
}) {
  const color = PART_COLOR[part];
  const isActive = value !== 'inactive';
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        borderRadius: 6,
        background: isActive ? `${color}15` : 'rgba(255,255,255,0.02)',
        border: isActive ? `1px solid ${color}55` : '1px solid rgba(255,255,255,0.08)',
        fontSize: 11,
        fontFamily: monoFont,
        color: isActive ? color : 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        fontWeight: 700,
      }}
      title={`${part[0]?.toUpperCase()}${part.slice(1)} arrangement`}
    >
      <span>{part[0]?.toUpperCase()}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PartArrangement)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          fontFamily: 'inherit',
          fontSize: 10,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {ARRANGEMENT_VALUES.map((v) => (
          <option key={v} value={v} style={{ color: '#000' }}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 12,
  fontFamily: monoFont,
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  minWidth: 130,
};

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
