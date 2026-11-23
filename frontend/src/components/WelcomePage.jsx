import { useEffect, useState } from 'react';
import { fetchFlags } from '../api.js';
import { CLIENTS, CLIENT_LIST } from '../clients.js';

// Home after login: a greeting and the top 5 pacing flags across every client.
// Clicking a flag opens that client's Pacing Lens.
const PLATFORM = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', amazon: 'Amazon' };
const KIND = {
  over:          { label: 'Overpacing',  light: '#b91c1c', dark: '#f87171' },
  under:         { label: 'Underpacing', light: '#c2410c', dark: '#fb923c' },
  'flight-over': { label: 'Check status', light: '#a16207', dark: '#fbbf24' },
};
const fmtDay = d => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Singapore' }));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function detail(f) {
  if (f.kind === 'flight-over') return `Still marked ${f.status === 'paused' ? 'Paused' : 'LIVE'} but its flight ended ${fmtDay(f.end)}`;
  const pace = `${Math.round(f.overall * 100)}% of plan`;
  const left = f.daysLeft == null ? '' : f.daysLeft > 0 ? ` · ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'} left` : f.daysLeft === 0 ? ' · ends today' : '';
  return `${pace}${left}`;
}

export default function WelcomePage({ user, theme, darkMode, onOpen, onLogout }) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFlags(ctrl.signal).then(data => setState({ data, error: null })).catch(err => { if (err.name !== 'AbortError') setState({ data: null, error: err.message }); });
    return () => ctrl.abort();
  }, []);
  const mode = darkMode ? 'dark' : 'light';
  const name = user?.name || 'there';
  const flags = state.data?.flags;

  return (
    <div style={{ minHeight: '100dvh', background: theme.bg, fontFamily: "'DM Sans', sans-serif", color: theme.textPrimary }}>
      <style>{'@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }'}</style>
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="white"/>
              </svg>
            </div>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 16 }}>MajorView</span>
          </div>
          {onLogout && (
            <button onClick={onLogout} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSecondary, borderRadius: 8, padding: '7px 13px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Log out
            </button>
          )}
        </div>

        <div style={{ fontSize: 13.5, color: theme.textMuted, marginBottom: 4 }}>{greeting()}</div>
        <h1 data-testid="welcome-greeting" style={{ margin: '0 0 8px', fontFamily: "'Space Grotesk', sans-serif", fontSize: 'clamp(28px, 6vw, 40px)', letterSpacing: '-0.02em' }}>
          Hello, {name}
        </h1>
        <p style={{ margin: '0 0 30px', color: theme.textSecondary, fontSize: 15 }}>
          {flags ? (flags.length ? `Here ${flags.length === 1 ? 'is the flag' : `are the top ${flags.length} flags`} across all clients today.` : 'Nothing is off pace across your clients. Nice.') : state.error ? '' : 'Checking pacing across all clients…'}
        </p>

        <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted, margin: '0 0 10px', fontFamily: "'Space Grotesk', sans-serif" }}>
          Top flags
        </h2>
        {state.error && <div role="alert" style={{ padding: 14, borderRadius: 10, background: theme.surface, border: `1px solid ${theme.border}`, color: '#b91c1c', fontSize: 13.5 }}>Could not load flags: {state.error}</div>}
        {!flags && !state.error && [0, 1, 2].map(i => (
          <div key={i} style={{ height: 76, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}`, marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
        ))}
        {flags?.map((f, i) => {
          const c = CLIENTS[f.client];
          const accent = c?.accent?.[mode]?.accent || theme.accent;
          const k = KIND[f.kind];
          return (
            <button key={i} data-flag onClick={() => onOpen(f.client, 'pacing')}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 10, borderRadius: 12,
                background: theme.surface, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${accent}`, cursor: 'pointer', fontFamily: 'inherit', color: theme.textPrimary }}
              onMouseEnter={e => { e.currentTarget.style.background = theme.surfaceHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = theme.surface; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: accent, background: c?.accent?.[mode]?.accentLight || theme.accentLight, borderRadius: 5, padding: '2px 7px' }}>{f.clientName}</span>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>{[f.marketName, PLATFORM[f.platform] || f.platformLabel].filter(Boolean).join(' · ')}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.campaign}>{f.campaign}</div>
                <div style={{ fontSize: 12.5, color: theme.textSecondary, marginTop: 3 }}>
                  {detail(f)}{f.spendText && f.budgetText ? ` · ${f.spendText} of ${f.budgetText}` : ''}
                </div>
              </div>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: k[mode] }}>{k.label}</span>
            </button>
          );
        })}
        {state.data?.notes?.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>Could not read: {state.data.notes.join('; ')}</div>}

        <h2 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted, margin: '32px 0 10px', fontFamily: "'Space Grotesk', sans-serif" }}>
          Go to dashboard
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {CLIENT_LIST.map(c => (
            <button key={c.id} data-open-client={c.id} onClick={() => onOpen(c.id)}
              style={{ padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                background: `linear-gradient(135deg, ${c.accent[mode].grad[0]} 0%, ${c.accent[mode].grad[1]} 100%)` }}>
              {c.name} →
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
