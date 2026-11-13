import { createContext, useContext, useEffect, useState } from 'react';
import { fmt } from '../theme.js';
import { BreakableName } from '../campaignName.jsx';

// One shared column set so TikTok, Meta and Google tables line up exactly.
// Metrics a platform does not report render as "—".
const COLUMNS = [
  { key: 'campaign_name', label: 'Campaign',    align: 'left',  grow: true, format: null },
  { key: 'spend',         label: 'Spend',       align: 'right', format: 'currency', width: 120 },
  { key: 'impressions',   label: 'Impr.',       align: 'right', format: 'compact' },
  { key: 'reach',         label: 'Reach',       align: 'right', format: 'compact' },
  { key: 'video_views',   label: 'Video Views', align: 'right', format: 'compact' },
  { key: 'clicks',        label: 'Clicks',      align: 'right', format: 'compact' },
  { key: 'ctr',           label: 'CTR',         align: 'right', format: 'percent' },
  { key: 'cpm',           label: 'CPM',         align: 'right', format: 'currency' },
  { key: 'cpc',           label: 'CPC',         align: 'right', format: 'currency' },
  { key: 'cplv',          label: 'CPLV',        align: 'right', format: 'currency', title: 'Cost per landing page view (traffic campaigns only)' },
  { key: 'views_short',   label: 'Short Views', labels: { meta: '3s Views', tiktok: '6s Views' }, align: 'right', format: 'compact', width: 86, vtr: true,
    title: 'Views campaigns only. Meta: 3-second video views. TikTok: 6-second video views. Small label: view-through rate = views / impressions' },
  { key: 'views_15s',     label: '15s Views',   labels: { meta: 'ThruPlay', tiktok: '15s Focused' }, align: 'right', format: 'compact', width: 86, vtr: true,
    title: 'Views campaigns only. Meta: ThruPlays (15s or complete). TikTok: 15-second focused views. Small label: view-through rate = views / impressions' },
  { key: 'cptp',          label: 'CPTP',        align: 'right', format: 'currency', title: 'Cost per ThruPlay = spend / ThruPlays (Meta views campaigns only)' },
];
// Cost columns need room for a currency code; counts and rates are short
const METRIC_COL_WIDTH = 74;
const CURRENCY_COL_WIDTH = 86;
const CAMPAIGN_COL_MIN = 140;
const colWidth = col => col.width ?? (col.format === 'currency' ? CURRENCY_COL_WIDTH : METRIC_COL_WIDTH);
const minWidthOf = cols => CAMPAIGN_COL_MIN + cols.filter(c => !c.grow).reduce((s, c) => s + colWidth(c), 0);

// Commerce Lens: sales outcome first. Same widths as Brand so tables still line up.
const COMMERCE_COLUMNS = [
  { key: 'campaign_name', label: 'Campaign', align: 'left',  grow: true, format: null },
  { key: 'spend',         label: 'Spend',    align: 'right', format: 'currency', width: 120, title: 'Small label: daily average spend vs the previous month' },
  { key: 'revenue',       label: 'Revenue',  align: 'right', format: 'currency', width: 120, title: 'Small label: daily average revenue vs the previous month' },
  { key: 'roas',          label: 'ROAS',     align: 'right', format: 'roas',     width: 98, title: 'Return on ad spend = revenue / spend. Small label: change vs the previous month' },
  { key: 'orders',        label: 'Orders',   align: 'right', format: 'number', title: 'Small label: daily average orders vs the previous month' },
  { key: 'cpa',           label: 'CPA',      align: 'right', format: 'currency', title: 'Cost per acquisition = spend / orders' },
  { key: 'impressions',   label: 'Impr.',    align: 'right', format: 'compact' },
  { key: 'ctr',           label: 'CTR',      align: 'right', format: 'percent' },
  { key: 'cpm',           label: 'CPM',      align: 'right', format: 'currency' },
];

const COMMERCE_KPIS = [
  { key: 'spend',   label: 'Spend',   format: 'currency' },
  { key: 'revenue', label: 'Revenue', format: 'currency' },
  { key: 'roas',    label: 'ROAS',    format: 'roas' },
  { key: 'orders',  label: 'Orders',  format: 'number' },
  { key: 'cpa',     label: 'CPA',     format: 'currency' },
  { key: 'cpm',     label: 'CPM',     format: 'currency' },
];

// Traffic campaigns are named ..._Traffic_... (e.g. SG_Meta_OATSIDE_Consideration_CPLV_Traffic_2026_Coffee)
export const isTrafficCampaign = name => /_traffic(_|$)/i.test(name || '');

