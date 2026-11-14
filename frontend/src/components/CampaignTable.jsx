import { createContext, useContext, useEffect, useState } from 'react';
import { fmt } from '../theme.js';
import { BreakableName } from '../campaignName.jsx';
import { useIsMobile } from '../useViewport.js';

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
const METRIC_COL_WIDTH = 72;
const CURRENCY_COL_WIDTH = 86;
const colWidth = col => col.width ?? (col.format === 'currency' ? CURRENCY_COL_WIDTH : METRIC_COL_WIDTH);
const metricsWidthOf = cols => cols.filter(c => !c.grow).reduce((s, c) => s + colWidth(c), 0);

// Name column: wide enough for the longest visible campaign / ad set / ad name
// on one line (measured with the real font), so names never wrap on desktop
const NAME_FONT = depth => (depth === 0 ? "500 12px 'DM Sans', sans-serif" : depth === 1 ? "400 12px 'DM Sans', sans-serif" : "400 11.5px 'DM Sans', sans-serif");
let measureCtx = null;
function textWidth(text, font) {
  if (typeof document === 'undefined') return (text || '').length * 7;
  measureCtx ||= document.createElement('canvas').getContext('2d');
  measureCtx.font = font;
  return measureCtx.measureText(text || '').width;
}

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

// Main goal metric per campaign, highlighted in the tables. The goal sheet's
// model wins (App provides campaign name -> model for the market); otherwise
// the buying type in the name (..._CPLV_Traffic_..., ..._CPV_Views_...), then
// the objective word. CPV = 6-second views on TikTok, ThruPlays on Meta (same
// as goal tracking).
export const GoalModelContext = createContext(null);
const MODEL_COLUMN = {
  CPLV: () => 'cplv', CPM: () => 'cpm', CPC: () => 'cpc', CTR: () => 'ctr', CPA: () => 'cpa', ROAS: () => 'roas', ROI: () => 'roas',
  CPV: platform => ({ tiktok: 'views_short', meta: 'views_15s' }[platform] || null),
};
const MODEL_LABEL = { views_short: { tiktok: '6s views' }, views_15s: { meta: 'ThruPlays' } };
function goalModelOf(name, goalModels, variant) {
  const fromSheet = goalModels?.get((name || '').trim().toLowerCase());
  if (fromSheet && MODEL_COLUMN[fromSheet]) return { model: fromSheet, source: 'goal sheet' };
  const token = (name || '').match(/(?:^|_)(CPLV|CPV|CPM|CPC|CTR|CPA|ROAS|ROI)(?=_|$)/i);
  if (token) return { model: token[1].toUpperCase(), source: 'campaign name' };
  if (/_traffic(_|$)/i.test(name || '')) return { model: 'CPLV', source: 'campaign objective' };
  if (/_views(_|$)/i.test(name || '')) return { model: 'CPV', source: 'campaign objective' };
  if (/_reach(_|$)/i.test(name || '')) return { model: 'CPM', source: 'campaign objective' };
  if (variant === 'commerce') return { model: 'ROAS', source: 'Commerce Lens default' };
  return null;
}
function goalCellOf(row, platform, goalModels, variant) {
  const g = goalModelOf(row?.campaign_name, goalModels, variant);
  const key = g ? MODEL_COLUMN[g.model](platform) : null;
  if (!key) return null;
  const what = MODEL_LABEL[key]?.[platform] ? `${g.model} (${MODEL_LABEL[key][platform]})` : g.model;
  return { key, tip: `Main goal metric: ${what}, from the ${g.source}` };
}
const LEVEL_NAME = { meta: ['ad set', 'ad sets'], tiktok: ['ad group', 'ad groups'], google: ['ad group', 'ad groups'], amazon: ['ad group', 'ad groups'] };

// "Avg 2.2s" under video views: seconds per video play, re-weighted by plays
const WatchNote = ({ sec, platform, theme }) => (sec == null ? null : (
  <span title={`Average watch time per video play${platform === 'meta' ? ' (Meta sometimes reports it rounded to whole seconds, so this can be approximate)' : ''}`}
    style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: theme.textMuted, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
    Avg {sec.toFixed(1)}s
  </span>
));

