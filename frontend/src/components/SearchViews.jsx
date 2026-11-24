import { Fragment, useEffect, useMemo, useState } from 'react';
import { fmt } from '../theme.js';
import { fetchSearchHeadroom, fetchSearchPrevious } from '../api.js';

// Search Lens views beyond Performance: Words (n-grams), Movers (vs the period
// before), Overlap (one search term through several campaigns / keywords) and
// Headroom (Google impression share). Words and Overlap use the data Search
// Lens already has; Movers and Headroom load their own data when opened.

// ------------------------------------------------------------ shared helpers
// Main KPI for a platform: ROAS when it has revenue, else CPA
export const kpiOf = totals => (totals.revenue > 0 ? 'roas' : 'cpa');
export const kpiValue = (r, kpi) => (kpi === 'roas' ? (r.spend > 0 ? r.revenue / r.spend : null) : (r.orders > 0 ? r.spend / r.orders : null));
// How much better (+) or worse (-) a value is than a reference, as a share
const better = (v, ref, kpi) => (v == null || !ref ? null : kpi === 'roas' ? v / ref - 1 : ref / v - 1);
const fmtKpi = (v, kpi, currency) => (v == null ? '—' : kpi === 'roas' ? `${v.toFixed(2)}x` : fmt(v, 'currency', currency));
const pct = (v, dp = 0) => (v == null ? '—' : `${(v * 100).toFixed(dp)}%`);
const conv = v => (Math.round((v || 0) * 10) / 10).toLocaleString('en-US');

// Load-once data per (kind, range, refresh), kept while the page is open
const lazyCache = new Map();
function useLazy(kind, params, version, enabled) {
  const key = `${kind}|${params.dateRange}|${params.startDate}|${params.endDate}|${version}`;
  const [, bump] = useState(0);
  useEffect(() => {
    if (!enabled || lazyCache.has(key)) return;
    const entry = { loading: true };
    lazyCache.set(key, entry);
    (kind === 'previous' ? fetchSearchPrevious : fetchSearchHeadroom)(params)
      .then(data => lazyCache.set(key, { data }))
      .catch(err => lazyCache.set(key, { error: err.message }))
      .finally(() => bump(n => n + 1));
  }, [key, enabled]);
  return lazyCache.get(key) || { loading: enabled };
}

export function Chips({ items, value, onChange, theme, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(([k, text]) => {
        const on = value === k;
        return (
          <button key={k} aria-pressed={on} onClick={() => onChange(k)} style={{
            border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentLight : theme.surface, color: on ? theme.accent : theme.textSecondary,
            borderRadius: 999, padding: '4px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
          }}>{text}</button>
        );
      })}
    </div>
  );
}