const cplvOf = (spend, lpv) => {
  const s = parseFloat(spend), l = parseFloat(lpv);
  return l > 0 ? s / l : null;
};

// Views campaigns are named ..._Views_... (e.g. PH_Meta_OATSIDE_Awareness_CPV_Views_2026_Kids-Phase1)
export const isViewsCampaign = name => /_views(_|$)/i.test(name || '');

// Drill-down: App provides the fetcher and a key for the current market/range
// (open rows reset when it changes). Campaign -> ad set -> ad (Google stops at
// ad groups, which have no named ads).
export const DrillContext = createContext(null);
const LEVEL_NAME = { meta: ['ad set', 'ad sets'], tiktok: ['ad group', 'ad groups'], google: ['ad group', 'ad groups'] };

// "Avg 2.2s" under video views: seconds per video play, re-weighted by plays
const WatchNote = ({ sec, platform, theme }) => (sec == null ? null : (
  <span title={`Average watch time per video play${platform === 'meta' ? ' (Meta sometimes reports it rounded to whole seconds, so this can be approximate)' : ''}`}
    style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: theme.textMuted, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
    Avg {sec.toFixed(1)}s
  </span>
));

// Views campaigns only:
//   short views  Meta 3-second video views | TikTok 6-second video views
//   15s views    Meta ThruPlays            | TikTok 15-second focused views
//   VTR          views / impressions (calculated, never summed or averaged)
//   CPTP         Meta only: spend / ThruPlays
const VIEW_FIELDS = {
  meta:   { views_short: 'video_views',      views_15s: 'video_thruplay_watched_actions' },
  tiktok: { views_short: 'video_watched_6s', views_15s: 'engaged_view_15s' },
};
const viewsOf = (row, key, platform) => {
  const field = VIEW_FIELDS[platform]?.[key];
  return field && isViewsCampaign(row.campaign_name) ? (parseFloat(row[field]) || null) : null;
};
const vtrOf = (views, impressions) => (views != null && parseFloat(impressions) > 0 ? (views / parseFloat(impressions)) * 100 : null);

// TikTok reports video views as video_play_actions; CPLV only for traffic campaigns
function cellValue(row, key, platform) {
  if (key === 'video_views') return row.video_views ?? row.video_play_actions;
  if (key === 'cplv') return isTrafficCampaign(row.campaign_name) ? cplvOf(row.spend, row.landing_page_views) : null;
  if (key === 'views_short' || key === 'views_15s') return viewsOf(row, key, platform);
  if (key === 'cptp') { const tp = platform === 'meta' ? viewsOf(row, 'views_15s', platform) : null; return tp ? (parseFloat(row.spend) || 0) / tp : null; }
  return row[key];
}

// Platform-level views totals across its views campaigns only; VTRs use the
// impressions of those same campaigns
function viewsTotals(campaigns, platform) {
  const none = { views_short: null, views_15s: null, vtr_short: null, vtr_15s: null, cptp: null };
  if (!VIEW_FIELDS[platform]) return none;
  const views = campaigns.filter(c => isViewsCampaign(c.campaign_name));
  if (!views.length) return none;
  const sum = f => views.reduce((a, c) => a + (parseFloat(c[f]) || 0), 0);
  const short = sum(VIEW_FIELDS[platform].views_short), long = sum(VIEW_FIELDS[platform].views_15s);
  const imp = sum('impressions'), sp = sum('spend');
  return {
    views_short: short || null, views_15s: long || null,
    vtr_short: short ? vtrOf(short, imp) : null, vtr_15s: long ? vtrOf(long, imp) : null,
    cptp: platform === 'meta' && long > 0 ? sp / long : null,
  };
}

// Small grey "VTR 4.2%" under a views value
const VtrNote = ({ vtr, theme }) => (vtr == null ? null : (
  <span title="View-through rate = views / impressions" style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: theme.textMuted, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
    VTR {vtr.toFixed(vtr < 10 ? 2 : 1)}%
  </span>
));

// Platform-level CPLV across its traffic campaigns only
function trafficCplv(campaigns) {
  const traffic = campaigns.filter(c => isTrafficCampaign(c.campaign_name));
  if (!traffic.length) return null;
  const sum = k => traffic.reduce((a, c) => a + (parseFloat(c[k]) || 0), 0);
  return cplvOf(sum('spend'), sum('landing_page_views'));
}

