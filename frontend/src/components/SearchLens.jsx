import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../theme.js';

// Search Lens: Google keywords / search terms and Amazon search terms for one
// market and date range. Each platform gets a quadrant chart (spend vs ROAS)
// and lists to act on: opportunities, negative candidates, top performers.

const QUADRANTS = {
  scale:  { label: 'Scale',          hint: 'High spend, ROAS above average: protect and grow budget', light: '#047857', dark: '#34d399' },
  opp:    { label: 'Opportunity',    hint: 'Low spend, ROAS above average: raise bids / budget, add as exact keyword', light: '#1d4ed8', dark: '#60a5fa' },
  fix:    { label: 'Optimise',       hint: 'High spend, ROAS below average: review bids, match type or targeting; pause if it stays low', light: '#b91c1c', dark: '#f87171' },
  watch:  { label: 'Watch / negate', hint: 'Low spend, ROAS below average: watch, negate if it keeps spending without sales', light: '#b45309', dark: '#fbbf24' },
};
const Q_ORDER = ['opp', 'scale', 'fix', 'watch'];

// Same term from several campaigns / match types / targeting groups is one row
function aggregate(rows, extra) {
  const by = new Map();
  for (const r of rows) {
    const k = r.text.trim().toLowerCase();
    const a = by.get(k) || { text: r.text.trim(), spend: 0, impressions: 0, clicks: 0, orders: 0, revenue: 0, campaigns: new Set(), via: new Set(), extra: {} };
    a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.clicks; a.orders += r.orders; a.revenue += r.revenue;
    a.campaigns.add(r.campaign);
    const via = extra.via(r);
    if (via) a.via.add(via);
    extra.merge?.(a, r);
    by.set(k, a);
  }
  return [...by.values()].map(a => ({
    ...a, ...a.extra,
    ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null,
    cpc: a.clicks > 0 ? a.spend / a.clicks : null,
    cvr: a.clicks > 0 ? (a.orders / a.clicks) * 100 : null,
    roas: a.spend > 0 ? a.revenue / a.spend : null,
    cpa: a.orders > 0 ? a.spend / a.orders : null,
    via: [...a.via].join(', '),
  }));
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return w;
}