// Sortable table; rows can expand to show detail underneath
function Table({ rows, cols, theme, sortInit, rowKey = r => r.text, expand, empty = 'Nothing here for this period.', minWidth = 900 }) {
  const [[sk, sd], setSort] = useState(sortInit);
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(null);
  useEffect(() => { setLimit(25); setOpen(null); }, [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const col = cols.find(c => c.key === sk);
    const get = col?.sort || (r => r[sk]);
    const av = get(a), bv = get(b);
    if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
    const c = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sd === 'asc' ? c : -c;
  }), [rows, cols, sk, sd]);
  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif",
    borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt, position: 'sticky', top: 0, whiteSpace: 'nowrap', userSelect: 'none', zIndex: 1 };
  const td = { padding: '6px 10px', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap', background: theme.surface, color: theme.textSecondary };
  if (!rows.length) return <div style={{ padding: '18px 20px', fontSize: 13, color: theme.textMuted }}>{empty}</div>;
  return (
    <>
      <div style={{ overflow: 'auto', maxHeight: 560 }}>
        <table style={{ width: '100%', minWidth, borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} title={c.tip}
                  onClick={c.nosort ? undefined : () => setSort([c.key, sk === c.key && sd === 'desc' ? 'asc' : c.align === 'left' && sk !== c.key ? 'asc' : 'desc'])}
                  aria-sort={sk === c.key ? (sd === 'asc' ? 'ascending' : 'descending') : 'none'}
                  style={{ ...th, textAlign: c.align || 'right', cursor: c.nosort ? 'default' : 'pointer', color: sk === c.key ? theme.accent : theme.textMuted,
                    ...(c.sticky ? { left: 0, zIndex: 2, borderRight: `1px solid ${theme.border}` } : {}) }}>
                  {c.label}{sk === c.key ? (sd === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map(r => {
              const k = rowKey(r);
              const isOpen = open === k;
              return (
                <Fragment key={k}>
                  <tr onClick={expand ? () => setOpen(isOpen ? null : k) : undefined} style={{ cursor: expand ? 'pointer' : 'default' }} data-row={k}>
                    {cols.map(c => (
                      <td key={c.key} title={c.title?.(r)} style={{ ...td, textAlign: c.align || 'right',
                        ...(c.sticky ? { position: 'sticky', left: 0, zIndex: 1, borderRight: `1px solid ${theme.border}`, color: theme.textPrimary, fontWeight: 500, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
                        ...(c.wrap ? { whiteSpace: 'normal', minWidth: c.wrap } : {}) }}>
                        {c.sticky && expand && <span aria-hidden="true" style={{ display: 'inline-block', width: 12, color: theme.textMuted }}>{isOpen ? '▾' : '▸'}</span>}
                        {c.render ? c.render(r) : r[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={cols.length} style={{ ...td, background: theme.surfaceAlt, padding: '8px 14px 12px 30px', whiteSpace: 'normal' }}>{expand(r)}</td></tr>
                  )}
                </Fragment>
              );
            })}
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

const Intro = ({ theme, children }) => <div style={{ padding: '2px 20px 10px', fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>{children}</div>;
const Bar = ({ theme, children }) => <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 20px 10px' }}>{children}</div>;
const Note = ({ color, children }) => <span style={{ fontSize: 12, fontWeight: 600, color }}>{children}</span>;
const tone = (dark, kind) => ({ bad: dark ? '#f87171' : '#b91c1c', warn: dark ? '#fbbf24' : '#b45309', good: dark ? '#34d399' : '#047857' }[kind]);

// ------------------------------------------------------------ Words
const STOP = new Set(['a', 'an', 'the', 'for', 'of', 'in', 'on', 'to', 'and', 'or', 'with', 'at', 'by', 'is', 'me', 'my', 'i', 'you', 'what', 'how', 'where', 'which', 'from', 'vs']);
const tokens = text => String(text).toLowerCase().split(/[\s\-_,.+/()"'!?:;&]+/).filter(t => t && (t.length > 1 || /[^\x00-\x7f]/.test(t)));

export function WordsView({ terms, totals, currency, theme, dark }) {
  const [n, setN] = useState(1);
  const [filter, setFilter] = useState('all');
  const kpi = kpiOf(totals);
  const avg = kpiValue(totals, kpi);
  const avgCpa = totals.orders > 0 ? totals.spend / totals.orders : null;
  const grams = useMemo(() => {
    const by = new Map();
    for (const t of terms) {
      const tk = tokens(t.text);
      const set = new Set();
      if (n === 1) tk.forEach(w => { if (!STOP.has(w)) set.add(w); });
      else for (let i = 0; i < tk.length - 1; i++) set.add(`${tk[i]} ${tk[i + 1]}`);
      for (const g of set) {
        const a = by.get(g) || { text: g, terms: [], spend: 0, clicks: 0, impressions: 0, orders: 0, revenue: 0, wasted: 0 };
        a.terms.push(t); a.spend += t.spend; a.clicks += t.clicks; a.impressions += t.impressions; a.orders += t.orders; a.revenue += t.revenue;
        if (!(t.orders > 0)) a.wasted += t.spend;
        by.set(g, a);
      }
    }
    return [...by.values()].filter(g => g.terms.length >= 2).map(g => ({ ...g, count: g.terms.length, kpi: kpiValue(g, kpi) }));
  }, [terms, n, kpi]);
  const action = g => {
    if (!(g.orders > 0) && (g.clicks >= 10 || (avgCpa != null && g.spend >= avgCpa))) return { text: `Negative phrase "${g.text}"`, kind: 'bad' };
    const b = better(g.kpi, avg, kpi);
    if (g.orders >= 2 && b != null && b >= 0.3) return { text: 'Strong theme: build out keywords', kind: 'good' };
    if (g.orders > 0 && b != null && b <= -0.3) return { text: 'Weak theme: review its terms', kind: 'warn' };
    return null;
  };
  const rows = grams.map(g => ({ ...g, act: action(g) })).filter(g => (filter === 'neg' ? g.act?.kind === 'bad' : filter === 'strong' ? g.act?.kind === 'good' : true));
  const negCount = grams.filter(g => action(g)?.kind === 'bad');
  const cols = [
    { key: 'text', label: n === 1 ? 'Word' : 'Phrase', align: 'left', sticky: true },
    { key: 'count', label: 'Terms', render: r => r.count },
    { key: 'spend', label: 'Spend', render: r => fmt(r.spend, 'currency', currency) },
    { key: 'clicks', label: 'Clicks', render: r => Math.round(r.clicks).toLocaleString('en-US') },
    { key: 'orders', label: 'Conv.', render: r => conv(r.orders) },
    { key: 'kpi', label: kpi === 'roas' ? 'ROAS' : 'CPA', render: r => fmtKpi(r.kpi, kpi, currency) },
    { key: 'wasted', label: 'No-conv. spend', tip: 'Spend on the search terms containing it that had no conversions', render: r => fmt(r.wasted, 'currency', currency) },
    { key: 'act', label: 'Suggested action', align: 'left', nosort: true, render: r => (r.act ? <Note color={tone(dark, r.act.kind)}>{r.act.text}</Note> : '') },
  ];
  return (
    <div data-view="words">
      <Bar theme={theme}>
        <Chips label="Words or phrases" theme={theme} value={n} onChange={setN} items={[[1, 'Single words'], [2, 'Two-word phrases']]} />
        <Chips label="Filter" theme={theme} value={filter} onChange={setFilter} items={[['all', `All (${grams.length})`], ['neg', `Negative candidates (${negCount.length})`], ['strong', 'Strong themes']]} />
      </Bar>
      <Intro theme={theme}>
        Search terms broken into {n === 1 ? 'single words' : 'two-word phrases'}, each counted once per term (only those in 2+ terms). A word that wastes spend across many terms is a negative you can add once.
        {negCount.length > 0 && <> <b style={{ color: tone(dark, 'bad') }}>{fmt(negCount.reduce((t, g) => t + g.spend, 0), 'currency', currency)}</b> sits in {negCount.length} {n === 1 ? 'word' : 'phrase'}{negCount.length === 1 ? '' : 's'} with no conversions.</>}
        {' '}Click a row to see its search terms.
      </Intro>
      <Table rows={rows} cols={cols} theme={theme} sortInit={['spend', 'desc']} minWidth={820}
        expand={g => (
          <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.7 }}>
            {[...g.terms].sort((a, b) => b.spend - a.spend).slice(0, 12).map(t => (
              <div key={t.text}><b style={{ color: theme.textPrimary, fontWeight: 600 }}>{t.text}</b>{t.tr ? <i style={{ color: theme.textMuted }}> · {t.tr}</i> : null} · {fmt(t.spend, 'currency', currency)} · {conv(t.orders)} conv.</div>
            ))}
            {g.terms.length > 12 && <div style={{ color: theme.textMuted }}>…and {g.terms.length - 12} more</div>}
          </div>
        )} />
    </div>
  );
}

// ------------------------------------------------------------ Movers
const MIN_CHANGE = 0.25;
export function MoversView({ platform, terms, totals, currency, aggregatePrev, params, version, theme, dark }) {
  const prevState = useLazy('previous', params, version, true);
  const [cat, setCat] = useState('worse');
  const kpi = kpiOf(totals);
  const avgCpa = totals.orders > 0 ? totals.spend / totals.orders : null;
  const prev = useMemo(() => (prevState.data ? aggregatePrev(prevState.data, platform) : null), [prevState.data, platform, aggregatePrev]);
  const rows = useMemo(() => {
    if (!prev) return [];
    const before = new Map(prev.map(p => [p.text.toLowerCase(), p]));
    const now = new Map(terms.map(t => [t.text.toLowerCase(), t]));
    const out = [];
    for (const [k, t] of now) {
      const p = before.get(k);
      const kNow = kpiValue(t, kpi), kPrev = p ? kpiValue(p, kpi) : null;
      // Enough data both times to compare a KPI
      const solid = p && p.orders >= 2 && (t.orders >= 1 || (avgCpa != null && t.spend >= avgCpa));
      const ch = solid && kNow != null && kPrev != null ? better(kNow, kPrev, kpi) : null;
      let category = null;
      if (!p || !(p.spend > 0)) { if (t.spend > 0) category = 'new'; }
      else if (p.orders >= 2 && !(t.orders > 0) && avgCpa != null && t.spend >= avgCpa) category = 'worse';
      else if (ch != null && ch <= -MIN_CHANGE) category = 'worse';
      else if (ch != null && ch >= MIN_CHANGE) category = 'better';
      out.push({ text: t.text, tr: t.tr, cur: t, prev: p || null, kNow, kPrev, change: ch, spendDelta: t.spend - (p?.spend || 0), category });
    }
    for (const [k, p] of before) {
      if (!now.has(k) && p.orders > 0) out.push({ text: p.text, tr: p.tr, cur: null, prev: p, kNow: null, kPrev: kpiValue(p, kpi), change: null, spendDelta: -p.spend, category: 'dropped' });
    }
    return out;
  }, [prev, terms, kpi, avgCpa]);
  if (prevState.error) return <Intro theme={theme}>Could not load the previous period: {prevState.error}</Intro>;
  if (!prevState.data) return <div data-view="movers"><Intro theme={theme}>Loading the previous period to compare with…</Intro><div style={{ height: 200, margin: '0 20px 20px', borderRadius: 10, background: theme.surfaceAlt, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} /></div>;
  const by = c => rows.filter(r => r.category === c);
  const shifts = [...rows].filter(r => Math.abs(r.spendDelta) > 0).sort((a, b) => Math.abs(b.spendDelta) - Math.abs(a.spendDelta)).slice(0, 100);
  const list = cat === 'shifts' ? shifts : by(cat);
  const pr = prevState.data.dateRange;
  const day = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const label = kpi === 'roas' ? 'ROAS' : 'CPA';
  const cols = [
    { key: 'text', label: 'Search term', align: 'left', sticky: true, title: r => (r.tr ? `${r.text} (${r.tr})` : r.text), render: r => <>{r.text}{r.tr && <i style={{ color: theme.textMuted, fontWeight: 400 }}> · {r.tr}</i>}</> },
    { key: 'spend', label: 'Spend', sort: r => r.cur?.spend ?? 0, render: r => fmt(r.cur?.spend ?? 0, 'currency', currency) },
    { key: 'spendDelta', label: 'Spend change', render: r => <span style={{ color: r.spendDelta > 0 ? theme.textPrimary : theme.textMuted }}>{r.spendDelta >= 0 ? '+' : '−'}{fmt(Math.abs(r.spendDelta), 'currency', currency)}</span> },
    { key: 'orders', label: 'Conv. now / before', sort: r => r.cur?.orders ?? 0, render: r => `${conv(r.cur?.orders)} / ${r.prev ? conv(r.prev.orders) : '—'}` },
    { key: 'kNow', label: `${label} now`, render: r => fmtKpi(r.kNow, kpi, currency) },
    { key: 'kPrev', label: `${label} before`, render: r => fmtKpi(r.kPrev, kpi, currency) },
    { key: 'change', label: 'Change', tip: `${label} change; positive = better`, render: r => (r.change == null ? '—' : <Note color={tone(dark, r.change >= 0 ? 'good' : 'bad')}>{r.change >= 0 ? '▲' : '▼'} {Math.round(Math.abs(r.change) * 100)}%</Note>) },
  ];
  const hint = {
    worse: `Converted before (2+ conversions) and now ${label === 'ROAS' ? 'ROAS fell' : 'CPA rose'} ${MIN_CHANGE * 100}%+, or stopped converting while still spending.`,
    better: `${label} improved ${MIN_CHANGE * 100}%+ on solid volume: candidates for more budget or exact keywords.`,
    new: 'Spending now, no spend in the period before: check they are relevant before they grow.',
    dropped: 'Converted in the period before but have no spend now: paused, negated, or lost to rank or budget?',
    shifts: 'Biggest spend changes either way.',
  }[cat];
  return (
    <div data-view="movers">
      <Bar theme={theme}>
        <Chips label="Movers" theme={theme} value={cat} onChange={setCat}
          items={[['worse', `Getting worse (${by('worse').length})`], ['better', `Improving (${by('better').length})`], ['new', `New (${by('new').length})`], ['dropped', `Lost converters (${by('dropped').length})`], ['shifts', 'Spend shifts']]} />
      </Bar>
      <Intro theme={theme}>Compared with {day(pr.startDate)} to {day(pr.endDate)}. {hint}</Intro>
      <Table rows={list} cols={cols} theme={theme} minWidth={860}
        sortInit={cat === 'new' ? ['spend', 'desc'] : cat === 'dropped' ? ['kPrev', kpi === 'roas' ? 'desc' : 'asc'] : cat === 'shifts' ? ['spendDelta', 'desc'] : ['spend', 'desc']} />
    </div>
  );
}

// ------------------------------------------------------------ Overlap
export function OverlapView({ platform, rawTerms, totals, currency, translations, theme, dark }) {
  const kpi = kpiOf(totals);
  const rows = useMemo(() => {
    const by = new Map();
    for (const r of rawTerms) {
      const k = r.text.trim().toLowerCase();
      const g = by.get(k) || { text: r.text.trim(), sources: new Map(), spend: 0, clicks: 0, orders: 0, revenue: 0, impressions: 0 };
      const via = platform === 'google' ? (r.keyword ? `${r.keyword}${r.matchType ? ` (${r.matchType.toLowerCase()})` : ''}` : '') : r.targeting || '';
      const sk = `${r.campaign}|${via}`;
      const s = g.sources.get(sk) || { campaign: r.campaign, via, spend: 0, clicks: 0, orders: 0, revenue: 0 };
      s.spend += r.spend; s.clicks += r.clicks; s.orders += r.orders; s.revenue += r.revenue;
      g.sources.set(sk, s);
      g.spend += r.spend; g.clicks += r.clicks; g.orders += r.orders; g.revenue += r.revenue; g.impressions += r.impressions;
      by.set(k, g);
    }
    const out = [];
    for (const g of by.values()) {
      const sources = [...g.sources.values()].filter(s => s.spend > 0 || s.clicks > 0);
      const campaigns = new Set(sources.map(s => s.campaign)).size;
      const vias = new Set(sources.map(s => s.via).filter(Boolean)).size;
      // Amazon auto campaigns match one term through several targeting groups by
      // design, so only campaigns count there; on Google, keywords count too
      if (sources.length < 2 || (campaigns < 2 && (platform !== 'google' || vias < 2))) continue;
      // Best route: best KPI among those that converted, else lowest CPC
      const converted = sources.filter(s => s.orders > 0);
      const best = converted.length
        ? converted.reduce((a, b) => ((better(kpiValue(b, kpi), kpiValue(a, kpi), kpi) || 0) > 0 ? b : a))
        : sources.reduce((a, b) => ((b.clicks > 0 ? b.spend / b.clicks : Infinity) < (a.clicks > 0 ? a.spend / a.clicks : Infinity) ? b : a));
      out.push({ ...g, tr: translations[g.text], sources, campaigns, vias, best, bestByConv: converted.length > 0, kpiV: kpiValue(g, kpi) });
    }
    return out;
  }, [rawTerms, platform, kpi, translations]);
  const spend = rows.reduce((t, r) => t + r.spend, 0);
  const viaLabel = platform === 'google' ? 'Keywords' : 'Targets';
  const cols = [
    { key: 'text', label: 'Search term', align: 'left', sticky: true, title: r => (r.tr ? `${r.text} (${r.tr})` : r.text), render: r => <>{r.text}{r.tr && <i style={{ color: theme.textMuted, fontWeight: 400 }}> · {r.tr}</i>}</> },
    { key: 'campaigns', label: 'Campaigns', render: r => r.campaigns },
    { key: 'vias', label: viaLabel, render: r => r.vias || '—' },
    { key: 'spend', label: 'Spend', render: r => fmt(r.spend, 'currency', currency) },
    { key: 'orders', label: 'Conv.', render: r => conv(r.orders) },
    { key: 'kpiV', label: kpi === 'roas' ? 'ROAS' : 'CPA', render: r => fmtKpi(r.kpiV, kpi, currency) },
    { key: 'act', label: 'Suggested action', align: 'left', nosort: true, render: r => (
      <Note color={tone(dark, 'warn')}>
        {r.campaigns >= 2
          ? `Keep in ${short(r.best.campaign)}; negate (exact) in the other ${r.campaigns - 1} campaign${r.campaigns === 2 ? '' : 's'}`
          : `Add as an exact keyword so one ad group owns it${r.bestByConv && r.best.via ? ` (best now: ${r.best.via})` : ''}`}
      </Note>
    ) },
  ];
  return (
    <div data-view="overlap">
      <Intro theme={theme}>
        <span style={{ display: 'block', padding: '10px 0 0' }}>
          <b style={{ color: theme.textPrimary }}>{rows.length} search term{rows.length === 1 ? '' : 's'}</b> ran through more than one campaign or {platform === 'google' ? 'keyword' : 'target'},
          {' '}<b style={{ color: theme.textPrimary }}>{fmt(spend, 'currency', currency)}</b> spend ({totals.spend > 0 ? Math.round((spend / totals.spend) * 100) : 0}% of the total).
          {' '}They compete with each other in the same auctions and split the data. Click a row to compare the routes; the best one is marked.
        </span>
      </Intro>
      <Table rows={rows} cols={cols} theme={theme} sortInit={['spend', 'desc']} minWidth={900}
        expand={r => (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', maxWidth: 900 }}>
            <thead><tr>{['Campaign', platform === 'google' ? 'Keyword (match)' : 'Targeting', 'Spend', 'Clicks', 'CPC', 'Conv.', kpi === 'roas' ? 'ROAS' : 'CPA'].map((h, i) => (
              <th key={h} style={{ textAlign: i < 2 ? 'left' : 'right', padding: '3px 8px', fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>))}</tr></thead>
            <tbody>
              {[...r.sources].sort((a, b) => b.spend - a.spend).map(s => {
                const isBest = s === r.best;
                return (
                  <tr key={`${s.campaign}|${s.via}`} style={{ color: isBest ? tone(dark, 'good') : theme.textSecondary, fontWeight: isBest ? 600 : 400 }}>
                    <td style={{ padding: '3px 8px' }}>{isBest ? '★ ' : ''}{s.campaign}</td>
                    <td style={{ padding: '3px 8px' }}>{s.via || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(s.spend, 'currency', currency)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{Math.round(s.clicks)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{s.clicks > 0 ? fmt(s.spend / s.clicks, 'currency', currency) : '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{conv(s.orders)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmtKpi(kpiValue(s, kpi), kpi, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )} />
    </div>
  );
}
// Campaign names are long: keep the distinctive tail (e.g. ..._Brand-MaxConv)
const short = name => { const parts = String(name).split('_'); return parts.length > 3 ? parts.slice(-2).join('_') : name; };

// ------------------------------------------------------------ Headroom (Google)
function ShareBar({ is, rank, budget, theme, dark }) {
  if (is == null) return <span style={{ color: theme.textMuted }}>—</span>;
  const seg = [[is, theme.accent, 'Shown'], [rank || 0, dark ? '#f59e0b' : '#f59e0b', 'Lost to rank'], [budget || 0, dark ? '#f87171' : '#dc2626', 'Lost to budget']];
  const rest = Math.max(0, 1 - seg.reduce((t, s) => t + s[0], 0));
  return (
    <span title={`Shown ${pct(is)} · lost to rank ${pct(rank)}${budget != null ? ` · lost to budget ${pct(budget)}` : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span role="img" aria-label={`Impression share ${pct(is)}`} style={{ display: 'inline-flex', width: 110, height: 8, borderRadius: 4, overflow: 'hidden', background: theme.surfaceAlt }}>
        {seg.map(([v, c, k]) => <span key={k} style={{ width: `${Math.min(1, v) * 100}%`, background: c }} />)}
        <span style={{ width: `${rest * 100}%` }} />
      </span>
      <b style={{ color: theme.textPrimary, fontWeight: 600, minWidth: 34, textAlign: 'right' }}>{pct(is)}</b>
    </span>
  );
}

export function HeadroomView({ market, totals, currency, params, version, theme, dark }) {
  const state = useLazy('headroom', params, version, true);
  const [level, setLevel] = useState('campaigns');
  const kpi = kpiOf(totals);
  const avg = kpiValue(totals, kpi);
  if (state.error) return <Intro theme={theme}>Could not load impression share: {state.error}</Intro>;
  if (!state.data) return <div data-view="headroom"><Intro theme={theme}>Loading impression share from Google Ads…</Intro><div style={{ height: 200, margin: '0 20px 20px', borderRadius: 10, background: theme.surfaceAlt, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} /></div>;
  const campaigns = state.data.campaigns.filter(c => c.market === market).map(c => ({ ...c, kpiV: kpiValue(c, kpi) }));
  const keywords = state.data.keywords.filter(k => k.market === market).map(k => ({ ...k, kpiV: kpiValue(k, kpi) }));
  // Account view: weighted by eligible impressions
  // (only campaigns that report the figure count; blank = not reported, not 0%)
  const w = f => {
    let num = 0, den = 0;
    for (const c of campaigns) {
      if (!(c.impressionShare > 0) || c[f] == null) continue;
      const e = c.impressions / c.impressionShare;
      num += e * c[f]; den += e;
    }
    return den > 0 ? num / den : null;
  };
  const stats = [
    ['Impression share', w('impressionShare'), 'Share of the searches you were eligible for where your ads showed'],
    ['Lost to budget', w('lostBudget'), 'Missed because the daily budget ran out: more budget would show more'],
    ['Lost to rank', w('lostRank'), 'Missed because of bid or ad quality (ad rank): raise bids or improve ads / landing page'],
    ['Top of page', w('topShare'), 'Share of eligible top-of-page impressions you got'],
    ['Click share', w('clickShare'), 'Share of the clicks you could have got'],
  ];
  const diagnose = r => {
    const b = better(r.kpiV, avg, kpi);
    const good = r.orders > 0 && b != null && b >= 0;
    if (r.lostBudget >= 0.1) return { text: `Budget-limited (${pct(r.lostBudget)} lost)${good ? ': raise budget, it converts well' : ''}`, kind: good ? 'good' : 'warn' };
    if (r.lostRank >= 0.3 && good) return { text: `Room to grow: converts well, ${pct(r.lostRank)} lost to rank; raise bids`, kind: 'good' };
    if (r.lostRank >= 0.3) return { text: `Rank-limited (${pct(r.lostRank)}): bids, ad or landing page`, kind: 'warn' };
    if (r.impressionShare >= 0.85 && !good && r.orders >= 0 && r.spend > 0 && b != null && b < -0.3) return { text: 'Full coverage but expensive: lower bids', kind: 'bad' };
    if (r.impressionShare >= 0.85) return { text: 'Near full coverage: growth needs new keywords', kind: null };
    return null;
  };
  const label = kpi === 'roas' ? 'ROAS' : 'CPA';
  const shareCols = [
    { key: 'impressionShare', label: 'Impr. share', tip: 'Bar: shown / lost to rank / lost to budget', render: r => <ShareBar is={r.impressionShare} rank={r.lostRank} budget={r.lostBudget} theme={theme} dark={dark} /> },
    { key: 'lostRank', label: 'Lost: rank', render: r => pct(r.lostRank) },
    ...(level === 'campaigns' ? [{ key: 'lostBudget', label: 'Lost: budget', render: r => pct(r.lostBudget) }] : []),
    { key: 'topShare', label: 'Top', tip: 'Top-of-page impression share', render: r => pct(r.topShare) },
    { key: 'absTopShare', label: 'Abs. top', tip: 'Absolute top (first position) impression share', render: r => pct(r.absTopShare) },
    { key: 'clickShare', label: 'Click share', render: r => pct(r.clickShare) },
  ];
  const perfCols = [
    { key: 'spend', label: 'Spend', render: r => fmt(r.spend, 'currency', currency) },
    { key: 'orders', label: 'Conv.', render: r => conv(r.orders) },
    { key: 'kpiV', label, render: r => fmtKpi(r.kpiV, kpi, currency) },
  ];
  const act = { key: 'act', label: 'Reading', align: 'left', nosort: true, wrap: 220, render: r => { const d = diagnose(r); return d ? <Note color={d.kind ? tone(dark, d.kind) : theme.textMuted}>{d.text}</Note> : ''; } };
  const cols = level === 'campaigns'
    ? [{ key: 'campaign', label: 'Campaign', align: 'left', sticky: true, title: r => r.campaign, render: r => r.campaign }, ...perfCols, ...shareCols, act]
    : [{ key: 'text', label: 'Keyword', align: 'left', sticky: true, title: r => `${r.text}\nCampaign: ${r.campaign}`, render: r => r.text },
       { key: 'matchType', label: 'Match', align: 'left', render: r => r.matchType || '—' }, ...perfCols, ...shareCols, act];
  return (
    <div data-view="headroom">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '14px 20px 4px' }}>
        {stats.map(([k, v, tip]) => (
          <div key={k} title={tip} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: '9px 12px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: theme.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>{k}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: k === 'Lost to budget' && v >= 0.1 ? tone(dark, 'bad') : theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>{pct(v)}</div>
          </div>
        ))}
      </div>
      <Bar theme={theme}>
        <Chips label="Level" theme={theme} value={level} onChange={setLevel} items={[['campaigns', `Campaigns (${campaigns.length})`], ['keywords', `Keywords (${keywords.length})`]]} />
      </Bar>
      <Intro theme={theme}>
        Google's estimates for search campaigns. Lost to budget = the budget ran out; lost to rank = bid or ad quality. {level === 'keywords' && 'Google reports lost-to-budget per campaign only.'}
        {state.data.notes?.length > 0 && <> Not loaded: {state.data.notes.map(n => n.split(':')[0]).join(', ')}.</>}
      </Intro>
      <Table rows={level === 'campaigns' ? campaigns : keywords} cols={cols} theme={theme} sortInit={['spend', 'desc']} minWidth={1180}
        rowKey={r => (level === 'campaigns' ? r.campaign : `${r.campaign}|${r.text}|${r.matchType}`)}
        empty="No Google Search impression share for this market and period." />
    </div>
  );
}
