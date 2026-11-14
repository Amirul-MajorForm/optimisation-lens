import { useMemo, useState } from 'react';

// Pacing Lens: bird's-eye view of every campaign in the MajorPace sheet
// ("Pacing - OS Brand" + "Pacing - OS Ecomm"): what is live, how far through
// its budget vs its flight, and whether it is under / over / on pace.

const STATUS = {
  live:      { label: 'Live',      light: ['#dcfce7', '#15803d'], dark: ['rgba(52,211,153,0.15)', '#34d399'] },
  paused:    { label: 'Paused',    light: ['#fef3c7', '#a16207'], dark: ['rgba(251,191,36,0.15)', '#fbbf24'] },
  scheduled: { label: 'Scheduled', light: ['#dbeafe', '#1d4ed8'], dark: ['rgba(96,165,250,0.15)', '#93c5fd'] },
  setup:     { label: 'To set up', light: ['#ede9fe', '#6d28d9'], dark: ['rgba(167,139,250,0.15)', '#c4b5fd'] },
  ended:     { label: 'Ended',     light: ['#f1f5f9', '#64748b'], dark: ['rgba(148,163,184,0.15)', '#94a3b8'] },
  missed:    { label: 'Did not run', light: ['#fee2e2', '#b91c1c'], dark: ['rgba(248,113,113,0.15)', '#f87171'] },
  other:     { label: 'Other',     light: ['#f1f5f9', '#64748b'], dark: ['rgba(148,163,184,0.15)', '#94a3b8'] },
  unknown:   { label: 'No status', light: ['#f1f5f9', '#64748b'], dark: ['rgba(148,163,184,0.15)', '#94a3b8'] },
};
const PACE = {
  ok:    { label: 'On track',     light: '#15803d', dark: '#34d399' },
  under: { label: 'Underpacing',  light: '#c2410c', dark: '#fb923c' },
  over:  { label: 'Overpacing',   light: '#b91c1c', dark: '#f87171' },
};
const PLATFORM = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', amazon: 'Amazon' };
const MARKET_ORDER = ['sg', 'my', 'ph', 'vn', 'id', 'th', 'jp', 'kr', 'hk'];
const MARKET_LABEL = { sg: 'Singapore', my: 'Malaysia', ph: 'Philippines', vn: 'Vietnam', id: 'Indonesia', th: 'Thailand', jp: 'Japan', kr: 'Korea', hk: 'Hong Kong' };

const day = iso => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '?');
const pctText = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const running = r => r.status === 'live' || r.status === 'paused';
const upcoming = r => r.status === 'scheduled' || r.status === 'setup';
const done = r => r.status === 'ended' || r.status === 'missed';
const VIEWS = {
  running: { label: 'Running', test: running },
  upcoming: { label: 'Upcoming', test: upcoming },
  ended: { label: 'Ended', test: done },
  all: { label: 'All', test: () => true },
};