// ------------------------------------------------------------ quadrant chart
function QuadrantChart({ items, avgRoas, medSpend, currency, theme, dark, onPick }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  const [hover, setHover] = useState(null);
  const H = 380, M = { top: 18, right: 18, bottom: 40, left: 52 };
  const iw = Math.max(0, width - M.left - M.right), ih = H - M.top - M.bottom;
  const pts = items.filter(i => i.spend > 0);
  const minS = Math.max(0.01, Math.min(...pts.map(p => p.spend)) * 0.8), maxS = Math.max(...pts.map(p => p.spend)) * 1.25;
  const lx = v => Math.log10(Math.max(v, minS));
  const x = v => M.left + ((lx(v) - lx(minS)) / Math.max(1e-9, lx(maxS) - lx(minS))) * iw;
  const roasVals = pts.map(p => p.roas || 0).sort((a, b) => a - b);
  const p95 = roasVals[Math.floor(roasVals.length * 0.95)] || 0;
  const yMax = Math.max(avgRoas * 2.2, p95 * 1.1, 1);
  const y = v => M.top + ih - (Math.min(v, yMax) / yMax) * ih;
  const maxOrders = Math.max(1, ...pts.map(p => p.orders));
  const r = p => 4 + 9 * Math.sqrt(p.orders / maxOrders);
  const xTicks = [];
  for (let e = Math.floor(lx(minS)); e <= Math.ceil(lx(maxS)); e++) for (const m of [1, 3]) { const v = m * 10 ** e; if (v >= minS && v <= maxS) xTicks.push(v); }
  const yTicks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax];
  const col = q => (dark ? QUADRANTS[q].dark : QUADRANTS[q].light);
  const xm = x(medSpend), ya = y(avgRoas);
  const money = v => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : v >= 10 ? Math.round(v) : v.toFixed(v < 1 ? 2 : 1));

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {width > 0 && pts.length > 0 && (
        <svg width={width} height={H} role="img" style={{ display: 'block' }}
          aria-label={`Quadrant chart of ${pts.length} items: spend (log scale) against ROAS, split at median spend ${currency} ${medSpend.toFixed(2)} and average ROAS ${avgRoas.toFixed(2)}x`}
          onMouseLeave={() => setHover(null)}>
          {/* quadrant tints + labels */}
          {[['opp', M.left, M.top, xm - M.left, ya - M.top], ['scale', xm, M.top, M.left + iw - xm, ya - M.top],
            ['watch', M.left, ya, xm - M.left, M.top + ih - ya], ['fix', xm, ya, M.left + iw - xm, M.top + ih - ya]].map(([q, rx, ry, rw, rh]) => (
            <g key={q}>
              <rect x={rx} y={ry} width={Math.max(0, rw)} height={Math.max(0, rh)} fill={col(q)} opacity={dark ? 0.08 : 0.05} />
              <text x={q === 'opp' || q === 'watch' ? rx + 8 : rx + rw - 8} y={q === 'opp' || q === 'scale' ? ry + 16 : ry + rh - 8}
                textAnchor={q === 'opp' || q === 'watch' ? 'start' : 'end'} fontSize="11" fontWeight="700" fill={col(q)}
                style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase' }}>{QUADRANTS[q].label}</text>
            </g>
          ))}
          {/* axes */}
          {yTicks.map(t => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} stroke={theme.border} strokeWidth="1" />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill={theme.textMuted}>{t.toFixed(t < 10 ? 1 : 0)}x</text>
            </g>
          ))}
          {xTicks.map(t => (
            <text key={t} x={x(t)} y={M.top + ih + 16} textAnchor="middle" fontSize="10.5" fill={theme.textMuted}>{money(t)}</text>
          ))}
          <text x={M.left + iw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={theme.textSecondary}>Spend ({currency}, log scale) →</text>
          <text transform={`translate(12 ${M.top + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill={theme.textSecondary}>ROAS →</text>
          {/* dividers */}
          <line x1={xm} x2={xm} y1={M.top} y2={M.top + ih} stroke={theme.textMuted} strokeDasharray="4 4" />
          <line x1={M.left} x2={M.left + iw} y1={ya} y2={ya} stroke={theme.textMuted} strokeDasharray="4 4" />
          <text x={M.left + iw - 4} y={ya - 5} textAnchor="end" fontSize="10" fill={theme.textMuted} stroke={theme.surface} strokeWidth="3" paintOrder="stroke">avg ROAS {avgRoas.toFixed(2)}x</text>
          <text x={xm + 4} y={M.top + 30} fontSize="10" fill={theme.textMuted} stroke={theme.surface} strokeWidth="3" paintOrder="stroke">median spend {money(medSpend)}</text>
          {/* points: biggest first so small ones stay on top */}
          {[...pts].sort((a, b) => b.orders - a.orders).map(p => {
            const cx = x(p.spend), cy = y(p.roas || 0), off = (p.roas || 0) > yMax;
            return (
              <g key={p.text} onMouseEnter={() => setHover(p)} onClick={() => onPick?.(p)} style={{ cursor: 'pointer' }}>
                <circle cx={cx} cy={cy} r={r(p)} fill={col(p.quadrant)} fillOpacity={hover && hover !== p ? 0.25 : 0.55}
                  stroke={col(p.quadrant)} strokeWidth={hover === p ? 2.5 : 1} />
                {off && <path d={`M${cx - 4} ${cy - r(p) - 2} L${cx} ${cy - r(p) - 8} L${cx + 4} ${cy - r(p) - 2} Z`} fill={col(p.quadrant)} />}
              </g>
            );
          })}
        </svg>
      )}
      {hover && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', zIndex: 5,
          left: Math.min(Math.max(x(hover.spend) + 14, 0), width - 250), top: Math.max(y(hover.roas || 0) - 20, 0),
          width: 240, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 8,
          boxShadow: '0 6px 20px rgba(8,13,26,0.18)', padding: '8px 10px', fontSize: 12, color: theme.textSecondary,
        }}>
          <div style={{ fontWeight: 700, color: theme.textPrimary, marginBottom: 2, overflowWrap: 'anywhere' }}>{hover.text}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: col(hover.quadrant), textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{QUADRANTS[hover.quadrant].label}</div>
          <div>Spend <b>{fmt(hover.spend, 'currency', currency)}</b> · ROAS <b>{hover.roas != null ? `${hover.roas.toFixed(2)}x` : '—'}</b></div>
          <div>{Math.round(hover.orders * 10) / 10} conv. · {Math.round(hover.clicks)} clicks · CPA {hover.cpa != null ? fmt(hover.cpa, 'currency', currency) : '—'}</div>
          {hover.via && <div style={{ color: theme.textMuted, marginTop: 2 }}>via {hover.via}</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ table
const COLS = [
  { key: 'text',    label: 'Term',     align: 'left' },
  { key: 'via',     label: 'Matched',  align: 'left' },
  { key: 'spend',   label: 'Spend',    f: 'currency' },
  { key: 'clicks',  label: 'Clicks',   f: 'number' },
  { key: 'ctr',     label: 'CTR',      f: 'percent' },
  { key: 'cpc',     label: 'CPC',      f: 'currency' },
  { key: 'orders',  label: 'Conv.',    f: 'conv' },
  { key: 'cvr',     label: 'CVR',      f: 'percent' },
  { key: 'revenue', label: 'Revenue',  f: 'currency' },
  { key: 'roas',    label: 'ROAS',     f: 'roas' },
  { key: 'cpa',     label: 'CPA',      f: 'currency' },
];
const KW_COLS = [
  { key: 'text',            label: 'Keyword',   align: 'left' },
  { key: 'matchType',       label: 'Match',     align: 'left' },
  { key: 'qualityScore',    label: 'QS',        f: 'qs' },
  { key: 'impressionShare', label: 'Impr. share', f: 'pct0' },
  ...COLS.slice(2),
];

function TermTable({ rows, cols, currency, theme, dark, action, sortInit = ['spend', 'desc'] }) {
  const [[sk, sd], setSort] = useState(sortInit);
  const [limit, setLimit] = useState(25);
  useEffect(() => { setLimit(25); }, [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sk], bv = b[sk];
    if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
    const c = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sd === 'asc' ? c : -c;
  }), [rows, sk, sd]);
  const show = (v, f) => (v == null || v === '' ? '—' : f === 'currency' ? fmt(v, 'currency', currency) : f === 'number' ? Math.round(v).toLocaleString('en-US')
    : f === 'conv' ? (Math.round(v * 10) / 10).toLocaleString('en-US') : f === 'percent' ? `${v.toFixed(2)}%` : f === 'roas' ? `${v.toFixed(2)}x`
    : f === 'qs' ? `${v}/10` : f === 'pct0' ? `${v.toFixed(0)}%` : String(v));
  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.textMuted,
    fontFamily: "'Space Grotesk', sans-serif", borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt, position: 'sticky', top: 0, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' };
  if (!rows.length) return <div style={{ padding: '18px 16px', fontSize: 13, color: theme.textMuted }}>Nothing here for this period.</div>;
  return (
    <>
      <div style={{ overflow: 'auto', maxHeight: 520 }}>
        <table style={{ width: '100%', minWidth: 980, borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} onClick={() => setSort([c.key, sk === c.key && sd === 'desc' ? 'asc' : c.align === 'left' && sk !== c.key ? 'asc' : 'desc'])}
                  aria-sort={sk === c.key ? (sd === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ ...th, textAlign: c.align || 'right', color: sk === c.key ? theme.accent : theme.textMuted,
                    ...(c.key === 'text' ? { left: 0, zIndex: 2, borderRight: `1px solid ${theme.border}` } : { zIndex: 1 }) }}>
                  {c.label}{sk === c.key ? (sd === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              {action && <th style={{ ...th, textAlign: 'left', cursor: 'default', zIndex: 1 }}>Suggested action</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map(r => (
              <tr key={r.text}>
                {cols.map(c => (
                  <td key={c.key} title={c.key === 'via' || c.key === 'text' ? `${r[c.key] || ''}${c.key === 'text' && r.campaigns ? `\nCampaigns: ${[...r.campaigns].join(', ')}` : ''}` : undefined}
                    style={{ padding: '6px 10px', borderBottom: `1px solid ${theme.border}`, textAlign: c.align || 'right', whiteSpace: 'nowrap',
                      color: c.key === 'text' ? theme.textPrimary : theme.textSecondary, fontWeight: c.key === 'text' ? 500 : 400, background: theme.surface,
                      ...(c.key === 'text' ? { position: 'sticky', left: 0, zIndex: 1, borderRight: `1px solid ${theme.border}`, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
                      ...(c.key === 'via' ? { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' } : {}) }}>
                    {c.key === 'text' && r.quadrant && (
                      <span title={QUADRANTS[r.quadrant].label} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6, background: dark ? QUADRANTS[r.quadrant].dark : QUADRANTS[r.quadrant].light }} />
                    )}
                    {show(r[c.key], c.f)}
                  </td>
                ))}
                {action && <td style={{ padding: '6px 10px', borderBottom: `1px solid ${theme.border}`, color: theme.textSecondary, whiteSpace: 'nowrap', background: theme.surface }}>{action(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button onClick={() => setLimit(l => l + 50)} style={{ margin: '8px 12px 12px', border: `1px solid ${theme.border}`, background: theme.surfaceAlt, color: theme.textSecondary, borderRadius: 7, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
          Show more ({sorted.length - limit} left)
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------ one platform
function PlatformSearch({ platform, title, terms, keywords, currency, theme, dark }) {
  const [view, setView] = useState(platform === 'google' && keywords.length ? 'keywords' : 'terms'); // what the chart plots
  const [tab, setTab] = useState('opp');
  const [quad, setQuad] = useState(null);
  const sum = k => terms.reduce((t, r) => t + r[k], 0);
  const avgRoas = sum('spend') > 0 ? sum('revenue') / sum('spend') : 0;
  const avgCpa = sum('orders') > 0 ? sum('spend') / sum('orders') : null;
  const keywordSet = useMemo(() => new Set(keywords.map(k => k.text.trim().toLowerCase())), [keywords]);

  const plotted = view === 'keywords' ? keywords : terms;
  const medSpend = median(plotted.filter(p => p.spend > 0).map(p => p.spend));
  const classify = r => (r.spend >= medSpend ? ((r.roas || 0) >= avgRoas ? 'scale' : 'fix') : ((r.roas || 0) >= avgRoas ? 'opp' : 'watch'));
  const withQ = rows => rows.map(r => ({ ...r, quadrant: r.spend > 0 ? classify(r) : 'watch' }));
  const plottedQ = useMemo(() => withQ(plotted), [plotted, medSpend, avgRoas]);
  const termsQ = useMemo(() => (view === 'terms' ? plottedQ : withQ(terms)), [view, plottedQ, terms, medSpend, avgRoas]);

  // Lists
  const negatives = termsQ.filter(r => r.orders === 0 && (r.clicks >= 10 || (avgCpa != null && r.spend >= avgCpa)));
  const wasted = negatives.reduce((t, r) => t + r.spend, 0);
  const opportunities = termsQ.filter(r => r.orders > 0 && (r.roas || 0) >= avgRoas && (platform !== 'google' || !keywordSet.has(r.text.toLowerCase())));
  const top = termsQ.filter(r => r.revenue > 0);
  const oppAction = () => (platform === 'google' ? 'Add as exact keyword' : 'Harvest to a manual exact campaign');
  const negAction = () => (platform === 'google' ? 'Add as negative (exact)' : 'Add as negative exact');

  const tabs = [
    ['opp', `Opportunities (${opportunities.length})`],
    ['neg', `Negative candidates (${negatives.length})`],
    ['top', `Top performers (${top.length})`],
    ['all', `All search terms (${termsQ.length})`],
    ...(platform === 'google' ? [['kw', `Keywords (${keywords.length})`]] : []),
  ];
  const quadSummary = Q_ORDER.map(q => {
    const rs = plottedQ.filter(r => r.quadrant === q && r.spend > 0);
    return { q, n: rs.length, spend: rs.reduce((t, r) => t + r.spend, 0), revenue: rs.reduce((t, r) => t + r.revenue, 0) };
  });
  const chip = on => ({
    border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentLight : theme.surface, color: on ? theme.accent : theme.textSecondary,
    borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
  });
  const allRows = quad ? termsQ.filter(r => r.quadrant === quad) : termsQ;

  return (
    <div data-search-platform={platform} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 6,
          background: platform === 'google' ? (dark ? '#3b1d1b' : '#fce8e6') : (dark ? '#3a2a10' : '#fff3e0'), color: platform === 'google' ? (dark ? '#fca5a5' : '#EA4335') : (dark ? '#fcd34d' : '#b45309'),
          fontFamily: "'Space Grotesk', sans-serif" }}>{title}</span>
        <span style={{ fontSize: 13, color: theme.textMuted }}>
          {fmt(sum('spend'), 'currency', currency)} spend · {Math.round(sum('orders')).toLocaleString('en-US')} conv. · avg ROAS {avgRoas.toFixed(2)}x{avgCpa != null ? ` · avg CPA ${fmt(avgCpa, 'currency', currency)}` : ''}
        </span>
        {platform === 'google' && keywords.length > 0 && (
          <span role="group" aria-label="Chart shows" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            <button aria-pressed={view === 'keywords'} onClick={() => setView('keywords')} style={chip(view === 'keywords')}>Keywords</button>
            <button aria-pressed={view === 'terms'} onClick={() => setView('terms')} style={chip(view === 'terms')}>Search terms</button>
          </span>
        )}
      </div>

      {/* Quadrant summary: click to filter the "All" list */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, padding: '14px 20px 4px' }}>
        {quadSummary.map(({ q, n, spend, revenue }) => {
          const c = dark ? QUADRANTS[q].dark : QUADRANTS[q].light;
          return (
            <button key={q} title={QUADRANTS[q].hint} aria-pressed={quad === q}
              onClick={() => { setQuad(quad === q ? null : q); setTab('all'); if (view !== 'terms') setView('terms'); }}
              style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${quad === q ? c : theme.border}`, borderLeft: `3px solid ${c}`, borderRadius: 10,
                background: quad === q ? theme.surfaceAlt : theme.surface, padding: '9px 12px', fontFamily: "'DM Sans', sans-serif" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: c, fontFamily: "'Space Grotesk', sans-serif" }}>{QUADRANTS[q].label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{n} {view === 'keywords' ? 'keyword' : 'term'}{n === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>{fmt(spend, 'currency', currency)} spend · {spend > 0 ? (revenue / spend).toFixed(2) : '0.00'}x</div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '6px 14px 4px' }}>
        <QuadrantChart items={plottedQ} avgRoas={avgRoas} medSpend={medSpend} currency={currency} theme={theme} dark={dark} />
        <div style={{ fontSize: 11, color: theme.textMuted, padding: '2px 6px 8px' }}>
          Each bubble is a {view === 'keywords' ? 'keyword' : 'search term'} (size = conversions). Lines: median spend and the average ROAS for {title}.
          {plottedQ.some(p => !(p.spend > 0)) ? ` ${plottedQ.filter(p => !(p.spend > 0)).length} with no spend not plotted.` : ''}
        </div>
      </div>

      <div role="tablist" aria-label={`${title} lists`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 20px', borderTop: `1px solid ${theme.border}` }}>
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k !== 'all') setQuad(null); }} style={chip(tab === k)}>{label}</button>
        ))}
        {tab === 'all' && quad && <button onClick={() => setQuad(null)} style={{ ...chip(false), borderStyle: 'dashed' }}>Showing {QUADRANTS[quad].label} only ×</button>}
      </div>
      {tab === 'neg' && negatives.length > 0 && (
        <div style={{ padding: '0 20px 8px', fontSize: 12, color: dark ? '#fca5a5' : '#b91c1c' }}>
          {fmt(wasted, 'currency', currency)} spent on {negatives.length} search term{negatives.length === 1 ? '' : 's'} with no conversions
          ({avgCpa != null ? `10+ clicks or at least the average CPA of ${fmt(avgCpa, 'currency', currency)}` : '10+ clicks'}).
        </div>
      )}
      {tab === 'opp' && (
        <div style={{ padding: '0 20px 8px', fontSize: 12, color: theme.textMuted }}>
          Converting search terms with ROAS at or above the {avgRoas.toFixed(2)}x average{platform === 'google' ? ' that are not keywords yet' : ''}.
        </div>
      )}
      {tab === 'kw'
        ? <TermTable rows={withQ(keywords)} cols={KW_COLS} currency={currency} theme={theme} dark={dark} />
        : <TermTable key={tab} rows={tab === 'opp' ? opportunities : tab === 'neg' ? negatives : tab === 'top' ? top : allRows}
            cols={COLS} currency={currency} theme={theme} dark={dark}
            sortInit={tab === 'top' ? ['revenue', 'desc'] : tab === 'opp' ? ['roas', 'desc'] : ['spend', 'desc']}
            action={tab === 'opp' ? oppAction : tab === 'neg' ? negAction : null} />}
    </div>
  );
}

