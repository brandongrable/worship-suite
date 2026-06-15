import { useState, type FormEvent } from 'react';
import { supabase } from './lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (err) {
      setStatus('error');
      setError(err.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
        color: '#fff',
        background: '#0a0a0a',
      }}
    >
      <div style={{ maxWidth: 360, width: '100%' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          Charter
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 24,
            textAlign: 'center',
          }}
        >
          Sign in to author chord charts.
        </p>

        {status === 'sent' ? (
          <div
            style={{
              background: 'rgba(232,200,64,0.1)',
              border: '1px solid rgba(232,200,64,0.3)',
              borderRadius: 12,
              padding: 16,
              textAlign: 'center',
              fontSize: 13,
            }}
          >
            <div style={{ marginBottom: 4 }}>Check your inbox.</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
              A sign-in link is on its way to {email}.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              required
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={status === 'sending' || !email}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                border: 'none',
                background: status === 'sending' ? 'rgba(232,200,64,0.4)' : '#E8C840',
                color: '#0a0a0a',
                fontSize: 14,
                fontWeight: 600,
                cursor: status === 'sending' ? 'wait' : 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {error && (
              <div
                style={{ marginTop: 12, fontSize: 12, color: '#D94545', textAlign: 'center' }}
              >
                {error}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
