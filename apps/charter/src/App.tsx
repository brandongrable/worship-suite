import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { fetchSongById, type Song } from './lib/songs';
import SignIn from './SignIn';
import SongPicker from './SongPicker';
import ChordChartFormatter from './ChartFormatter.jsx';

const PERSIST_KEY = (userId: string) => `charter:lastSongId:${userId}`;

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [song, setSong] = useState<Song | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session) {
        const lastId = readLastSongId(data.session.user.id);
        if (lastId) {
          try {
            const restored = await fetchSongById(lastId);
            if (!cancelled && restored) setSong(restored);
          } catch {
            // Ignore: just land on the picker.
          }
        }
      }
      if (!cancelled) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (!sess) setSong(null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    writeLastSongId(session.user.id, song?.id ?? null);
  }, [song?.id, session?.user.id]);

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
          background: '#0a0a0a',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) return <SignIn />;

  if (!song) {
    return (
      <SongPicker
        ownerId={session.user.id}
        email={session.user.email ?? '?'}
        onSelect={(s) => setSong(s)}
        onSignOut={() => supabase.auth.signOut()}
      />
    );
  }

  return (
    <ChordChartFormatter
      key={song.id}
      song={song}
      onExit={() => setSong(null)}
    />
  );
}

function readLastSongId(userId: string): string | null {
  try {
    return localStorage.getItem(PERSIST_KEY(userId));
  } catch {
    return null;
  }
}

function writeLastSongId(userId: string, songId: string | null): void {
  try {
    if (songId) localStorage.setItem(PERSIST_KEY(userId), songId);
    else localStorage.removeItem(PERSIST_KEY(userId));
  } catch {
    // No-op on quota / private mode.
  }
}