const PLATFORM_CONFIG = {
  tiktok: {
    label: 'TikTok',
    color: '#010101',
    badge: { bg: '#f0f0f0', text: '#010101' },
    kpis: [
      { key: 'spend',              label: 'Spend',        format: 'currency' },
      { key: 'impressions',        label: 'Impressions',  format: 'compact' },
      { key: 'video_play_actions', label: 'Video Views',  format: 'compact' },
      { key: 'reach',              label: 'Reach',        format: 'compact' },
      { key: 'ctr',                label: 'CTR',          format: 'percent' },
      { key: 'cpm',                label: 'CPM',          format: 'currency' },
      { key: 'cplv',               label: 'CPLV · Traffic', format: 'currency', optional: true },
      { key: 'views_short',        label: '6s Views · Views', format: 'compact', optional: true },
      { key: 'views_15s',          label: '15s Focused · Views', format: 'compact', optional: true },
      { key: 'avg_watch_time',     label: 'Avg Watch Time', format: 'seconds', optional: true },
    ],
  },
  meta: {
    label: 'Meta',
    color: '#1877F2',
    badge: { bg: '#e8f0fe', text: '#1877F2' },
    kpis: [
      { key: 'spend',       label: 'Spend',       format: 'currency' },
      { key: 'impressions', label: 'Impressions', format: 'compact' },
      { key: 'reach',       label: 'Reach',       format: 'compact' },
      { key: 'clicks',      label: 'Clicks',      format: 'compact' },
      { key: 'ctr',         label: 'CTR',         format: 'percent' },
      { key: 'cpm',         label: 'CPM',         format: 'currency' },
      { key: 'cplv',        label: 'CPLV · Traffic', format: 'currency', optional: true },
      { key: 'views_short', label: '3s Views · Views', format: 'compact', optional: true },
      { key: 'views_15s',   label: 'ThruPlay · Views', format: 'compact', optional: true },
      { key: 'avg_watch_time', label: 'Avg Watch Time', format: 'seconds', optional: true },
      { key: 'cptp',        label: 'CPTP · Views',  format: 'currency', optional: true },
    ],
  },
  google: {
    label: 'Google',
    color: '#EA4335',
    badge: { bg: '#fce8e6', text: '#EA4335' },
    kpis: [
      { key: 'spend',       label: 'Spend',       format: 'currency' },
      { key: 'impressions', label: 'Impressions', format: 'compact' },
      { key: 'clicks',      label: 'Clicks',      format: 'compact' },
      { key: 'ctr',         label: 'CTR',         format: 'percent' },
      { key: 'cpm',         label: 'CPM',         format: 'currency' },
      { key: 'cpc',         label: 'CPC',         format: 'currency' },
    ],
  },
};

function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '10px 10px' }}>
          <div style={{ height: 14, background: '#e2e8f0', borderRadius: 4, width: i === 0 ? '70%' : '60%', animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

// "▲ 12% vs Oct" under a value: change vs the previous calendar month
export function VsPrevious({ current, previous, label, tip, theme }) {
  if (current == null || !(previous > 0)) return null;
  const pct = ((current - previous) / previous) * 100;
  const dark = theme.bg === '#080d1a';
  const color = pct >= 0 ? (dark ? '#34d399' : '#047857') : (dark ? '#f87171' : '#b91c1c');
  const a = Math.abs(pct);
  return (
    <span title={tip} style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color, lineHeight: 1.3, cursor: 'help', whiteSpace: 'nowrap' }}>
      {pct >= 0 ? '▲' : '▼'} {a < 10 ? a.toFixed(1) : Math.round(a)}% vs {label}
    </span>
  );
}

const PREV_KEYS = ['roas', 'spend', 'revenue', 'orders'];
const perDay = v => `${v}/day`;

