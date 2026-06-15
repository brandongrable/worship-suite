import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import SignIn from './SignIn';
import Home from './Home';
import Library from './Library';
import SongDetail from './SongDetail';
import WorshipMixer from './WorshipMixer.jsx';
import type { Song } from './lib/songs';

type View = 'home' | 'mixer' | 'library' | 'song';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('home');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) setView('home');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.3)',
          fontSize: 13,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) return <SignIn />;

  const email = session.user.email ?? '?';

  if (view === 'mixer') {
    return (
      <>
        <WorshipMixer />
        <FloatingBackBadge email={email} onBack={() => setView('home')} />
      </>
    );
  }

  if (view === 'library') {
    return (
      <Library
        ownerId={session.user.id}
        onBack={() => setView('home')}
        onSelect={(song) => {
          setSelectedSong(song);
          setView('song');
        }}
      />
    );
  }

  if (view === 'song' && selectedSong) {
    return (
      <SongDetail
        song={selectedSong}
        ownedByMe={selectedSong.owner_id === session.user.id}
        onBack={() => {
          setSelectedSong(null);
          setView('library');
        }}
      />
    );
  }

  return (
    <Home
      email={email}
      onOpenMixer={() => setView('mixer')}
      onOpenLibrary={() => setView('library')}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}

function FloatingBackBadge({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        zIndex: 1000,
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        color: 'rgba(255,255,255,0.5)',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        padding: '6px 10px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span>{email}</span>
      <button
        onClick={onBack}
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          color: 'rgba(255,255,255,0.6)',
          padding: '3px 8px',
          borderRadius: 4,
          fontSize: 10,
          cursor: 'pointer',
        }}
      >
        ← Home
      </button>
    </div>
  );
}
