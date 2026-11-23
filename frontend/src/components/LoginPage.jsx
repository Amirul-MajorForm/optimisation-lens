import { useState } from 'react';
import { login } from '../api.js';

// Sign in with email + password (accounts are set on the server: MAJORVIEW_USERS)
export default function LoginPage({ theme, onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { user } = await login(email, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const field = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
    background: theme.surface, color: theme.textPrimary, fontSize: 14.5, fontFamily: "'DM Sans', sans-serif", outline: 'none',
  };
  const label = { display: 'block', fontSize: 12.5, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box',
      background: `radial-gradient(1200px 600px at 20% -10%, ${theme.accentLight} 0%, transparent 60%), ${theme.bg}`, fontFamily: "'DM Sans', sans-serif" }}>
      <form onSubmit={submit} aria-label="Sign in" style={{ width: '100%', maxWidth: 380, background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 16, padding: '32px 28px', boxShadow: '0 10px 40px rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 26 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="white"/>
            </svg>
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: theme.textPrimary }}>MajorView</span>
        </div>
        <h1 style={{ margin: '0 0 6px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, color: theme.textPrimary }}>Sign in</h1>
        <p style={{ margin: '0 0 22px', fontSize: 13.5, color: theme.textMuted }}>Use the MajorView team login.</p>

        <label htmlFor="login-email" style={label}>Email</label>
        <input id="login-email" type="email" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} style={{ ...field, marginBottom: 16 }} />
        <label htmlFor="login-password" style={label}>Password</label>
        <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} style={field} />

        {error && <div role="alert" style={{ marginTop: 14, fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 11px' }}>{error}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 22, padding: '12px', borderRadius: 9, border: 'none', cursor: busy ? 'default' : 'pointer',
          background: theme.accent, color: '#fff', fontSize: 14.5, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", opacity: busy ? 0.7 : 1 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
