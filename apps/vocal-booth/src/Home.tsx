import { useState } from 'react';
import { hasSeenIntro, markIntroSeen } from './lib/session-state';

type HomeProps = {
  email: string;
  userId: string;
  unviewedShares?: number;
  onOpenMixer: () => void;
  onOpenLibrary: () => void;
  onOpenSetlists: () => void;
  onSignOut: () => void;
};

const sansFont = "'DM Sans', sans-serif";
const monoFont = "'JetBrains Mono', 'SF Mono', monospace";

export default function Home({
  email,
  userId,
  unviewedShares = 0,
  onOpenMixer,
  onOpenLibrary,
  onOpenSetlists,
  onSignOut,
}: HomeProps) {
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro(userId));
  function dismissIntro() {
    markIntroSeen(userId);
    setShowIntro(false);
  }
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: sansFont,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 380, width: '100%' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
          Vocal Booth
        </h1>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            textAlign: 'center',
            marginBottom: 28,
            fontFamily: monoFont,
          }}
        >
          {email}
        </div>

        {showIntro && (
          <div
            style={{
              marginBottom: 20,
              padding: '14px 16px',
              borderRadius: 12,
              background:
                'linear-gradient(135deg, rgba(155,106,216,0.08) 0%, rgba(232,200,64,0.05) 100%)',
              border: '1px solid rgba(155,106,216,0.2)',
              position: 'relative',
            }}
          >
            <button
              onClick={dismissIntro}
              aria-label="Dismiss"
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 14,
                cursor: 'pointer',
                padding: 2,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#9B6AD8',
                letterSpacing: '0.1em',
                fontFamily: monoFont,
                marginBottom: 6,
              }}
            >
              WELCOME
            </div>
            <div
              style={{
                fontSize: 13,
                color: '#fff',
                fontFamily: sansFont,
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              Practice your part along with your choir.
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.6)',
                fontFamily: sansFont,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: '#9B6AD8' }}>My Library</strong> holds
              songs you upload + songs shared with you.{' '}
              <strong style={{ color: '#E8C840' }}>Setlists</strong> group
              songs for an upcoming service. Open any song in the{' '}
              <strong>Mixer</strong> to play stems, see your part on the
              piano roll, and follow along.
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          <BigButton
            label="My Library"
            sublabel={
              unviewedShares > 0
                ? `Songs from your account · ${unviewedShares} new shared with you`
                : 'Songs from your account · live data'
            }
            onClick={onOpenLibrary}
            accent="#9B6AD8"
            badge={unviewedShares}
          />
          <BigButton
            label="Setlists"
            sublabel="Ordered groups of songs for a service"
            onClick={onOpenSetlists}
            accent="#E8C840"
          />
          <BigButton
            label="Mixer (demo)"
            sublabel="Prototype mixer · mock songs · no audio"
            onClick={onOpenMixer}
            accent="rgba(255,255,255,0.15)"
          />
        </div>

        <button
          onClick={onSignOut}
          style={{
            display: 'block',
            margin: '24px auto 0',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 11,
            fontFamily: monoFont,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function BigButton({
  label,
  sublabel,
  onClick,
  accent,
  badge = 0,
}: {
  label: string;
  sublabel: string;
  onClick: () => void;
  accent: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '16px 18px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${accent}`,
        color: '#fff',
        cursor: 'pointer',
        fontFamily: sansFont,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative',
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{sublabel}</span>
      {badge > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            minWidth: 22,
            height: 22,
            padding: '0 7px',
            borderRadius: 11,
            background: '#D94545',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