// Callout for one cell: current value (this period's total or ratio) vs the
// previous-month pack { roas, spendSgd, orders } from CommerceLens.makePrev.
function prevNote(key, current, prevPack, prev, currency, theme) {
  if (!prev || !prevPack || current == null || current === '') return null;
  const L = prev.label;
  if (key === 'roas') {
    return <VsPrevious current={current} previous={prevPack.roas} label={L} theme={theme}
      tip={prevPack.roas != null ? `${L} ROAS: ${prevPack.roas.toFixed(2)}x` : undefined} />;
  }
  if (!prev.periodDays || !prev.prevDays) return null;
  const nowDaily = Number(current) / prev.periodDays;
  if (key === 'spend' || key === 'revenue') {
    const prevTotal = prev.toLocal(key === 'spend' ? prevPack.spendSgd : prevPack.revenueSgd, currency);
    if (prevTotal == null) return null;
    const prevDaily = prevTotal / prev.prevDays;
    return <VsPrevious current={nowDaily} previous={prevDaily} label={L} theme={theme}
      tip={`Daily average ${key}: ${perDay(fmt(nowDaily, 'currency', currency))} this period (${prev.periodDays} days) vs ${perDay(fmt(prevDaily, 'currency', currency))} in ${L} (${fmt(prevTotal, 'currency', currency)} over ${prev.prevDays} days)`} />;
  }
  if (key === 'orders') {
    const prevDaily = (prevPack.orders || 0) / prev.prevDays;
    return <VsPrevious current={nowDaily} previous={prevDaily} label={L} theme={theme}
      tip={`Daily average orders: ${nowDaily.toFixed(1)}/day this period (${prev.periodDays} days) vs ${prevDaily.toFixed(1)}/day in ${L} (${Math.round(prevPack.orders || 0).toLocaleString('en-US')} over ${prev.prevDays} days)`} />;
  }
  return null;
}

function KPIRow({ kpis, total, theme, currency, notes }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 24,
      padding: '16px 20px',
      background: theme.surfaceAlt,
      borderBottom: `1px solid ${theme.border}`,
    }}>
      {kpis.map(({ key, label, format }) => {
        const val = total?.[key];
        const hasVal = val != null && val !== '' && !(typeof val === 'number' && isNaN(val));
        return (
          <div key={key} style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.textMuted, marginBottom: 3, fontFamily: "'Space Grotesk', sans-serif" }}>
              {label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.01em' }}>
              {hasVal ? fmt(val, format, currency) : '—'}
            </div>
            {notes?.[key]}
          </div>
        );
      })}
    </div>
  );
}

