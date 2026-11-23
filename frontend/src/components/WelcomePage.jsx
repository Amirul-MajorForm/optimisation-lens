import { useEffect, useState } from 'react';
import { fetchFlags } from '../api.js';
import { CLIENTS } from '../clients.js';

// Home after login: a typed-out greeting and two cards, the top 5 pacing
// alerts and the top 5 performance alerts across every client. Clicking an
// alert opens that client on the right lens and market.
const PLATFORM = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', amazon: 'Amazon' };
const TONE = {
  over:  { light: '#b91c1c', dark: '#f87171' },
  under: { light: '#c2410c', dark: '#fb923c' },
  warn:  { light: '#a16207', dark: '#fbbf24' },
};
const fmtDay = d => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

function greeting() {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Singapore' }));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// Types the text out once, with a blinking caret (instant if the viewer prefers less motion)
function TypedText({ text }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return undefined;
    setN(0);
    let i = 0;
    const t = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(t); }, 85);
    return () => clearInterval(t);
  }, [text, reduce]);
  const done = n >= text.length;
  return (
    <>
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{text}</span>
      <span aria-hidden="true" data-typed={done ? 'done' : 'typing'}>{text.slice(0, n)}</span>
      <span aria-hidden="true" style={{ display: 'inline-block', width: '0.08em', height: '0.95em', marginLeft: '0.06em', verticalAlign: '-0.1em', background: 'currentColor',
        animation: 'caret-blink 1s step-end infinite', opacity: done ? undefined : 1 }} />
    </>
  );
}

// Money with the currency code, compact for big local currencies
function fmtMoney(v, currency) {
  if (v == null) return '–';
  const digits = v >= 100 ? 0 : 2;
  return `${currency === 'SGD' ? 'S$' : `${currency} `}${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
const fmtKpi = (metric, v, currency) => (v == null ? 'none' : metric === 'ROAS' ? `${v.toFixed(2)}x` : metric === 'CTR' ? `${v.toFixed(2)}%` : fmtMoney(v, currency));

function pacingAlert(f) {
  if (f.kind === 'flight-over') return { tag: 'Check status', tone: 'warn', detail: `Still marked ${f.status === 'paused' ? 'Paused' : 'LIVE'}, flight ended ${fmtDay(f.end)}` };
  const left = f.daysLeft == null ? '' : f.daysLeft > 0 ? ` · ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'} left` : f.daysLeft === 0 ? ' · ends today' : '';
  const money = f.spendText && f.budgetText ? ` · ${f.spendText} of ${f.budgetText}` : '';
  return { tag: `${Math.round(f.overall * 100)}% paced`, tone: f.kind, detail: `${f.kind === 'over' ? 'Overpacing' : 'Underpacing'}${left}${money}` };
}
function performanceAlert(f) {
  if (f.current == null) return { tag: `No ${f.metric === 'CPV' ? 'views' : 'results'}`, tone: 'over', detail: `${f.metric}: none this week (was ${fmtKpi(f.metric, f.previous, f.currency)})` };
  const pct = Math.round(Math.abs(f.change) * 100);
  return {
    tag: `${f.metric} ${f.change > 0 ? '▲' : '▼'} ${pct}%`, tone: pct >= 50 ? 'over' : 'under',
    detail: `${f.metric} ${fmtKpi(f.metric, f.current, f.currency)} vs ${fmtKpi(f.metric, f.previous, f.currency)} the week before`,
  };
}

