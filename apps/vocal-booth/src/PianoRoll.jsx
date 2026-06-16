import { useMemo } from 'react';

/* ── Color System (matches WorshipMixer) ── */
const PART_COLORS = {
  soprano: '#E8C840',
  alto: '#D94545',
  tenor: '#4FBCD0',
  baritone: '#5B8C3E',
};
const UNISON_COLOR = '#9B6AD8';
const INACTIVE_COLOR = 'rgba(255,255,255,0.18)';

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function pitchLabel(midi) {
  const n = MIDI_NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${n}${octave}`;
}

/**
 * Horizontal piano-roll lane that scrolls with playback. Shows a
 * `windowSec`-wide slice centered on the playhead; the user sees what
 * just passed on the left and what's coming up on the right.
 *
 * Notes are color-coded against `myPart` against the active section's
 * partStatus:
 *   - section says you sing this in unison    → unison lavender
 *   - section says you sing this in harmony   → your part's color
 *     (the *displayed* notes are still the lead unison line — Phase
 *     4.3 doesn't ship per-voice harmony note data, so this color
 *     just signals "your part diverges here; listen for it")
 *   - section says you're not singing here    → faded grey
 *
 * @param {{
 *   notes: { onset: number, duration: number, pitch: number, sectionId: string, syllable?: string }[],
 *   currentTime: number,
 *   activeSection?: { id: string, partStatus: Record<string, string> },
 *   myPart: 'soprano' | 'alto' | 'tenor' | 'baritone' | 'unison',
 *   windowSec?: number,
 * }} props
 */
export default function PianoRoll({
  notes,
  currentTime,
  activeSection = null,
  myPart,
  windowSec = 12,
}) {
  // Auto-fit the pitch range to the song with a couple semitones of
  // padding so notes never sit flush against the top or bottom edge.
  const pitchRange = useMemo(() => {
    if (!notes || notes.length === 0) {
      return { min: 55, max: 72 }; // sensible default (≈ A3–C5)
    }
    let min = Infinity;
    let max = -Infinity;
    for (const n of notes) {
      if (n.pitch < min) min = n.pitch;
      if (n.pitch > max) max = n.pitch;
    }
    return { min: min - 2, max: max + 2 };
  }, [notes]);
  const pitchSpan = pitchRange.max - pitchRange.min;

  const windowStart = currentTime - windowSec / 2;
  const windowEnd = currentTime + windowSec / 2;

  // Visible notes only — keeps the DOM small even on very long songs.
  const visibleNotes = useMemo(() => {
    if (!notes) return [];
    return notes.filter(
      (n) => n.onset + n.duration > windowStart && n.onset < windowEnd,
    );
  }, [notes, windowStart, windowEnd]);

  function noteColor(note) {
    if (!activeSection) return UNISON_COLOR;
    const status = activeSection.partStatus?.[myPart] ?? 'inactive';
    if (status === 'inactive') return INACTIVE_COLOR;
    if (status === 'harmony') {
      return PART_COLORS[myPart] ?? UNISON_COLOR;
    }
    return UNISON_COLOR;
  }

  const currentNote = visibleNotes.find(
    (n) => currentTime >= n.onset && currentTime < n.onset + n.duration,
  );

  return (
    <div
      style={{
        position: 'relative',
        height: 130,
        background:
          'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.55) 100%)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        marginTop: 8,
      }}
    >
      {/* Horizontal grid lines at each octave */}
      {(() => {
        const lines = [];
        const startC = Math.ceil(pitchRange.min / 12) * 12;
        for (let p = startC; p <= pitchRange.max; p += 12) {
          const y = ((pitchRange.max - p) / pitchSpan) * 100;
          lines.push(
            <div
              key={`grid-${p}`}
              style={{
                position: 'absolute',
                left: 28,
                right: 0,
                top: `${y}%`,
                height: 1,
                background: 'rgba(255,255,255,0.05)',
                pointerEvents: 'none',
              }}
            />,
          );
          lines.push(
            <div
              key={`label-${p}`}
              style={{
                position: 'absolute',
                left: 4,
                top: `calc(${y}% - 7px)`,
                fontSize: 9,
                color: 'rgba(255,255,255,0.3)',
                fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                pointerEvents: 'none',
              }}
            >
              {pitchLabel(p)}
            </div>,
          );
        }
        return lines;
      })()}

      {/* Notes */}
      <div style={{ position: 'absolute', inset: 0, left: 28 }}>
        {visibleNotes.map((note, i) => {
          const xLeft = ((note.onset - windowStart) / windowSec) * 100;
          const xWidth = (note.duration / windowSec) * 100;
          const yTop = ((pitchRange.max - note.pitch) / pitchSpan) * 100;
          const isCurrent = currentNote === note;
          const isPast = note.onset + note.duration < currentTime;
          const color = noteColor(note);
          return (
            <div
              key={`${note.onset}-${note.pitch}-${i}`}
              style={{
                position: 'absolute',
                left: `${xLeft}%`,
                width: `${Math.max(0.4, xWidth)}%`,
                top: `calc(${yTop}% - 5px)`,
                height: 10,
                background: color,
                borderRadius: 3,
                boxShadow: isCurrent
                  ? `0 0 12px ${color}, 0 0 0 1.5px rgba(255,255,255,0.5)`
                  : undefined,
                opacity: isPast ? 0.35 : 1,
                transition: 'opacity 0.15s, box-shadow 0.15s',
              }}
              title={`${pitchLabel(note.pitch)}${note.syllable ? ` · "${note.syllable}"` : ''}`}
            />
          );
        })}
      </div>

      {/* Syllable strip above notes — only the next few upcoming syllables */}
      <div
        style={{
          position: 'absolute',
          left: 28,
          right: 0,
          top: 4,
          height: 14,
          pointerEvents: 'none',
        }}
      >
        {visibleNotes
          .filter((n) => n.syllable && n.onset >= currentTime - 0.5)
          .slice(0, 8)
          .map((note, i) => {
            const xLeft = ((note.onset - windowStart) / windowSec) * 100;
            return (
              <span
                key={`syl-${i}`}
                style={{
                  position: 'absolute',
                  left: `${xLeft}%`,
                  fontSize: 10,
                  fontWeight: 600,
                  color:
                    currentNote === note
                      ? '#fff'
                      : 'rgba(255,255,255,0.55)',
                  fontFamily: "'DM Sans', sans-serif",
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                }}
              >
                {note.syllable}
              </span>
            );
          })}
      </div>

      {/* Playhead */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(50% + 14px)',
          top: 0,
          bottom: 0,
          width: 2,
          background: '#fff',
          boxShadow: '0 0 8px rgba(255,255,255,0.6)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Current-note pitch readout */}
      {currentNote && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            fontSize: 11,
            fontWeight: 700,
            color: noteColor(currentNote),
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            background: 'rgba(0,0,0,0.5)',
            padding: '2px 6px',
            borderRadius: 4,
            border: `1px solid ${noteColor(currentNote)}55`,
            pointerEvents: 'none',
          }}
        >
          {pitchLabel(currentNote.pitch)}
        </div>
      )}

      {/* Empty-state message when the song has no PartLayer yet */}
      {(!notes || notes.length === 0) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          No note data — run aligner with a structure file
        </div>
      )}
    </div>
  );
}