// Ad-level winner / loser within one ad set, judged on the campaign's goal
// metric (the highlighted column). Cost metrics: lowest wins. CTR / ROAS:
// highest wins. View goals compare cost per view (6s views on TikTok,
// ThruPlays on Meta) so a bigger budget does not win on volume alone. Ads need
// 1,000+ impressions (or, if fewer than two do, any value) and at least two
// ads must qualify.
const HIGHER_IS_BETTER = new Set(['ctr', 'roas']);
const GOAL_LABEL = { views_short: 'cost per 6s view', views_15s: 'cost per ThruPlay', cplv: 'CPLV', cpm: 'CPM', cpc: 'CPC', cpa: 'CPA', ctr: 'CTR', roas: 'ROAS' };
function adBadges(ads, campaignRow, platform, goalModels, variant, currency, { noun = 'ads', where = 'in this ad set' } = {}) {
  const out = new Map();
  const goal = goalCellOf(campaignRow, platform, goalModels, variant);
  if (!goal) return out;
  const valueOf = a => {
    if (goal.key === 'views_short' || goal.key === 'views_15s') {
      const views = cellValue(a, goal.key, platform), spend = parseFloat(a.spend);
      return views > 0 && spend > 0 ? spend / views : null;
    }
    const v = parseFloat(cellValue(a, goal.key, platform));
    return Number.isFinite(v) ? v : null;
  };
  let pool = ads.map(a => ({ a, v: valueOf(a) })).filter(x => x.v != null);
  const big = pool.filter(x => parseFloat(x.a.impressions) >= 1000);
  if (big.length >= 2) pool = big;
  if (pool.length < 2) return out;
  const higher = HIGHER_IS_BETTER.has(goal.key);
  pool.sort((x, y) => (higher ? y.v - x.v : x.v - y.v));
  const best = pool[0], worst = pool[pool.length - 1];
  if (best.v === worst.v) return out;
  const show = v => (goal.key === 'ctr' ? `${v.toFixed(2)}%` : goal.key === 'roas' ? `${v.toFixed(2)}x`
    : v < 1 ? `${currency} ${v.toFixed(4)}` : fmt(v, 'currency', currency));
  const what = GOAL_LABEL[goal.key] || goal.key;
  out.set(best.a, { kind: 'winner', tip: `Best ${what} of ${pool.length} ${noun} ${where} (${show(best.v)})` });
  out.set(worst.a, { kind: 'loser', tip: `Weakest ${what} of ${pool.length} ${noun} ${where} (${show(worst.v)})` });
  return out;
}

// Ad grouping (Type / Language) from the naming convention
//   Type_MMYY_Length_Audience_Concept_Language   e.g. Video_1026_20s_Prospecting_The-Dress_BM
// Type = first part (Video, GIF, Static, Carousel); Google ads without a name
// use their ad type. Language = the last language code among the parts
// separated by "_" or spaces (GIF_Offer_NA_10.10 BM_RTG -> BM).
const TYPE_ALIASES = { video: 'Video', vdo: 'Video', gif: 'GIF', static: 'Static', image: 'Static', img: 'Static', carousel: 'Carousel', collection: 'Collection' };
const LANGS = new Set(['EN', 'BM', 'MS', 'VN', 'VI', 'ZH', 'CN', 'TH', 'ID', 'BI', 'TL', 'JP', 'JA', 'KR', 'KO', 'TW']);
export function adTypeOf(row) {
  const first = String(row?.name || '').split(/[_\s]/)[0].toLowerCase();
  if (TYPE_ALIASES[first]) return TYPE_ALIASES[first];
  const g = String(row?.ad_group_ad_ad_type || '').toUpperCase();
  if (g.includes('VIDEO')) return 'Video';
  if (g.includes('SEARCH')) return 'Search';
  if (g.includes('DISPLAY') || g.includes('IMAGE')) return 'Display';
  return 'Other';
}
export function adLangOf(row) {
  const parts = String(row?.name || '').split(/[_\s]+/).map(t => t.toUpperCase());
  for (let i = parts.length - 1; i >= 0; i--) if (LANGS.has(parts[i])) return parts[i];
  return 'Not tagged';
}
const GROUPERS = { type: adTypeOf, lang: adLangOf };
const GROUP_LABEL = { adset: 'Ad set', type: 'Type', lang: 'Language' };

// Totals for a set of rows (ads in a group, or one ad across several ad
// sets): counts are summed, rates recalculated, reach left out (not additive),
// average watch time re-weighted by plays
const SUMMED = ['spend', 'impressions', 'clicks', 'video_views', 'video_play_actions', 'landing_page_views', 'video_watched_6s',
  'engaged_view_15s', 'video_thruplay_watched_actions', 'orders', 'revenue', 'watch_time_total', 'watch_plays'];