function AlertCard({ title, subtitle, testId, state, describe, empty, loadingText, onPick, theme, mode }) {
  const flags = state.data?.flags;
  return (
    <section data-card={testId} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '16px 16px 8px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
        <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, color: theme.textPrimary }}>{title}</h2>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.textMuted }}>Top 5 alerts</span>
      </div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 12 }}>{subtitle}</div>
      {state.error && <div role="alert" style={{ padding: '10px 0 14px', color: '#b91c1c', fontSize: 13 }}>Could not load: {state.error}</div>}
      {!flags && !state.error && (
        <>
          {[0, 1, 2].map(i => <div key={i} style={{ height: 58, borderRadius: 10, background: theme.surfaceAlt, marginBottom: 8, animation: 'pulse 1.4s ease-in-out infinite' }} />)}
          <div style={{ fontSize: 12, color: theme.textMuted, padding: '2px 0 10px' }}>{loadingText}</div>
        </>
      )}
      {flags && !flags.length && <div style={{ fontSize: 13.5, color: theme.textSecondary, padding: '8px 0 16px' }}>{empty}</div>}
      {flags?.map((f, i) => {
        const c = CLIENTS[f.client];
        const accent = c?.accent?.[mode]?.accent || theme.accent;
        const a = describe(f);
        return (
          <button key={i} data-flag={testId} onClick={() => onPick(f)}
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 10px 10px 12px', marginBottom: 8, borderRadius: 10,
              background: 'transparent', border: `1px solid ${theme.border}`, borderLeft: `3px solid ${accent}`, cursor: 'pointer', fontFamily: 'inherit', color: theme.textPrimary }}
            onMouseEnter={e => { e.currentTarget.style.background = theme.surfaceHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: accent, background: c?.accent?.[mode]?.accentLight || theme.accentLight, borderRadius: 5, padding: '1px 6px' }}>{f.clientName}</span>
                <span style={{ fontSize: 11.5, color: theme.textMuted }}>{[f.marketName, PLATFORM[f.platform] || f.platformLabel].filter(Boolean).join(' · ')}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.campaign}>{f.campaign}</div>
              <div style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>{a.detail}</div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: TONE[a.tone][mode], whiteSpace: 'nowrap', paddingTop: 1 }}>{a.tag}</span>
          </button>
        );
      })}
      {state.data?.notes?.length > 0 && <div style={{ fontSize: 11.5, color: theme.textMuted, paddingBottom: 8 }}>Could not check: {state.data.notes.join('; ')}</div>}
    </section>
  );
}

function useFlags(kind) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    const ctrl = new AbortController();
    fetchFlags(ctrl.signal, kind).then(data => setState({ data, error: null })).catch(err => { if (err.name !== 'AbortError') setState({ data: null, error: err.message }); });
    return () => ctrl.abort();
  }, [kind]);
  return state;
}

export default function WelcomePage({ user, theme, darkMode, mobile, onMenu, onOpen }) {
  const pacing = useFlags('pacing');
  const performance = useFlags('performance');
  const mode = darkMode ? 'dark' : 'light';
  const name = user?.name || 'there';
  const range = performance.data?.range;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: theme.textPrimary }}>
      <style>{'@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } } @keyframes caret-blink { 50% { opacity: 0; } }'}</style>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: mobile ? '14px 16px 40px' : '40px 32px 48px' }}>
        {mobile && (
          <button onClick={onMenu} aria-label="Open menu" style={{ border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textSecondary, width: 36, height: 36,
            borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        )}
        <div style={{ fontSize: 13.5, color: theme.textMuted, marginBottom: 4 }}>{greeting()}</div>
        <h1 data-testid="welcome-greeting" style={{ margin: '0 0 8px', fontFamily: "'Space Grotesk', sans-serif", fontSize: mobile ? 30 : 40, letterSpacing: '-0.02em', minHeight: '1.2em' }}>
          <TypedText text={`Hello, ${name}`} />
        </h1>
        <p style={{ margin: '0 0 28px', color: theme.textSecondary, fontSize: 15 }}>
          Here is what needs attention across your clients. Pick a client in the sidebar to open its dashboard.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
          <AlertCard title="Pacing Flag" testId="pacing" theme={theme} mode={mode} state={pacing}
            subtitle={`Spend vs budget and flight, from MajorPace${pacing.data?.flags?.[0]?.pacingDate ? ` (as of ${fmtDay(pacing.data.flags[0].pacingDate)})` : ''}`}
            describe={pacingAlert} empty="Every live campaign is on pace." loadingText="Reading the pacing sheets…"
            onPick={f => onOpen(f.client, 'pacing')} />
          <AlertCard title="Performance Flag" testId="performance" theme={theme} mode={mode} state={performance}
            subtitle={range ? `Main KPI, last 7 days (${fmtDay(range.startDate)} to ${fmtDay(range.endDate)}) vs the 7 days before` : 'Main KPI, last 7 days vs the 7 days before'}
            describe={performanceAlert} empty="No campaign's main KPI got more than 20% worse this week."
            loadingText="Comparing this week with last week for every client (up to a minute the first time each morning)…"
            onPick={f => onOpen(f.client, f.lens === 'commerce' || !CLIENTS[f.client]?.lenses.includes('brand') ? 'commerce' : 'brand', f.market)} />
        </div>
      </div>
    </div>
  );
}
