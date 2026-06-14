import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import SignIn from './SignIn';
import WorshipMixer from './WorshipMixer.jsx';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
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

  return (
    <>
      <WorshipMixer />
      <SignedInBadge email={session.user.email ?? '?'} />
    </>
  );
}

function SignedInBadge({ email }: { email: string }) {
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
        onClick={() => supabase.auth.signOut()}
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
        Sign out
      </button>
    </div>
  );
}