function PacingBar({ r, theme, dark }) {
  const st = r.state ? PACE[r.state] : null;
  const fillColor = st ? (dark ? st.dark : st.light) : theme.textMuted;
  const spent = r.spendPacing, time = r.timePacing;
  const over = spent != null && spent > 1;
  return (
    <div style={{ minWidth: 0 }}>
      <div role="img" aria-label={`${pctText(spent)} of budget spent${time != null ? `, ${pctText(time)} of the flight elapsed` : ''}`}
        style={{ position: 'relative', height: 10, borderRadius: 999, background: theme.surfaceAlt, border: `1px solid ${theme.border}`, overflow: 'visible' }}>
        {spent != null && (
          <div data-bar-fill style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(spent, 1) * 100}%`, borderRadius: 999,
            background: fillColor, opacity: running(r) ? 0.9 : 0.45 }} />
        )}
        {over && <div title={`${pctText(spent)} of budget`} style={{ position: 'absolute', right: -3, top: -3, bottom: -3, width: 6, borderRadius: 3, background: fillColor }} />}
        {time != null && running(r) && (
          <div data-time-marker title={`Expected by now: ${pctText(time)} of the flight has passed`}
            style={{ position: 'absolute', left: `calc(${Math.min(time, 1) * 100}% - 1px)`, top: -4, bottom: -4, width: 2, background: theme.textPrimary, borderRadius: 1 }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, fontSize: 11.5, color: theme.textSecondary, flexWrap: 'wrap' }}>
        <span><b style={{ color: theme.textPrimary }}>{r.spendText || '—'}</b>{r.budgetText ? ` of ${r.budgetText}` : ''}</span>
        <span>{spent != null ? `${pctText(spent)} spent` : ''}{time != null && running(r) ? ` · ${pctText(time)} of flight` : ''}</span>
      </div>
    </div>
  );
}

function PacingRow({ r, link, theme, dark, asOf }) {
  const [open, setOpen] = useState(false);
  const [sBg, sFg] = (dark ? STATUS[r.status]?.dark : STATUS[r.status]?.light) || STATUS.other.light;
  const st = r.state ? PACE[r.state] : null;
  const left = r.end && asOf ? daysBetween(asOf, r.end) : null;
  const flight = `${day(r.start)} – ${day(r.end)}`;
  const when = running(r) ? (left != null ? (left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : left === 0 ? 'ends today' : 'flight over') : '')
    : upcoming(r) && r.start && asOf ? `starts in ${Math.max(0, daysBetween(asOf, r.start))} days` : '';
  return (
    <div data-pacing-row={r.id} data-state={r.state || r.status} style={{
      display: 'grid', gridTemplateColumns: 'minmax(260px, 1.4fr) minmax(220px, 1.2fr) minmax(170px, auto)', gap: 16, alignItems: 'center',
      padding: '12px 16px', borderBottom: `1px solid ${theme.border}`, opacity: done(r) ? 0.7 : 1,
    }} className="pacing-row">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
          <span data-status-pill style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: sBg, color: sFg, letterSpacing: '0.02em' }}>
            {r.status === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: sFg }} />}
            {STATUS[r.status]?.label || r.statusText}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.platformLabel || PLATFORM[r.platform]} · {r.tab}</span>
          {r.flightOver && <span title="The sheet says this is running, but its end date has passed" style={{ fontSize: 10.5, fontWeight: 700, color: dark ? '#fbbf24' : '#a16207' }}>⚠ check status</span>}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.textPrimary, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{r.campaign}</div>
        {r.adName && <div style={{ fontSize: 11.5, color: theme.textMuted, overflowWrap: 'anywhere' }}>{r.adName.split('\n')[0]}{r.adName.includes('\n') ? ` +${r.adName.split('\n').length - 1} more` : ''}</div>}
        <div style={{ fontSize: 11.5, color: theme.textMuted, marginTop: 2 }}>{flight}{when ? ` · ${when}` : ''}</div>
      </div>

      <PacingBar r={r} theme={theme} dark={dark} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, minWidth: 0 }}>
        {st ? (
          <span data-pace-chip style={{ fontSize: 12, fontWeight: 700, color: dark ? st.dark : st.light }} title="Overall pacing = share of budget spent ÷ share of flight elapsed">
            {pctText(r.overall)} · {st.label}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: theme.textMuted }}>{done(r) ? (r.spendPacing != null ? `${pctText(r.spendPacing)} of budget used` : 'Ended') : upcoming(r) ? 'Not started' : '—'}</span>
        )}
        {running(r) && r.idealDaily && <span style={{ fontSize: 11.5, color: theme.textSecondary }} title="Daily spend needed from here to finish the budget on the end date">Ideal daily {r.idealDaily}</span>}
        <span style={{ display: 'flex', gap: 10, fontSize: 11.5 }}>
          {r.notes && <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ border: 'none', background: 'none', padding: 0, color: theme.accent, cursor: 'pointer', fontSize: 11.5 }}>Notes {open ? '▴' : '▾'}</button>}
          {link && <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: theme.accent }} title={link.exact ? 'Opens this campaign' : 'Campaign not matched by name: opens the ad account'}>{link.exact ? `Open in ${PLATFORM[r.platform]}` : `${PLATFORM[r.platform]} account`} ↗</a>}
        </span>
      </div>
      {open && r.notes && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: theme.textSecondary, background: theme.surfaceAlt, borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>{r.notes}</div>
      )}
    </div>
  );
}

export default function PacingLens({ state, links, theme, darkMode, mobile }) {
  const [view, setView] = useState('running');
  const [paceFilter, setPaceFilter] = useState(null);
  const [market, setMarket] = useState('all');
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const data = state?.data;
  const rows = data?.rows || [];
  const asOf = data?.pacingDate;

  const counts = useMemo(() => ({
    running: rows.filter(running).length,
    live: rows.filter(r => r.status === 'live').length,
    ok: rows.filter(r => r.state === 'ok').length,
    under: rows.filter(r => r.state === 'under').length,
    over: rows.filter(r => r.state === 'over').length,
    upcoming: rows.filter(upcoming).length,
    ended: rows.filter(done).length,
  }), [rows]);
  const markets = MARKET_ORDER.filter(m => rows.some(r => r.market === m)).concat([...new Set(rows.map(r => r.market))].filter(m => !MARKET_ORDER.includes(m)));

  const shown = rows.filter(r => VIEWS[view].test(r) && (!paceFilter || r.state === paceFilter) && (market === 'all' || r.market === market)
    && (tab === 'all' || r.tab === tab) && (!query || `${r.campaign} ${r.adName}`.toLowerCase().includes(query.toLowerCase())));
  // Within a market: overpacing, underpacing, on track (furthest off first), then upcoming, then ended
  const rank = r => (r.state === 'over' ? 0 : r.state === 'under' ? 1 : r.state === 'ok' ? 2 : running(r) ? 3 : upcoming(r) ? 4 : 5);
  const sorted = [...shown].sort((a, b) => rank(a) - rank(b) || Math.abs((b.overall ?? 1) - 1) - Math.abs((a.overall ?? 1) - 1)
    || (upcoming(a) ? (a.start || '').localeCompare(b.start || '') : (b.end || '').localeCompare(a.end || '')));
  const groups = markets.map(m => [m, sorted.filter(r => r.market === m)]).filter(([, rs]) => rs.length);

  const linkFor = r => {
    const exact = links?.links?.[`${r.platform}|${r.campaign.trim().toLowerCase()}`];
    if (exact) return { url: exact, exact: true };
    const acc = links?.accountLinks?.[r.platform]?.[r.market];
    return acc ? { url: acc, exact: false } : null;
  };
  const chip = on => ({ border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentLight : theme.surface, color: on ? theme.accent : theme.textSecondary,
    borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" });

  if (state?.error) return <div style={{ padding: 20, color: darkMode ? '#fca5a5' : '#991b1b', fontSize: 13 }}>{state.error}</div>;
  if (!data) return <div style={{ height: 400, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />;

  const tiles = [
    { key: 'running', label: 'Running', value: counts.running, sub: `${counts.live} live · ${counts.running - counts.live} paused`, color: darkMode ? '#34d399' : '#15803d', on: view === 'running' && !paceFilter, click: () => { setView('running'); setPaceFilter(null); } },
    { key: 'ok', label: 'On track', value: counts.ok, sub: `${Math.round(data.onTrack.low * 100)}–${Math.round(data.onTrack.high * 100)}% pacing`, color: darkMode ? PACE.ok.dark : PACE.ok.light, on: paceFilter === 'ok', click: () => { setView('running'); setPaceFilter(p => (p === 'ok' ? null : 'ok')); } },
    { key: 'under', label: 'Underpacing', value: counts.under, sub: `below ${Math.round(data.onTrack.low * 100)}%`, color: darkMode ? PACE.under.dark : PACE.under.light, on: paceFilter === 'under', click: () => { setView('running'); setPaceFilter(p => (p === 'under' ? null : 'under')); } },
    { key: 'over', label: 'Overpacing', value: counts.over, sub: `above ${Math.round(data.onTrack.high * 100)}%`, color: darkMode ? PACE.over.dark : PACE.over.light, on: paceFilter === 'over', click: () => { setView('running'); setPaceFilter(p => (p === 'over' ? null : 'over')); } },
    { key: 'upcoming', label: 'Upcoming', value: counts.upcoming, sub: 'scheduled / to set up', color: darkMode ? '#93c5fd' : '#1d4ed8', on: view === 'upcoming', click: () => { setView('upcoming'); setPaceFilter(null); } },
    { key: 'ended', label: 'Ended', value: counts.ended, sub: 'incl. did not run', color: theme.textMuted, on: view === 'ended', click: () => { setView('ended'); setPaceFilter(null); } },
  ];

  return (
    <div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>
        From the MajorPace sheet (Pacing - OS Brand + Pacing - OS Ecomm) · spend as of <b style={{ color: theme.textSecondary }}>{day(asOf)}</b> ·
        on track = spend within {Math.round(data.onTrack.low * 100)}–{Math.round(data.onTrack.high * 100)}% of where the flight says it should be ·
        the dark tick on each bar marks where spend should be today
      </div>

      <div role="group" aria-label="Pacing summary" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${mobile ? 140 : 150}px, 1fr))`, gap: 10, marginBottom: 14 }}>
        {tiles.map(t => (
          <button key={t.key} data-tile={t.key} aria-pressed={t.on} onClick={t.click} style={{
            textAlign: 'left', cursor: 'pointer', border: `1px solid ${t.on ? t.color : theme.border}`, borderTop: `3px solid ${t.color}`, borderRadius: 12,
            background: theme.surface, padding: '10px 12px', fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.color, fontFamily: "'Space Grotesk', sans-serif" }}>{t.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{t.value}</div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>{t.sub}</div>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span role="group" aria-label="Status" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(VIEWS).map(([k, v]) => <button key={k} aria-pressed={view === k} onClick={() => { setView(k); if (k !== 'running') setPaceFilter(null); }} style={chip(view === k)}>{v.label}</button>)}
        </span>
        <span style={{ width: 1, height: 20, background: theme.border, margin: '0 4px' }} />
        <span role="group" aria-label="Market" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', ...markets].map(m => <button key={m} aria-pressed={market === m} onClick={() => setMarket(m)} style={chip(market === m)}>{m === 'all' ? 'All markets' : m.toUpperCase()}</button>)}
        </span>
        <span style={{ width: 1, height: 20, background: theme.border, margin: '0 4px' }} />
        <span role="group" aria-label="Sheet tab" style={{ display: 'inline-flex', gap: 6 }}>
          {['all', ...(data.tabs || [])].map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} style={chip(tab === t)}>{t === 'all' ? 'Brand + Ecomm' : t}</button>)}
        </span>
        <input type="search" placeholder="Search campaigns" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search campaigns"
          style={{ marginLeft: mobile ? 0 : 'auto', flex: mobile ? '1 1 100%' : '0 1 220px', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12.5, background: theme.surface, color: theme.textPrimary }} />
      </div>

      {groups.length === 0 && (
        <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '36px 20px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>No campaigns match these filters.</div>
      )}
      {groups.map(([m, rs]) => (
        <div key={m} data-market-group={m} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: 10, alignItems: 'baseline', background: theme.surfaceAlt, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{MARKET_LABEL[m] || m.toUpperCase()}</span>
            <span style={{ fontSize: 12, color: theme.textMuted }}>
              {rs.length} campaign{rs.length === 1 ? '' : 's'}
              {['over', 'under', 'ok'].map(k => { const n = rs.filter(r => r.state === k).length; return n ? ` · ${n} ${PACE[k].label.toLowerCase()}` : ''; }).join('')}
            </span>
          </div>
          {rs.map(r => <PacingRow key={r.id} r={r} link={linkFor(r)} theme={theme} dark={darkMode} asOf={asOf} />)}
        </div>
      ))}
      {/* Phones: stack each row's three parts */}
      <style>{`@media (max-width: 768px) { .pacing-row { grid-template-columns: 1fr !important; gap: 8px !important; } .pacing-row > div:nth-child(3) { align-items: flex-start !important; } }`}</style>
    </div>
  );
}