export function PlatformSection({ platform, label, data, theme, loading, lens = 'brand', onTrend, variant = 'brand', prev, prevTotalsRoasOnly }) {
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(true);
  const drill = useContext(DrillContext);
  const [openRows, setOpenRows] = useState({});   // key -> true
  const [drillData, setDrillData] = useState({}); // key -> { loading | rows | error }
  useEffect(() => { setOpenRows({}); setDrillData({}); }, [drill?.rangeKey]);

  const toggleRow = (key, args) => {
    const opening = !openRows[key];
    setOpenRows(o => ({ ...o, [key]: opening }));
    if (!opening || !drill || (drillData[key] && !drillData[key].error)) return;
    setDrillData(d => ({ ...d, [key]: { loading: true } }));
    drill.fetch({ platform, lens, ...args })
      .then(r => setDrillData(d => ({ ...d, [key]: { rows: r.rows || [] } })))
      .catch(e => setDrillData(d => ({ ...d, [key]: { error: e.message } })));
  };

  const config = PLATFORM_CONFIG[platform];
  const columns = variant === 'commerce' ? COMMERCE_COLUMNS : COLUMNS;
  if (!config) return null;

  const { campaigns = [], total = {}, currency = 'SGD' } = data || {};
  const kpiTotal = { ...total, cplv: trafficCplv(campaigns), ...viewsTotals(campaigns, platform) };
  const totalPrevKeys = prevTotalsRoasOnly ? ['roas'] : PREV_KEYS;

  const byCurrentSort = (a, b) => {
    const k = sortKey === 'campaign_name' && a.name != null ? 'name' : sortKey;
    const av = cellValue(a, k, platform) ?? 0;
    const bv = cellValue(b, k, platform) ?? 0;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (Number(av) - Number(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  };
  const sorted = [...campaigns].sort(byCurrentSort);

  // Table rows: campaigns, with open campaigns followed by their ad sets and
  // open ad sets by their ads
  const [one, many] = LEVEL_NAME[platform] || ['ad set', 'ad sets'];
  const flatRows = [];
  for (const row of sorted) {
    const cKey = `c|${row.campaign_name}`;
    // TikTok GMV Max campaigns report only campaign-level totals (no ad groups)
    const gmvMax = platform === 'tiktok' && parseFloat(row.gmv_cost) > 0;
    flatRows.push({ row, depth: 0, key: cKey, canOpen: !!drill && !gmvMax, toggle: () => toggleRow(cKey, { campaign: row.campaign_name }) });
    if (!openRows[cKey]) continue;
    const cd = drillData[cKey];
    if (!cd || cd.loading || cd.error || !cd.rows.length) {
      flatRows.push({ status: cd?.error ? `Could not load ${many}: ${cd.error}` : cd?.rows ? `No ${many} with spend in this period` : `Loading ${many}…`, depth: 1, key: `${cKey}|status` });
      continue;
    }
    for (const as of [...cd.rows].sort(byCurrentSort)) {
      const aKey = `a|${row.campaign_name}|${as.adset}`;
      const adLevel = platform !== 'google';
      flatRows.push({ row: as, depth: 1, key: aKey, level: one, canOpen: adLevel,
        toggle: () => toggleRow(aKey, { campaign: row.campaign_name, adset: as.adset }) });
      if (!adLevel || !openRows[aKey]) continue;
      const ad = drillData[aKey];
      if (!ad || ad.loading || ad.error || !ad.rows.length) {
        flatRows.push({ status: ad?.error ? `Could not load ads: ${ad.error}` : ad?.rows ? 'No ads with spend in this period' : 'Loading ads…', depth: 2, key: `${aKey}|status` });
        continue;
      }
      for (const a of [...ad.rows].sort(byCurrentSort)) flatRows.push({ row: a, depth: 2, key: `${aKey}|${a.name}`, level: 'ad' });
    }
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      {/* Platform header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${theme.border}` : 'none',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          background: config.badge.bg, color: config.badge.text,
          padding: '3px 10px', borderRadius: 6,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {label ?? config.label}
        </span>
        <span style={{ fontSize: 13, color: theme.textMuted }}>
          {loading ? '…' : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} · ${currency}`}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: expanded ? 'none' : 'rotate(-90deg)' }}
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>

      {expanded && (
        <>
          <KPIRow
            kpis={variant === 'commerce' ? COMMERCE_KPIS : config.kpis.filter(k => !k.optional || kpiTotal[k.key] != null)}
            total={kpiTotal}
            theme={theme}
            currency={currency}
            notes={prev
              ? Object.fromEntries(totalPrevKeys.map(k => [k, prevNote(k, kpiTotal[k], prev.total, prev, currency, theme)]))
              : { views_short: <VtrNote vtr={kpiTotal.vtr_short} theme={theme} />, views_15s: <VtrNote vtr={kpiTotal.vtr_15s} theme={theme} /> }}
          />

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: minWidthOf(columns), tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <colgroup>
                {columns.map(col => (
                  <col key={col.key} style={col.grow ? undefined : { width: colWidth(col) }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: theme.surfaceAlt }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      title={col.title}
                      style={{
                        padding: '8px 10px',
                        textAlign: col.align,
                        fontSize: 10.5, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: sortKey === col.key ? theme.accent : theme.textMuted,
                        fontFamily: "'Space Grotesk', sans-serif",
                        cursor: 'pointer',
                        verticalAlign: 'bottom',
                        borderBottom: `1px solid ${theme.border}`,
                        userSelect: 'none',
                      }}
                    >
                      {col.labels?.[platform] ?? col.label}
                      {sortKey === col.key && (
                        <span style={{ marginLeft: 4, opacity: 0.7 }}>
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
                  : sorted.length === 0
                    ? (
                      <tr>
                        <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: 13 }}>
                          No campaign data for this period
                        </td>
                      </tr>
                    )
                    : flatRows.map(({ row, depth, key: rowKey, status, level, canOpen, toggle }) => {
                      const base = depth === 0 ? 'transparent' : theme.surfaceAlt;
                      if (status) return (
                        <tr key={rowKey} style={{ borderBottom: `1px solid ${theme.border}`, background: base }}>
                          <td colSpan={columns.length} style={{ padding: `8px 10px 8px ${10 + depth * 16 + 16}px`, fontSize: 12, color: theme.textMuted }}>{status}</td>
                        </tr>
                      );
                      return (
                      <tr
                        key={rowKey}
                        data-depth={depth}
                        style={{ borderBottom: `1px solid ${theme.border}`, background: base, fontSize: depth ? 12 : undefined }}
                        onMouseEnter={e => { e.currentTarget.style.background = theme.surfaceHover; }}
                        onMouseLeave={e => { e.currentTarget.style.background = base; }}
                      >
                        {columns.map(col => {
                          const val = col.grow && depth > 0 ? row.name : cellValue(row, col.key, platform);
                          const display = col.format == null
                            ? (val || '—')
                            : (val == null || val === '' ? '—' : fmt(val, col.format, currency));
                          return (
                            <td
                              key={col.key}
                              title={col.key === 'campaign_name' ? (val || '') : undefined}
                              style={{
                                padding: '10px 10px',
                                textAlign: col.align,
                                color: col.key === 'campaign_name' ? theme.textPrimary : theme.textSecondary,
                                fontWeight: col.key === 'campaign_name' ? (depth === 0 ? 500 : 400) : 400,
                                verticalAlign: 'top',
                                lineHeight: 1.45,
                                // Campaign names wrap at "_" / "-"; numbers stay on one line
                                ...(col.grow
                                  ? { overflowWrap: 'anywhere' }
                                  : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                              }}
                            >
                              {col.grow && val ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, paddingLeft: depth * 16 }}>
                                  {depth === 0 && onTrend && (
                                    <button
                                      onClick={() => onTrend({ campaign: val, platform, lens, currency, variant })}
                                      title="View daily trend (CPM / CTR / CPLV)"
                                      aria-label={`View daily trend for ${val}`}
                                      style={{
                                        flexShrink: 0, width: 24, height: 24, marginTop: -2, borderRadius: 6,
                                        border: `1px solid ${theme.border}`, background: theme.surface,
                                        color: theme.accent, cursor: 'pointer', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', padding: 0,
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M3 3v18h18" />
                                        <path d="M7 15l4-4 3 3 5-6" />
                                      </svg>
                                    </button>
                                  )}
                                  {canOpen ? (
                                    <button
                                      onClick={toggle}
                                      aria-expanded={!!openRows[rowKey]}
                                      aria-label={`${openRows[rowKey] ? 'Hide' : 'Show'} ${depth === 0 ? many : 'ads'} for ${val}`}
                                      title={`${openRows[rowKey] ? 'Hide' : 'Show'} ${depth === 0 ? many : 'ads'}`}
                                      style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0, padding: 0, border: 'none',
                                        background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                        style={{ flexShrink: 0, marginTop: 3, color: theme.textMuted, transition: 'transform 0.15s', transform: openRows[rowKey] ? 'rotate(90deg)' : 'none' }}>
                                        <path d="M9 6l6 6-6 6" />
                                      </svg>
                                      <span style={{ minWidth: 0 }}>
                                        {level && <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.textMuted }}>{level}</span>}
                                        <BreakableName name={val} />
                                      </span>
                                    </button>
                                  ) : (
                                    <span style={{ minWidth: 0, paddingLeft: depth ? 16 : 0 }}>
                                      {level && <span style={{ display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: theme.textMuted }}>{level}</span>}
                                      <BreakableName name={val} />
                                    </span>
                                  )}
                                </div>
                              ) : col.vtr && val != null ? (
                                <>
                                  {display}
                                  <VtrNote vtr={vtrOf(val, row.impressions)} theme={theme} />
                                </>
                              ) : col.key === 'video_views' && val != null && row.avg_watch_time != null ? (
                                <>
                                  {display}
                                  <WatchNote sec={row.avg_watch_time} platform={platform} theme={theme} />
                                </>
                              ) : depth === 0 && prev && PREV_KEYS.includes(col.key) ? (
                                <>
                                  {display}
                                  {prevNote(col.key, val, prev.campaign(row.campaign_name), prev, currency, theme)}
                                </>
                              ) : display}
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })
                }
              </tbody>
              {variant === 'commerce' && !loading && sorted.length > 0 && (
                <tfoot>
                  <tr style={{ background: theme.surfaceAlt, borderTop: `2px solid ${theme.borderStrong}` }}>
                    {columns.map(col => {
                      const v = col.grow ? null : kpiTotal[col.key];
                      return (
                        <td key={col.key} style={{
                          padding: '10px 10px', textAlign: col.align, fontWeight: 700,
                          color: theme.textPrimary, whiteSpace: 'nowrap',
                        }}>
                          {col.grow ? `Total · ${sorted.length} campaigns` : (v == null || v === '' ? '—' : fmt(v, col.format, currency))}
                          {prev && totalPrevKeys.includes(col.key) && prevNote(col.key, v, prev.total, prev, currency, theme)}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function CampaignTable({ theme, data, loading, onTrend }) {
  return (
    <div>
      <PlatformSection platform="tiktok" data={data?.tiktok} theme={theme} loading={loading} onTrend={onTrend} />
      <PlatformSection platform="meta"   data={data?.meta}   theme={theme} loading={loading} onTrend={onTrend} />
      <PlatformSection platform="google" data={data?.google} theme={theme} loading={loading} onTrend={onTrend} />
    </div>
  );
}