function combineRows(rows, extra) {
  const out = { campaign_name: rows[0]?.campaign_name, ...extra };
  for (const k of SUMMED) {
    if (!rows.some(r => r[k] != null && r[k] !== '')) continue;
    out[k] = rows.reduce((t, r) => t + (parseFloat(r[k]) || 0), 0);
  }
  const sp = out.spend || 0, imp = out.impressions || 0, cl = out.clicks || 0;
  out.ctr = imp > 0 ? (cl / imp) * 100 : null;
  out.cpm = imp > 0 ? (sp / imp) * 1000 : null;
  out.cpc = cl > 0 ? sp / cl : null;
  out.roas = sp > 0 && out.revenue > 0 ? out.revenue / sp : null;
  out.cpa = out.orders > 0 && sp > 0 ? sp / out.orders : null;
  out.avg_watch_time = out.watch_plays > 0 ? out.watch_time_total / out.watch_plays : null;
  return out;
}

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
  amazon: {
    label: 'Amazon',
    color: '#FF9900',
    badge: { bg: '#fff3e0', text: '#b45309' },
    kpis: [],
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
  const mobile = useIsMobile();
  const [hover, setHover] = useState(null); // { r: row key, c: column key }
  const [, setFontsReady] = useState(false);
  useEffect(() => { document.fonts?.ready?.then(() => setFontsReady(true)); }, []);
  const goalModels = useContext(GoalModelContext);
  const [openRows, setOpenRows] = useState({});   // key -> true
  const [drillData, setDrillData] = useState({}); // key -> { loading | rows | error }
  useEffect(() => { setOpenRows({}); setDrillData({}); }, [drill?.rangeKey]);

  // How an opened campaign breaks down: its ad sets (then ads), or all its ads
  // grouped by type / language (then the ads in each group)
  const [groupBy, setGroupBy] = useState('adset');
  const ensureData = (key, args) => {
    if (!drill || (drillData[key] && !drillData[key].error)) return;
    setDrillData(d => ({ ...d, [key]: { loading: true } }));
    drill.fetch({ platform, lens, ...args })
      .then(r => setDrillData(d => ({ ...d, [key]: { rows: r.rows || [] } })))
      .catch(e => setDrillData(d => ({ ...d, [key]: { error: e.message } })));
  };
  const campaignDataKey = name => (groupBy === 'adset' ? `c|${name}` : `ca|${name}`);
  const campaignArgs = name => (groupBy === 'adset' ? { campaign: name } : { campaign: name, scope: 'campaign' });
  const toggleRow = (key, dataKey, args) => {
    const opening = !openRows[key];
    setOpenRows(o => ({ ...o, [key]: opening }));
    if (opening && dataKey) ensureData(dataKey, args);
  };
  // Switching the grouping keeps open campaigns open and loads what they need
  useEffect(() => {
    for (const [k, open] of Object.entries(openRows)) {
      if (!open || !k.startsWith('c|')) continue;
      const name = k.slice(2);
      ensureData(campaignDataKey(name), campaignArgs(name));
    }
  }, [groupBy]);

  const config = PLATFORM_CONFIG[platform];
  const columns = variant === 'commerce' ? COMMERCE_COLUMNS : COLUMNS;
  if (!config) return null;

  const { campaigns = [], total = {}, currency = 'SGD' } = data || {};
  const kpiTotal = { ...total, cplv: trafficCplv(campaigns), ...viewsTotals(campaigns, platform) };
  const totalPrevKeys = prevTotalsRoasOnly ? ['roas'] : PREV_KEYS;

  // Any column sorts both ways; rows with no value ("—") always go last
  const sortValue = r => {
    const v = cellValue(r, sortKey === 'campaign_name' && r.name != null ? 'name' : sortKey, platform);
    if (sortKey === 'campaign_name') return v == null ? null : String(v);
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const byCurrentSort = (a, b) => {
    const av = sortValue(a), bv = sortValue(b);
    if (av == null || bv == null) return av == null && bv == null ? 0 : av == null ? 1 : -1;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
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
    const cData = campaignDataKey(row.campaign_name);
    flatRows.push({ row, depth: 0, key: cKey, canOpen: !!drill && !gmvMax && platform !== 'amazon',
      toggle: () => toggleRow(cKey, cData, campaignArgs(row.campaign_name)) });
    if (!openRows[cKey]) continue;
    const cd = drillData[cData];
    const childName = groupBy === 'adset' ? many : 'ads';
    if (!cd || cd.loading || cd.error || !cd.rows.length) {
      flatRows.push({ status: cd?.error ? `Could not load ${childName}: ${cd.error}` : cd?.rows ? `No ${childName} with spend in this period` : `Loading ${childName}…`, depth: 1, key: `${cKey}|status` });
      continue;
    }
    if (groupBy !== 'adset') {
      // All the campaign's ads, grouped; the same ad in several ad sets is one row
      const byGroup = new Map();
      for (const a of cd.rows) {
        const g = GROUPERS[groupBy](a);
        if (!byGroup.has(g)) byGroup.set(g, new Map());
        const ads = byGroup.get(g);
        ads.set(a.name, [...(ads.get(a.name) || []), a]);
      }
      const groups = [...byGroup.entries()].map(([g, ads]) => {
        const adRows = [...ads.entries()].map(([name, parts]) => (parts.length === 1 ? parts[0]
          : combineRows(parts, { name, adset: `${parts.length} ${many}` })));
        return combineRows(adRows, { name: `${g} (${adRows.length} ad${adRows.length === 1 ? '' : 's'})`, group: g, ads: adRows });
      });
      const groupBadges = adBadges(groups, row, platform, goalModels, variant, currency, { noun: `${GROUP_LABEL[groupBy].toLowerCase()} groups`, where: 'in this campaign' });
      for (const grp of groups.sort(byCurrentSort)) {
        const gKey = `g|${row.campaign_name}|${groupBy}|${grp.group}`;
        flatRows.push({ row: grp, depth: 1, key: gKey, level: GROUP_LABEL[groupBy].toLowerCase(), canOpen: true, badge: groupBadges.get(grp),
          toggle: () => toggleRow(gKey) });
        if (!openRows[gKey]) continue;
        const badges = adBadges(grp.ads, row, platform, goalModels, variant, currency, { where: `in ${grp.group}` });
        for (const a of [...grp.ads].sort(byCurrentSort)) flatRows.push({ row: a, depth: 2, key: `${gKey}|${a.name}`, level: 'ad', badge: badges.get(a) });
      }
      continue;
    }
    for (const as of [...cd.rows].sort(byCurrentSort)) {
      const aKey = `a|${row.campaign_name}|${as.adset}`;
      const aArgs = { campaign: row.campaign_name, adset: as.adset };
      flatRows.push({ row: as, depth: 1, key: aKey, level: one, canOpen: true,
        toggle: () => toggleRow(aKey, aKey, aArgs) });
      if (!openRows[aKey]) continue;
      const ad = drillData[aKey];
      if (!ad || ad.loading || ad.error || !ad.rows.length) {
        flatRows.push({ status: ad?.error ? `Could not load ads: ${ad.error}` : ad?.rows ? 'No ads with spend in this period' : 'Loading ads…', depth: 2, key: `${aKey}|status` });
        continue;
      }
      const badges = adBadges(ad.rows, row, platform, goalModels, variant, currency);
      for (const a of [...ad.rows].sort(byCurrentSort)) flatRows.push({ row: a, depth: 2, key: `${aKey}|${a.name}`, level: 'ad', badge: badges.get(a) });
    }
  }

  // First click: names A-Z, numbers high to low; clicking again flips it
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'campaign_name' ? 'asc' : 'desc'); }
  };

  const darkBadge = theme.bg === '#080d1a';
  const badgeEl = badge => badge && (
    <span data-badge={badge.kind} title={badge.tip} style={{
      marginLeft: 6, padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help',
      color: badge.kind === 'winner' ? (darkBadge ? '#34d399' : '#047857') : (darkBadge ? '#f87171' : '#b91c1c'),
      background: badge.kind === 'winner' ? (darkBadge ? 'rgba(52,211,153,0.15)' : '#d1fae5') : (darkBadge ? 'rgba(248,113,113,0.15)' : '#fee2e2'),
    }}>{badge.kind === 'winner' ? 'winner' : 'loser'}</span>
  );

  // Name column width (desktop): longest name + its indent / buttons
  const nameExtras = r => (r.depth === 0 ? (onTrend ? 30 : 0) + (r.canOpen ? 16 : 0) : r.depth * 16 + 16) + (r.badge ? 58 : 0);
  const nameW = mobile ? 168 : Math.min(760, Math.max(200, ...flatRows.filter(r => !r.status).map(r =>
    Math.ceil(textWidth(r.depth > 0 ? r.row.name : r.row.campaign_name, NAME_FONT(r.depth)) + nameExtras(r) + 26))));
  const metricsW = metricsWidthOf(columns);

  // Crosshair hover colours (layered over each cell's opaque base, so the
  // sticky name column never shows content scrolling underneath it)
  const dark = theme.bg === '#080d1a';
  const lineTint = dark ? 'rgba(96,165,250,0.10)' : 'rgba(37,99,235,0.06)';
  const crossTint = dark ? 'rgba(96,165,250,0.26)' : 'rgba(37,99,235,0.16)';
  const layer = (tint, base) => (tint ? `linear-gradient(${tint}, ${tint}), ${base}` : base);

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
          flexWrap: 'wrap',
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
        {drill && platform !== 'amazon' && (
          <span role="group" aria-label="Break campaigns down by" onClick={e => e.stopPropagation()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: theme.textMuted }}>
            Ads by
            <span style={{ display: 'inline-flex', border: `1px solid ${theme.border}`, borderRadius: 7, overflow: 'hidden' }}>
              {['adset', 'type', 'lang'].map(k => (
                <button key={k} aria-pressed={groupBy === k} onClick={() => setGroupBy(k)} style={{
                  border: 'none', padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  background: groupBy === k ? theme.accentLight : theme.surface, color: groupBy === k ? theme.accent : theme.textSecondary,
                }}>{k === 'adset' ? (one[0].toUpperCase() + one.slice(1)) : GROUP_LABEL[k]}</button>
              ))}
            </span>
          </span>
        )}
        {!loading && campaigns.some(c => goalCellOf(c, platform, goalModels, variant)) && (
          <span title="Each campaign's main goal metric (goal sheet, else the buying type in the campaign name) is highlighted"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: theme.textMuted, cursor: 'help' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: theme.accentLight, boxShadow: `inset 2px 0 0 ${theme.accent}` }} />
            Goal metric
          </span>
        )}
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

          {/* Scrolls inside itself (header row pinned to the top, names pinned to
              the left) once it is taller than most of the screen */}
          <div data-table-scroll style={{ overflow: 'auto', maxHeight: mobile ? '70vh' : 'min(75vh, 900px)', overscrollBehavior: 'contain' }}
            onMouseLeave={() => setHover(null)}>
            <table style={{ width: '100%', minWidth: nameW + metricsW, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
              <colgroup>
                {columns.map(col => (
                  <col key={col.key} style={col.grow ? { width: `max(${nameW}px, calc(100% - ${metricsW}px))` } : { width: colWidth(col) }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: theme.surfaceAlt }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSort(col.key); } }}
                      onMouseEnter={() => setHover({ r: null, c: col.key })}
                      tabIndex={0}
                      aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      title={`${col.title ? `${col.title}. ` : ''}Click to sort${sortKey === col.key ? ` (now ${sortDir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
                      style={{
                        padding: '8px 10px',
                        textAlign: col.align,
                        fontSize: 10, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: sortKey === col.key || hover?.c === col.key ? theme.accent : theme.textMuted,
                        fontFamily: "'Space Grotesk', sans-serif",
                        cursor: 'pointer',
                        verticalAlign: 'bottom',
                        borderBottom: `1px solid ${theme.border}`,
                        userSelect: 'none',
                        position: 'sticky', top: 0, zIndex: col.grow ? 3 : 2,
                        ...(col.grow ? { left: 0, borderRight: `1px solid ${theme.border}` } : {}),
                        background: layer(hover?.c === col.key && !col.grow ? crossTint : null, theme.surfaceAlt),
                      }}
                    >
                      {col.labels?.[platform] ?? col.label}
                      <span aria-hidden="true" style={{ marginLeft: 3, opacity: sortKey === col.key ? 0.8 : hover?.c === col.key ? 0.45 : 0 }}>
                        {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
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
                    : flatRows.map(({ row, depth, key: rowKey, status, level, canOpen, toggle, badge }) => {
                      const base = depth === 0 ? theme.surface : theme.surfaceAlt;
                      const goalCell = row ? goalCellOf(row, platform, goalModels, variant) : null;
                      if (status) return (
                        <tr key={rowKey}>
                          <td colSpan={columns.length} style={{ padding: `6px 10px 6px ${10 + depth * 16 + 16}px`, fontSize: 12, color: theme.textMuted, background: base, borderBottom: `1px solid ${theme.border}` }}>{status}</td>
                        </tr>
                      );
                      return (
                      <tr
                        key={rowKey}
                        data-depth={depth}
                        style={{ fontSize: depth === 2 ? 11.5 : 12 }}
                      >
                        {columns.map(col => {
                          const val = col.grow && depth > 0 ? row.name : cellValue(row, col.key, platform);
                          const display = col.format == null
                            ? (val || '—')
                            : (val == null || val === '' ? '—' : fmt(val, col.format, currency));
                          return (
                            <td
                              key={col.key}
                              title={col.key === 'campaign_name' ? `${level ? `${level[0].toUpperCase()}${level.slice(1)}: ` : ''}${val || ''}` : goalCell?.key === col.key ? goalCell.tip : undefined}
                              data-goal={goalCell?.key === col.key ? '1' : undefined}
                              data-col={col.key}
                              onMouseEnter={() => setHover(h => (h?.r === rowKey && h?.c === col.key ? h : { r: rowKey, c: col.key }))}
                              style={{
                                padding: depth === 2 ? '4px 10px' : depth === 1 ? '6px 10px' : '8px 10px',
                                textAlign: col.align,
                                color: col.key === 'campaign_name' ? (depth === 2 ? theme.textSecondary : theme.textPrimary) : goalCell?.key === col.key ? theme.accent : theme.textSecondary,
                                fontWeight: col.key === 'campaign_name' ? (depth === 0 ? 500 : 400) : goalCell?.key === col.key ? 700 : 400,
                                ...(goalCell?.key === col.key ? { boxShadow: `inset 2px 0 0 ${theme.accent}` } : {}),
                                background: layer(
                                  hover?.r === rowKey && hover?.c === col.key ? crossTint
                                    : hover && (hover.r === rowKey || (hover.c === col.key && !col.grow)) ? lineTint : null,
                                  goalCell?.key === col.key ? theme.accentLight : base),
                                borderBottom: `1px solid ${theme.border}`,
                                verticalAlign: 'top',
                                lineHeight: 1.4,
                                // Names stay on one line on desktop (wrap on phones); numbers never wrap
                                ...(col.grow
                                  ? { position: 'sticky', left: 0, zIndex: 1, borderRight: `1px solid ${theme.border}`, ...(mobile ? { overflowWrap: 'anywhere' } : { whiteSpace: 'nowrap' }) }
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
                                      aria-label={`${openRows[rowKey] ? 'Hide' : 'Show'} ${depth === 0 ? (groupBy === 'adset' ? many : `ads by ${GROUP_LABEL[groupBy].toLowerCase()}`) : 'ads'} for ${val}`}
                                      title={`${openRows[rowKey] ? 'Hide' : 'Show'} ${depth === 0 ? (groupBy === 'adset' ? many : `ads by ${GROUP_LABEL[groupBy].toLowerCase()}`) : 'ads'}`}
                                      style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 4, minWidth: 0, padding: 0, border: 'none',
                                        background: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                                        style={{ flexShrink: 0, marginTop: 2, color: theme.textMuted, transition: 'transform 0.15s', transform: openRows[rowKey] ? 'rotate(90deg)' : 'none' }}>
                                        <path d="M9 6l6 6-6 6" />
                                      </svg>
                                      <span style={{ minWidth: 0 }}>{mobile ? <BreakableName name={val} /> : val}{badgeEl(badge)}</span>
                                    </button>
                                  ) : (
                                    <span style={{ minWidth: 0, paddingLeft: depth ? 16 : 0 }}>
                                      {mobile ? <BreakableName name={val} /> : val}
                                      {badgeEl(badge)}
                                    </span>
                                  )}
                                </div>
                              ) : depth === 2 && (col.vtr || col.key === 'video_views') && val != null ? (
                                <span title={col.vtr ? `VTR ${vtrOf(val, row.impressions)?.toFixed(2) ?? '—'}%` : row.avg_watch_time != null ? `Avg watch time ${row.avg_watch_time.toFixed(1)}s per play` : undefined}>{display}</span>
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
                  <tr>
                    {columns.map(col => {
                      const v = col.grow ? null : kpiTotal[col.key];
                      return (
                        <td key={col.key} style={{
                          padding: '8px 10px', textAlign: col.align, fontWeight: 700,
                          color: theme.textPrimary, whiteSpace: 'nowrap',
                          background: theme.surfaceAlt, borderTop: `2px solid ${theme.borderStrong}`,
                          ...(col.grow ? { position: 'sticky', left: 0, zIndex: 1, borderRight: `1px solid ${theme.border}` } : {}),
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