// ------------------------------------------------------------ lens
export default function SearchLens({ state, market, marketName, theme, darkMode }) {
  const data = state?.data;
  const cur = data?.currency?.[market] || { google: 'SGD', amazon: 'SGD' };
  const google = useMemo(() => {
    if (!data) return null;
    const terms = aggregate(data.google.searchTerms.filter(r => r.market === market), {
      via: r => (r.keyword ? `${r.keyword}${r.matchType ? ` (${r.matchType.toLowerCase()})` : ''}` : ''),
    });
    const kw = aggregate(data.google.keywords.filter(r => r.market === market), {
      via: () => '',
      merge: (a, r) => {
        a.extra.matchType = a.extra.matchType || r.matchType || '';
        a.extra.qualityScore = a.extra.qualityScore ?? r.qualityScore;
        // impression share: weighted by impressions across campaigns / ad groups
        if (r.impressionShare != null) { a.extra._isw = (a.extra._isw || 0) + r.impressionShare * r.impressions; a.extra._iw = (a.extra._iw || 0) + r.impressions; }
        a.extra.impressionShare = a.extra._iw > 0 ? a.extra._isw / a.extra._iw : null;
      },
    });
    // Keyword match type is often blank on the keyword itself: take it from the search terms it matched
    // (the same text can be both an exact and a broad keyword: list each, most spend first)
    const mt = new Map();
    for (const r of data.google.searchTerms) {
      if (!r.keyword || !r.matchType || r.market !== market) continue;
      const m = mt.get(r.keyword.toLowerCase()) || new Map();
      m.set(r.matchType, (m.get(r.matchType) || 0) + r.spend);
      mt.set(r.keyword.toLowerCase(), m);
    }
    for (const k of kw) if (!k.matchType) k.matchType = [...(mt.get(k.text.toLowerCase()) || new Map()).entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).join(', ');
    return { terms, keywords: kw };
  }, [data, market]);
  const amazon = useMemo(() => (data ? aggregate(data.amazon.searchTerms.filter(r => r.market === market), { via: r => r.targeting }) : null), [data, market]);

  if (state?.error) return <div style={{ padding: 20, color: darkMode ? '#fca5a5' : '#991b1b', fontSize: 13 }}>Could not load search data: {state.error}</div>;
  if (!data) {
    return (
      <div>
        {[0, 1].map(i => <div key={i} style={{ height: 420, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, marginBottom: 20, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />)}
        <div style={{ fontSize: 12, color: theme.textMuted }}>Loading keywords and search terms from Two Minute Reports…</div>
      </div>
    );
  }
  const hasGoogle = google.terms.length > 0 || google.keywords.length > 0;
  const hasAmazon = amazon.length > 0;
  return (
    <div>
      {data.notes?.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10 }}>Not loaded this time (try Refresh): {data.notes.map(n => n.split(':')[0]).join(', ')}.</div>}
      {hasGoogle && <PlatformSearch key={`g-${market}`} platform="google" title="Google Search" terms={google.terms} keywords={google.keywords} currency={cur.google} theme={theme} dark={darkMode} />}
      {hasAmazon && <PlatformSearch key={`a-${market}`} platform="amazon" title="Amazon" terms={amazon} keywords={[]} currency={cur.amazon} theme={theme} dark={darkMode} />}
      {!hasGoogle && !hasAmazon && (
        <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: '40px 24px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
          No Google Search or Amazon search terms for {marketName || 'this market'} in this period.
        </div>
      )}
    </div>
  );
}
