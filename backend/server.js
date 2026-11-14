import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { loadGoalSheet, scoreGoals, previousRange } from './goals.js';
import { normalizeRow } from './tmr.js';
import { groupSales } from './sales.js';
import { PRIORITY, CPAS_MARKET, detectMarket, TEAM_ID, MARKETS, ACCOUNTS, ALL_ACCOUNTS, CPAS_ACCOUNTS, AMAZON_ACCOUNTS, isCommerceCampaign, isCommerceRow, queryTMR, parsePlatformResult, splitByMarket, getDateRange } from './tmr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const TMR_API_KEY = process.env.TMR_API_KEY;

// In-memory cache: key → { ts, data, promise }
const dashCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function getCached(key) {
  const e = dashCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > (e.ttl ?? CACHE_TTL)) { dashCache.delete(key); return null; }
  return e;
}

// Cache results for CACHE_TTL and share one in-flight fetch between callers
async function cached(key, fetchFn, ttl = CACHE_TTL) {
  const hit = getCached(key);
  if (hit?.data)    return hit.data;
  if (hit?.promise) return hit.promise;
  const promise = fetchFn();
  dashCache.set(key, { ts: Date.now(), promise, data: null });
  try {
    const data = await promise;
    dashCache.set(key, { ts: Date.now(), data, promise: null, ttl });
    return data;
  } catch (err) {
    dashCache.delete(key);
    throw err;
  }
}

function resolveDateRange(query) {
  const { dateRange: drParam = '7', startDate, endDate } = query;
  // Custom ranges and calendar presets (MTD, QTD, this/last month) arrive as explicit dates
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  if (isDate(startDate) && isDate(endDate) && startDate <= endDate) return { startDate, endDate };
  const days = Math.min(Math.max(parseInt(drParam) || 7, 1), 365);
  return getDateRange(days);
}

// opts.dimensions defaults to per-campaign rows; opts.filters narrows the query
const queryOnce = (accounts, metrics, dateRange, { dimensions = ['campaign_name'], filters, priority } = {}) => queryTMR(TMR_API_KEY, TEAM_ID, {
  accounts,
  dimensions,
  metrics,
  dateRange,
  ...(filters?.length ? { filters } : {}),
  sort: dimensions.includes('date')
    ? [{ fieldId: 'date', direction: 'asc' }]
    : [{ fieldId: 'amount_spent', direction: 'desc' }],
}, { priority });

const DAY = 86400000;

// Give up waiting on a query after `ms` (reported as a partial error), so one
// slow source cannot hold a whole response past the hosting gateway's limit
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} took longer than ${Math.round(ms / 1000)}s`)), ms); }),
  ]);
}
const isoDay = t => new Date(t).toISOString().slice(0, 10);

// Sum rows that share the same dimension values (results of split queries). All
// metrics we request are additive except reach, which is slightly overstated
// when a single campaign's date range had to be split, and average watch time,
// which is re-weighted by video plays (never summed).
const ADSET_DIMS = ['fads_adset_name', 'ttads_adgroup_name', 'gadw_ad_group_name', 'adset_name', 'adgroup_name', 'ad_group_name',
  'gadw_ad_group_ad_ad_id', 'ad_group_ad_ad_id', 'gadw_ad_group_ad_ad_name', 'ad_group_ad_ad_name', 'gadw_ad_group_ad_ad_type', 'ad_group_ad_ad_type',
  'amazonads_targeting_expression',
  // Search Lens
  'gadw_search_term_view_search_term', 'gadw_segments_keyword_info_text', 'gadw_segments_keyword_info_match_type',
  'gadw_ad_group_criterion_keyword_text', 'gadw_ad_group_criterion_match_type', 'gadw_ad_group_criterion_quality_info_quality_score',
  'amazonads_search_term'];
const DIMENSION_KEYS = ['campaign_name', 'date', 'year_month', 'ad_name', ...ADSET_DIMS];
const WEIGHTED_AVG = { fads_video_average_watch_time: 'fads_video_play_actions', ttads_average_video_play: 'ttads_video_play_actions',
  gadw_metrics_search_impression_share: 'impressions' };
function mergeRows(...results) {
  const byName = new Map();
  for (const r of results.flatMap(x => x?.data || [])) {
    const key = DIMENSION_KEYS.map(k => r[k] ?? '').join('|');
    const prev = byName.get(key);
    if (!prev) { byName.set(key, { ...r }); continue; }
    // Weighted averages first, while both rows still hold their own play counts
    for (const [avg, w] of Object.entries(WEIGHTED_AVG)) {
      if (!(avg in r) && !(avg in prev)) continue;
      const a1 = parseFloat(prev[avg]), w1 = parseFloat(prev[w]) || 0;
      const a2 = parseFloat(r[avg]),    w2 = parseFloat(r[w]) || 0;
      const num = (isFinite(a1) ? a1 * w1 : 0) + (isFinite(a2) ? a2 * w2 : 0);
      const den = (isFinite(a1) ? w1 : 0) + (isFinite(a2) ? w2 : 0);
      prev[avg] = den > 0 ? num / den : null;
    }
    for (const [k, v] of Object.entries(r)) {
      if (k in WEIGHTED_AVG) continue;
      if (DIMENSION_KEYS.includes(k)) continue;
      const n = parseFloat(v);
      if (isFinite(n)) prev[k] = (parseFloat(prev[k]) || 0) + n;
    }
  }
  return { data: [...byName.values()] };
}

// Some metrics cannot be summed over a multi-day range (TikTok rejects "Reach"
// with "... was aggregated which can give out exaggerated results").
const NON_ADDITIVE = ['ttads_reach', 'fads_reach'];

// If TMR still returns 504 (~60s, and every failed attempt costs that minute),
// splitting is bounded:
//   1. several accounts -> one query per account
//   2. one account      -> its date range in two halves (once)
// Results are merged by campaign name.
// Ranges longer than this are queried in chunks up front: one month across all
// accounts takes ~10s, while 60-90 day ranges risk TMR's 60s limit (504).
const MAX_CHUNK_DAYS = 31;

function chunkRange({ startDate, endDate }) {
  const chunks = [];
  const end = Date.parse(endDate);
  for (let s = Date.parse(startDate); s <= end; s += MAX_CHUNK_DAYS * DAY) {
    chunks.push({ startDate: isoDay(s), endDate: isoDay(Math.min(end, s + (MAX_CHUNK_DAYS - 1) * DAY)) });
  }
  return chunks;
}

async function makeQuery(accounts, metrics, dateRange, opts = {}) {
  const chunks = opts.chunk === false ? [dateRange] : chunkRange(dateRange);
  if (chunks.length === 1) return makeQuerySplit(accounts, metrics, dateRange, opts);
  const parts = [];
  for (const chunk of chunks) parts.push(await makeQuerySplit(accounts, metrics, chunk, opts));
  return mergeRows(...parts);
}

async function makeQuerySplit(accounts, metrics, dateRange, opts = {}) {
  const { split = true } = opts;
  try {
    return await queryOnce(accounts, metrics, dateRange, opts);
  } catch (err) {
    const dropped = metrics.filter(m => NON_ADDITIVE.includes(m));
    const unknown = [...String(err.message).matchAll(/Unknown field "([^"]+)"/gi)].map(m => m[1])
      .filter(f => metrics.includes(f) && !CORE_FIELDS.includes(f));
    const suggestion = String(err.message).match(/Unknown field "([^"]+)"[^"]*Did you mean "([^"]+)"/i);
    if (err.status === 400 && suggestion && !opts.suggested) {
      const [, bad, good] = suggestion;
      console.warn(`[TMR] field ${bad} -> ${good} (TMR suggestion), retrying`);
      const swap = list => list?.map(f => (f === bad ? good : f));
      const filters = opts.filters?.map(f => (f.fieldId === bad ? { ...f, fieldId: good } : f));
      return makeQuerySplit(accounts, swap(metrics), dateRange, { ...opts, dimensions: swap(opts.dimensions), filters, suggested: true });
    }
    if (err.status === 400 && unknown.length) {
      console.warn(`[TMR] dropping unknown field(s) ${unknown.join(', ')} and retrying`);
      return makeQuerySplit(accounts, metrics.filter(m => !unknown.includes(m)), dateRange, opts);
    }
    if (/aggregated/i.test(err.message) && dropped.length) {
      console.warn(`[TMR] ${dropped.join(', ')} cannot be aggregated for this range — retrying without it`);
      return makeQuerySplit(accounts, metrics.filter(m => !dropped.includes(m)), dateRange, opts);
    }
    if (err.status !== 504 || !split) throw err;

    if (accounts.length > 1) {
      console.warn(`[TMR] 504 — retrying ${accounts.length} accounts one at a time`);
      const parts = [];
      for (const acc of accounts) parts.push(await makeQuerySplit([acc], metrics, dateRange, opts));
      return mergeRows(...parts);
    }
    const s = Date.parse(dateRange.startDate), e = Date.parse(dateRange.endDate);
    const days = Math.round((e - s) / DAY) + 1;
    if (days < 2) throw err;
    const half = Math.floor(days / 2);
    console.warn(`[TMR] 504 — splitting ${days}-day range for ${accounts[0]} in two`);
    const first  = await makeQuerySplit(accounts, metrics, { startDate: dateRange.startDate, endDate: isoDay(s + (half - 1) * DAY) }, { ...opts, split: false });
    const second = await makeQuerySplit(accounts, metrics, { startDate: isoDay(s + half * DAY), endDate: dateRange.endDate }, { ...opts, split: false });
    return mergeRows(first, second);
  }
}

// TMR field ids: amount_spent, impressions and clicks are common fields shared by
// every connector; platform-specific fields must carry the connector prefix
// (e.g. ttads_video_play_actions). parsePlatformResult strips the prefix again.
// Landing page views feed the CPLV column for traffic campaigns
// Orders / revenue feed ROAS and CPA in Commerce Lens:
//   TikTok GMV Max: spend is only reported as gmv_cost (amount_spent is blank)
//   Meta brand:     purchases (all) / purchase value (all)
//   Google:         conversions / conversion value
//   Meta CPAS:      collaborative-ads purchases / purchase value (CPAS_METRICS)
// Average watch time is per video play on both platforms, so the plays are
// fetched alongside it to re-weight it when rows are combined
const META_METRICS   = ['amount_spent', 'impressions', 'clicks', 'fads_reach', 'fads_video_views', 'fads_website_fb_landing_page_views',
                        'fads_all_purchases', 'fads_purchase_conversions_all', 'fads_video_thruplay_watched_actions',
                        'fads_video_play_actions', 'fads_video_average_watch_time'];
// Views campaigns: Meta 3s views (video_views) + ThruPlays; TikTok 6s views + 15s focused views
const TIKTOK_METRICS = ['amount_spent', 'impressions', 'clicks', 'ttads_video_play_actions', 'ttads_reach', 'ttads_total_landing_page_view',
                        'ttads_gmv_cost', 'ttads_gmv_orders', 'ttads_gmv_gross_revenue', 'ttads_video_watched_6s', 'ttads_engaged_view_15s', 'ttads_average_video_play'];
const GOOGLE_METRICS = ['amount_spent', 'impressions', 'clicks', 'conversions', 'gadw_metrics_conversions_value'];
// Amazon Ads: ad orders / ad sales (Amazon's default attribution); cost is a
// fallback in case amount_spent is not mapped for Amazon
const AMAZON_METRICS = ['amount_spent', 'impressions', 'clicks', 'amazonads_cost', 'amazonads_total_purchases', 'amazonads_total_sales'];
const CPAS_METRICS   = ['amount_spent', 'impressions', 'clicks', 'fads_reach', 'fads_video_views',
                        'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'];

// Fields every query needs; any other field TMR rejects as unknown is dropped
// and the query retried, so one bad optional field never breaks a whole tab.
const CORE_FIELDS = ['amount_spent', 'impressions', 'clicks'];

// Goal tracking needs heavier metrics (landing page views, 6-second views,
// ThruPlays). They are fetched separately, only for accounts that have goals,
// so the main Brand/Commerce queries stay fast.
const GOAL_METRICS = {
  tiktok: ['amount_spent', 'impressions', 'clicks', 'ttads_total_landing_page_view', 'ttads_video_watched_6s'],
  meta:   ['amount_spent', 'impressions', 'clicks', 'fads_website_fb_landing_page_views', 'fads_video_thruplay_watched_actions'],
  google: ['amount_spent', 'impressions', 'clicks'],
};

function requireKey(res) {
  if (TMR_API_KEY) return true;
  res.status(500).json({ error: 'TMR_API_KEY not set in .env — add TMR_API_KEY=your_key' });
  return false;
}

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));


// Brand Lens: non-CPAS accounts. Campaigns containing "_Sales_" or "_Conversion_"
// are split out into `commerceCampaigns` so Commerce Lens can show them
// without another TMR request.
// Brand data for one date range (3 TMR requests, cached and shared by
// /api/dashboard and /api/goals).
function fetchBrand(dateRangeObj, ttl = CACHE_TTL) {
  return cached(`brand_${dateRangeObj.startDate}_${dateRangeObj.endDate}`, async () => {
    // 3 requests total — one per platform, all markets combined (queued in tmr.js)
    const ttRaw     = await makeQuery(ALL_ACCOUNTS.tiktok, TIKTOK_METRICS, dateRangeObj);
    const metaRaw   = await makeQuery(ALL_ACCOUNTS.meta, META_METRICS, dateRangeObj);
    const googleRaw = await makeQuery(ALL_ACCOUNTS.google, GOOGLE_METRICS, dateRangeObj);

    // Split each platform's rows into per-market buckets
    const split = { tiktok: splitByMarket(ttRaw), meta: splitByMarket(metaRaw), google: splitByMarket(googleRaw) };

    const markets = Object.fromEntries(
      Object.entries(MARKETS).map(([code, cfg]) => {
        const brand = {}, commerceCampaigns = {};
        for (const platform of ['tiktok', 'meta', 'google']) {
          const rows = split[platform][code];
          const currency = cfg.currency[platform];
          brand[platform] = { ...parsePlatformResult({ data: rows.filter(r => !isCommerceRow(r)) }), currency };
          commerceCampaigns[platform] = { ...parsePlatformResult({ data: rows.filter(r =>  isCommerceRow(r)) }), currency };
        }
        return [code, { ...brand, commerceCampaigns, marketName: cfg.name }];
      })
    );

    return { markets, dateRange: dateRangeObj };
  }, ttl);
}

app.get('/api/dashboard', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    res.json(await fetchBrand(resolveDateRange(req.query)));
  } catch (err) {
    console.error('[dashboard error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Goal tracking (Brand Lens): goals from the published MajorPace sheet, scored
// against the selected range. Goal metrics come from their own light query,
// limited to accounts that have goals (one request per platform with goals).
// With ?trend=1 the same query also runs for the equal-length previous period
// (cached for an hour since that data is historical).
const PREVIOUS_PERIOD_TTL = 60 * 60 * 1000;

function fetchGoalData(sheet, range, ttl = CACHE_TTL, priority = PRIORITY.normal) {
  // Which platform/market accounts have goals
  const wanted = {};
  for (const g of sheet.goals) {
    const account = ACCOUNTS[g.platform]?.[g.market];
    if (account) (wanted[g.platform] ||= new Set()).add(account);
  }
  const key = Object.entries(wanted).map(([p, s]) => `${p}:${[...s].sort().join('+')}`).sort().join('|');

  return cached(`goaldata_${range.startDate}_${range.endDate}_${key}`, async () => {
    const raw = {};
    for (const [platform, accounts] of Object.entries(wanted)) {
      raw[platform] = splitByMarket(await makeQuery([...accounts], GOAL_METRICS[platform], range, { priority }));
    }
    const markets = Object.fromEntries(Object.entries(MARKETS).map(([code, cfg]) => [code,
      Object.fromEntries(['tiktok', 'meta', 'google'].map(platform => [platform, {
        ...parsePlatformResult({ data: raw[platform]?.[code] || [] }),
        currency: cfg.currency[platform],
      }])),
    ]));
    return { markets, dateRange: range };
  }, ttl);
}

app.get('/api/goals', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const range = resolveDateRange(req.query);
    const prevRange = previousRange(range);
    const withTrend = req.query.trend === '1';

    const sheet = await cached('goal_sheet', loadGoalSheet);
    const current = await fetchGoalData(sheet, range);

    let previous = null, previousError = null;
    if (withTrend) {
      // Previous period is only for the trend; goals still show if it fails
      try { previous = await fetchGoalData(sheet, prevRange, PREVIOUS_PERIOD_TTL, PRIORITY.background); }
      catch (err) { previousError = err.message; console.error('[goals previous period]', err.message); }
    }

    res.json({
      markets: scoreGoals(sheet, current, previous, range),
      dateRange: range,
      previousRange: prevRange,
      trendLoaded: withTrend && !previousError,
      previousError,
      hiddenRows: sheet.hiddenRows || [],
    });
  } catch (err) {
    console.error('[goals error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Campaign trend (on demand): daily data for ONE campaign, only when a user
// opens a chart. Kept fast by:
//   - querying the campaign's own account first (from its market prefix, e.g.
//     SG_Meta_... -> the SG Meta account), other accounts only if it is not there
//   - spend / impressions / clicks for CPM and CTR; landing page views (heavy on
//     Meta) only when the CPLV tab asks for them (?lpv=1)
const TREND_BASE = ['amount_spent', 'impressions', 'clicks'];
const TREND_EXTRA = { tiktok: ['ttads_gmv_cost'] }; // GMV Max spend
const TREND_LPV = { tiktok: 'ttads_total_landing_page_view', meta: 'fads_website_fb_landing_page_views' };
const TREND_METRICS = { tiktok: true, meta: true, google: true };
// Orders / revenue for the ROAS tab, per source (CPAS = Meta in Commerce Lens' CPAS sections)
const TREND_REVENUE = {
  cpas:   ['fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'],
  tiktok: ['ttads_gmv_orders', 'ttads_gmv_gross_revenue'],
  meta:   ['fads_all_purchases', 'fads_purchase_conversions_all'],
  google: ['conversions', 'gadw_metrics_conversions_value'],
};

// TMR may return dates as 2026-10-01, 20261001 or a full timestamp
function normalizeDate(v) {
  const s = String(v ?? '');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

// Drill-down (on demand): one campaign's ad sets, or one ad set's ads.
// Same metrics as the campaign tables; one TMR request per click, cached.
// Accounts: the campaign's own market account first, then the others (like
// the trend chart), because some campaigns run from another market's account.
// Amazon breaks a campaign down by targeting group (close match, loose match,
// substitutes, complements for auto campaigns). Amazon reports targeting and
// advertised products separately, so there is no ASIN level under it.
const ADSET_DIM = { meta: 'fads_adset_name', tiktok: 'ttads_adgroup_name', google: 'gadw_ad_group_name', amazon: 'amazonads_targeting_expression' };
const AMAZON_TARGETING = { 'close-match': 'Close match', 'loose-match': 'Loose match', substitutes: 'Substitutes', complements: 'Complements' };
const DRILL_TTL = 30 * 60 * 1000;
// TikTok will not combine GMV Max fields with ad group / ad names (the query
// hangs until TMR's 504), so drill-downs leave them out. GMV Max campaigns
// have no ad group breakdown and are not expandable in the UI.
const GMV_FIELDS = ['ttads_gmv_cost', 'ttads_gmv_orders', 'ttads_gmv_gross_revenue'];

function campaignAccounts(platform, lens, campaign) {
  if (platform === 'amazon') return { own: AMAZON_ACCOUNTS, others: [] };
  const market = detectMarket(campaign);
  const cpas = lens === 'commerce' && platform === 'meta';
  const all = cpas ? [...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD] : ALL_ACCOUNTS[platform];
  const own = cpas ? all.filter(a => CPAS_MARKET[a] === market) : [ACCOUNTS[platform]?.[market]].filter(Boolean);
  return { own, others: all.filter(a => !own.includes(a)) };
}

// Ad-level dimensions. Google ads have no "ad_name" common field: video ads
// carry a name, search ads only an ID and type (shown as "Responsive search ad · <id>").
const AD_DIMS = {
  meta: ['ad_name'], tiktok: ['ad_name'],
  google: ['gadw_ad_group_ad_ad_name', 'gadw_ad_group_ad_ad_id', 'gadw_ad_group_ad_ad_type'],
};
const GOOGLE_AD_TYPE = t => String(t || 'Ad').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

// ?adset=X -> that ad set's ads; ?scope=campaign -> every ad in the campaign
// (for grouping ads by type / language); neither -> the campaign's ad sets.
app.get('/api/drill', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const { platform, campaign, adset, lens = 'brand' } = req.query;
    const allAds = req.query.scope === 'campaign';
    if (!ADSET_DIM[platform] || !campaign) return res.status(400).json({ error: 'platform and campaign are required' });
    // Amazon breaks down to targeting groups only
    if (platform === 'amazon' && (adset || allAds)) return res.status(400).json({ error: 'Amazon drill-down stops at targeting groups' });
    const level = adset || allAds ? 'ad' : 'adset';
    const range = resolveDateRange(req.query);
    const metrics = lens === 'commerce' && platform === 'meta' ? CPAS_METRICS
      : { meta: META_METRICS, tiktok: TIKTOK_METRICS.filter(m => !GMV_FIELDS.includes(m)), google: GOOGLE_METRICS, amazon: AMAZON_METRICS }[platform];
    const { own, others } = campaignAccounts(platform, lens, campaign);

    const result = await cached(`drill_${lens}_${platform}_${level}_${allAds ? 'all' : ''}_${campaign}_${adset || ''}_${range.startDate}_${range.endDate}`, async () => {
      const opts = {
        dimensions: ['campaign_name', ADSET_DIM[platform], ...(level === 'ad' ? AD_DIMS[platform] : [])],
        filters: [
          { fieldId: 'campaign_name', operator: 'equals', value: campaign },
          ...(adset ? [{ fieldId: ADSET_DIM[platform], operator: 'equals', value: adset }] : []),
        ],
        priority: PRIORITY.user, // the user is waiting on this one
        ...(platform === 'amazon' ? { split: false } : {}),
      };
      const hasRows = r => (r?.data || []).length > 0;
      let raw = own.length ? await makeQuery(own, metrics, range, opts) : null;
      if (!hasRows(raw) && others.length) raw = await makeQuery(others, metrics, range, opts);
      const rows = (raw?.data || []).map(row => {
        const r = normalizeRow(row);
        const adsetName = r.adset_name ?? r.adgroup_name ?? r.ad_group_name
          ?? (r.targeting_expression != null ? (AMAZON_TARGETING[String(r.targeting_expression).toLowerCase()] || r.targeting_expression) : '');
        const adName = r.ad_name || r.ad_group_ad_ad_name
          || (r.ad_group_ad_ad_id ? `${GOOGLE_AD_TYPE(r.ad_group_ad_ad_type)} · ${r.ad_group_ad_ad_id}` : '');
        return { ...r, adset: adsetName, name: level === 'ad' ? (adName || '(unnamed ad)') : (adsetName || '(unnamed ad set)') };
      })
        // Same rule as campaigns: keep rows with spend, or with late-attributed revenue
        .filter(r => parseFloat(r.spend || 0) > 0 || r.revenue > 0)
        .sort((a, b) => (parseFloat(b.spend) || 0) - (parseFloat(a.spend) || 0));
      return { platform, lens, level, scope: allAds ? 'campaign' : null, campaign, adset: adset || null, dateRange: range, rows };
    }, DRILL_TTL);
    res.json(result);
  } catch (err) {
    console.error('[drill error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Campaign status (greys out ended / paused campaigns): one background request
// per platform for the selected range, cached for an hour. Each platform's own
// status and end date decide:
//   Ended   end date before today (Google: serving status ENDED)
//   Paused  paused / switched off (TikTok: operation status DISABLE)
//   Removed deleted / archived / removed
const STATUS_TTL = 60 * 60 * 1000;
const STATUS_SOURCES = [
  { platform: 'meta', accounts: () => [...ALL_ACCOUNTS.meta, ...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD],
    dims: ['fads_campaign_effective_status', 'fads_campaign_stop_time'],
    classify: r => {
      const st = String(r.campaign_effective_status || '').toUpperCase(), end = String(r.campaign_stop_time || '').slice(0, 10);
      if (/DELETED|ARCHIVED/.test(st)) return ['removed', 'Removed'];
      if (end && end < isoDay(Date.now())) return ['ended', 'Ended', end];
      if (/PAUSED/.test(st)) return ['paused', 'Paused'];
      return null;
    } },
  { platform: 'tiktok', accounts: () => ALL_ACCOUNTS.tiktok,
    dims: ['ttads_campaign_operation_status', 'ttads_campaign_secondary_status'],
    classify: r => {
      const sec = String(r.campaign_secondary_status || '').toUpperCase(), op = String(r.campaign_operation_status || '').toUpperCase();
      if (/DELETE/.test(sec)) return ['removed', 'Removed'];
      if (op === 'DISABLE' || /STATUS_DISABLE$/.test(sec)) return ['paused', 'Paused'];
      return null;
    } },
  { platform: 'google', accounts: () => ALL_ACCOUNTS.google,
    dims: ['gadw_campaign_status', 'gadw_campaign_serving_status', 'gadw_campaign_end_date'],
    classify: r => {
      const st = String(r.campaign_status || '').toUpperCase(), sv = String(r.campaign_serving_status || '').toUpperCase(), end = String(r.campaign_end_date || '').slice(0, 10);
      if (st === 'REMOVED') return ['removed', 'Removed'];
      if (sv === 'ENDED' || (end && end < isoDay(Date.now()))) return ['ended', 'Ended', end];
      if (st === 'PAUSED' || sv === 'SUSPENDED') return ['paused', 'Paused'];
      return null;
    } },
  { platform: 'amazon', accounts: () => AMAZON_ACCOUNTS,
    dims: ['amazonads_campaign_status', 'amazonads_campaign_end_date'],
    classify: r => {
      const st = String(r.campaign_status || '').toUpperCase(), end = String(r.campaign_end_date || '').slice(0, 10);
      if (st === 'ARCHIVED') return ['removed', 'Removed'];
      if (end && end < isoDay(Date.now())) return ['ended', 'Ended', end];
      if (st === 'PAUSED') return ['paused', 'Paused'];
      return null;
    } },
];

app.get('/api/status', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const range = resolveDateRange(req.query);
    const result = await cached(`status_${range.startDate}_${range.endDate}`, async () => {
      const statuses = {};
      const notes = [];
      await Promise.all(STATUS_SOURCES.map(async src => {
        try {
          const raw = await withTimeout(makeQuery(src.accounts(), ['impressions'], range,
            { dimensions: ['campaign_name', ...src.dims], priority: PRIORITY.background, split: false }), 90000, src.platform);
          const out = (statuses[src.platform] = {});
          for (const row of raw?.data || []) {
            const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/^(ttads|fads|gadw|amazonads)_/, ''), v]));
            const c = src.classify(r);
            if (c && r.campaign_name) out[r.campaign_name] = { state: c[0], label: c[1], ...(c[2] ? { end: c[2] } : {}) };
          }
        } catch (err) { notes.push(`${src.platform}: ${err.message}`); console.error('[status]', src.platform, err.message); }
      }));
      return { dateRange: range, statuses, notes };
    }, STATUS_TTL);
    res.json(result);
  } catch (err) {
    console.error('[status error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search Lens: Google keywords + search terms and Amazon search terms for the
// selected range, all markets in one cached response (market split by
// campaign name, so switching market is instant). 3 requests.
//   Google keywords:     keyword, match type, quality score, impression share
//   Google search terms: search term + the keyword / match type it matched
//   Amazon search terms: search term + targeting group (auto campaigns have
//                        no keywords)
const SEARCH_TTL = 30 * 60 * 1000;
const titleCase = s => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

app.get('/api/search', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const range = resolveDateRange(req.query);
    const result = await cached(`search_${range.startDate}_${range.endDate}`, async () => {
      const base = ['amount_spent', 'impressions', 'clicks'];
      const opts = { priority: PRIORITY.user };
      const notes = [];
      const run = (label, ...args) => withTimeout(makeQuery(...args), 90000, label)
        .catch(err => { notes.push(`${label}: ${err.message}`); console.error('[search]', label, err.message); return null; });
      const [kwRaw, gstRaw, astRaw] = await Promise.all([
        run('Google keywords', ALL_ACCOUNTS.google, [...base, 'conversions', 'gadw_metrics_conversions_value', 'gadw_metrics_search_impression_share'], range,
          { ...opts, dimensions: ['campaign_name', 'gadw_ad_group_criterion_keyword_text', 'gadw_ad_group_criterion_match_type', 'gadw_ad_group_criterion_quality_info_quality_score'] }),
        run('Google search terms', ALL_ACCOUNTS.google, [...base, 'conversions', 'gadw_metrics_conversions_value'], range,
          { ...opts, dimensions: ['campaign_name', 'gadw_search_term_view_search_term', 'gadw_segments_keyword_info_text', 'gadw_segments_keyword_info_match_type'] }),
        run('Amazon search terms', AMAZON_ACCOUNTS, [...base, 'amazonads_cost', 'amazonads_total_purchases', 'amazonads_total_sales'], range,
          { ...opts, split: false, dimensions: ['campaign_name', 'amazonads_search_term', 'amazonads_targeting_expression'] }),
      ]);
      const num = v => parseFloat(v) || 0;
      const keep = r => r.spend > 0 || r.clicks > 0 || r.orders > 0;
      const googleKeywords = (kwRaw?.data || []).map(row => {
        const r = normalizeRow(row);
        const is = parseFloat(r.metrics_search_impression_share);
        return { market: detectMarket(r.campaign_name), campaign: r.campaign_name, text: r.ad_group_criterion_keyword_text || '',
          matchType: titleCase(r.ad_group_criterion_match_type), qualityScore: parseFloat(r.ad_group_criterion_quality_info_quality_score) || null,
          impressionShare: Number.isFinite(is) ? is : null,
          spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), orders: r.orders || 0, revenue: r.revenue || 0 };
      }).filter(r => r.text && keep(r));
      const googleTerms = (gstRaw?.data || []).map(row => {
        const r = normalizeRow(row);
        return { market: detectMarket(r.campaign_name), campaign: r.campaign_name, text: r.search_term_view_search_term || '',
          keyword: r.segments_keyword_info_text || '', matchType: titleCase(r.segments_keyword_info_match_type),
          spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), orders: r.orders || 0, revenue: r.revenue || 0 };
      }).filter(r => r.text && keep(r));
      const amazonTerms = (astRaw?.data || []).map(row => {
        const r = normalizeRow(row);
        const t = String(r.targeting_expression || '').toLowerCase();
        return { market: detectMarket(r.campaign_name), campaign: r.campaign_name, text: r.search_term || '',
          targeting: AMAZON_TARGETING[t] || r.targeting_expression || '',
          spend: num(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), orders: r.orders || 0, revenue: r.revenue || 0 };
      }).filter(r => r.text && keep(r));
      const currency = Object.fromEntries(Object.entries(MARKETS).map(([m, c]) => [m, { google: c.currency.google, amazon: c.currency.amazon || 'SGD' }]));
      return { dateRange: range, currency, google: { keywords: googleKeywords, searchTerms: googleTerms }, amazon: { searchTerms: amazonTerms }, notes };
    }, SEARCH_TTL);
    res.json(result);
  } catch (err) {
    console.error('[search error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trend', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const { platform, campaign, lens = 'brand' } = req.query;
    if (!TREND_METRICS[platform] || !campaign) return res.status(400).json({ error: 'platform and campaign are required' });
    const range = resolveDateRange(req.query);
    const withLpv = req.query.lpv === '1' && TREND_LPV[platform];
    const revKey = lens === 'commerce' && platform === 'meta' ? 'cpas' : platform;
    const withRev = req.query.rev === '1';
    const metrics = [...TREND_BASE, ...(TREND_EXTRA[platform] || []),
      ...(withLpv ? [TREND_LPV[platform]] : []), ...(withRev ? TREND_REVENUE[revKey] : [])];

    const market = detectMarket(campaign);
    const all = lens === 'commerce' && platform === 'meta'
      ? [...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD]
      : ALL_ACCOUNTS[platform];
    const own = lens === 'commerce' && platform === 'meta'
      ? all.filter(a => CPAS_MARKET[a] === market)
      : [ACCOUNTS[platform]?.[market]].filter(Boolean);
    const others = all.filter(a => !own.includes(a));

    const result = await cached(`trend_${lens}_${platform}_${withLpv ? 'lpv' : 'base'}${withRev ? '_rev' : ''}_${campaign}_${range.startDate}_${range.endDate}`, async () => {
      const opts = {
        dimensions: ['date'],
        filters: [{ fieldId: 'campaign_name', operator: 'equals', value: campaign }],
        priority: PRIORITY.user, // the user is waiting on this one
      };
      const hasData = r => (r?.data || []).some(row => parseFloat(row.amount_spent) > 0 || parseFloat(row.ttads_gmv_cost) > 0 || parseFloat(row.impressions) > 0);
      let raw = own.length ? await makeQuery(own, metrics, range, opts) : null;
      // Not in the expected account (e.g. an ID_ campaign run from the SG account): search the rest
      if (!hasData(raw) && others.length) {
        console.log(`[trend] ${campaign} not found in ${own.join(',') || 'no matching account'} — searching ${others.length} other accounts`);
        raw = await makeQuery(others, metrics, range, opts);
      }
      const byDate = new Map();
      for (const row of raw?.data || []) {
        const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/^(ttads|fads|gadw)_/, ''), v]));
        byDate.set(normalizeDate(r.date), {
          spend: parseFloat(r.amount_spent) || parseFloat(r.gmv_cost) || 0,
          impressions: parseFloat(r.impressions) || 0,
          clicks: parseFloat(r.clicks) || 0,
          landing_page_views: parseFloat(r.total_landing_page_view ?? r.website_fb_landing_page_views) || 0,
          ...(withRev ? (({ orders, revenue }) => ({ orders, revenue }))(normalizeRow(row)) : {}),
        });
      }
      // Every day in the range, so days without delivery show as gaps
      const days = [];
      for (let t = Date.parse(range.startDate); t <= Date.parse(range.endDate); t += DAY) {
        const date = isoDay(t);
        days.push({ date, ...(byDate.get(date) || { spend: 0, impressions: 0, clicks: 0, landing_page_views: 0, ...(withRev ? { orders: 0, revenue: 0 } : {}) }) });
      }
      return { campaign, platform, lens, dateRange: range, days, hasLpv: !!withLpv, hasRevenue: withRev };
    });

    res.json(result);
  } catch (err) {
    console.error('[trend error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Commerce Lens: Meta CPAS accounts, fetched only when the tab is opened.
// 2 requests: accounts billed in local currency, then accounts billed in SGD.
// Each market gets one CPAS block per currency so currencies are never summed.
// Commerce monthly trend (Commerce Lens header chart): spend, orders, revenue
// per country per month since COMMERCE_TREND_START, across every commerce
// source, converted to SGD with the FOREX tab so platforms can be added up.
// Ignores the dashboard's date filter. 6 month-level queries (one per source),
// cached for 3 hours.
const COMMERCE_TREND_START = process.env.COMMERCE_TREND_START || '2026-01-01';
const MONTHLY_TTL = 3 * 60 * 60 * 1000;
const MONTH_NUM = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function normalizeMonth(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-([A-Za-z]{3})/);
  if (m) return `${m[1]}-${MONTH_NUM[m[2].toLowerCase()] || '00'}`;
  m = s.match(/^(\d{4})-?(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// Sales Lens: mega-sale periods (9.9, 10.10, 11.11 ...) from Meta CPAS ad names
// for one market since COMMERCE_TREND_START. One daily-by-ad query over that
// market's CPAS accounts, loaded when the tab opens, cached 3 hours, in SGD.
app.get('/api/sales', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const market = String(req.query.market || 'sg').toLowerCase();
    if (!MARKETS[market]) return res.status(400).json({ error: `Unknown market ${market}` });
    const range = { startDate: COMMERCE_TREND_START, endDate: getDateRange(1).endDate };
    const accounts = [...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD].filter(a => CPAS_MARKET[a] === market);

    const tiktokAccount = ACCOUNTS.tiktok[market];

    const result = await cached(`sales_${market}_${range.startDate}_${range.endDate}`, async () => {
      const { fx } = await cached('goal_sheet', loadGoalSheet);
      const notes = [];
      let cpasRows = [], tiktokRows = [];

      // Meta CPAS: sales from the double date in each ad name
      if (accounts.length) {
        try {
          const localCur = MARKETS[market].currency.meta;
          const curOf = new Set(accounts.map(a => (CPAS_ACCOUNTS.SGD.includes(a) ? 'SGD' : localCur)));
          const currency = curOf.size === 1 ? [...curOf][0] : null;
          const rate = currency ? fx[currency] : null;
          if (!rate) throw new Error(currency
            ? `No FOREX rate for ${currency}`
            : `${MARKETS[market].name} CPAS accounts bill in more than one currency, so Meta CPAS is left out here for now`);
          const raw = await makeQuery(accounts,
            ['amount_spent', 'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'], range,
            { dimensions: ['date', 'campaign_name', 'ad_name'], chunk: false, priority: PRIORITY.normal });
          cpasRows = (raw?.data || []).map(row => {
            const r = normalizeRow(row);
            return { date: normalizeDate(r.date), ad_name: r.ad_name, campaign_name: r.campaign_name,
              spend: (parseFloat(r.spend) || 0) * rate, orders: r.orders || 0, revenue: (r.revenue || 0) * rate };
          });
        } catch (err) { notes.push(`Meta CPAS: ${err.message}`); console.error('[sales cpas]', err.message); }
      }

      // TikTok: every GMV Max campaign (any name) on days inside a sale window
      if (tiktokAccount) {
        try {
          const rate = fx[MARKETS[market].currency.tiktok] || 1;
          const raw = await makeQuery([tiktokAccount],
            ['amount_spent', 'ttads_gmv_cost', 'ttads_gmv_orders', 'ttads_gmv_gross_revenue'], range,
            { dimensions: ['date', 'campaign_name'], chunk: false, priority: PRIORITY.normal });
          tiktokRows = (raw?.data || []).map(row => normalizeRow(row))
            .filter(r => parseFloat(r.gmv_cost) > 0 || parseFloat(r.gmv_orders) > 0 || parseFloat(r.gmv_gross_revenue) > 0)
            .map(r => ({ date: normalizeDate(r.date), campaign_name: r.campaign_name,
              spend: (parseFloat(r.spend) || 0) * rate, orders: r.orders || 0, revenue: (r.revenue || 0) * rate }));
        } catch (err) { notes.push(`TikTok: ${err.message}`); console.error('[sales tiktok]', err.message); }
      }

      if (!cpasRows.length && !tiktokRows.length && notes.length) throw new Error(notes.join(' · '));
      return { market, currency: 'SGD', dateRange: range, notes, ...groupSales(cpasRows, tiktokRows) };
    }, MONTHLY_TTL);

    res.json(result);
  } catch (err) {
    console.error('[sales error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/commerce/monthly', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const range = { startDate: COMMERCE_TREND_START, endDate: getDateRange(1).endDate };

    const result = await cached(`commerce_monthly_${range.startDate}_${range.endDate}`, async () => {
      const { fx } = await cached('goal_sheet', loadGoalSheet);
      // Normal priority: queued after the Commerce tables (requested first), but not
      // behind the background goal trend, so the chart appears promptly
      const opts = { dimensions: ['year_month', 'campaign_name'], chunk: false, priority: PRIORITY.normal };
      const sources = [
        { key: 'cpas',   accounts: CPAS_ACCOUNTS.local, metrics: ['amount_spent', 'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'], currency: m => MARKETS[m]?.currency.meta },
        { key: 'cpas',   accounts: CPAS_ACCOUNTS.SGD,   metrics: ['amount_spent', 'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'], currency: () => 'SGD' },
        { key: 'tiktok', accounts: ALL_ACCOUNTS.tiktok, metrics: ['amount_spent', 'ttads_gmv_cost', 'ttads_gmv_orders', 'ttads_gmv_gross_revenue'], currency: () => 'SGD', commerceOnly: true },
        { key: 'meta',   accounts: ALL_ACCOUNTS.meta,   metrics: ['amount_spent', 'fads_all_purchases', 'fads_purchase_conversions_all'], currency: m => MARKETS[m]?.currency.meta, commerceOnly: true },
        { key: 'google', accounts: ALL_ACCOUNTS.google, metrics: ['amount_spent', 'conversions', 'gadw_metrics_conversions_value'], currency: () => 'SGD', commerceOnly: true },
        { key: 'amazon', accounts: AMAZON_ACCOUNTS, metrics: ['amount_spent', 'amazonads_cost', 'amazonads_total_purchases', 'amazonads_total_sales'], currency: m => MARKETS[m]?.currency.amazon },
      ];

      const markets = {};
      // Per campaign per month (SGD), for "ROAS vs previous month" labels:
      // campaignMonths[market][source][campaign][YYYY-MM] = { spend, orders, revenue }
      const campaignMonths = {};
      const missingFx = new Set();
      const errors = [];
      for (const src of sources) {
        let raw;
        try { raw = await withTimeout(makeQuery(src.accounts, src.metrics, range, { ...opts, ...(src.key === 'amazon' ? { split: false } : {}) }), 75000, src.key); }
        catch (err) { errors.push(`${src.key}: ${err.message}`); console.error('[commerce monthly]', src.key, err.message); continue; }
        for (const row of raw?.data || []) {
          const r = normalizeRow(row);
          if (src.commerceOnly && !isCommerceRow(r)) continue;
          const month = normalizeMonth(r.year_month);
          const market = detectMarket(r.campaign_name);
          if (!month || !MARKETS[market]) continue;
          const cur = src.currency(market) || 'SGD';
          const rate = fx[cur];
          if (!rate) { missingFx.add(cur); continue; }
          const spend = (parseFloat(r.spend) || 0) * rate;
          const revenue = (r.revenue || 0) * rate;
          const orders = r.orders || 0;
          if (!spend && !orders && !revenue) continue;
          const mk = (markets[market] ||= {});
          const bucket = (mk[month] ||= { month, spend: 0, orders: 0, revenue: 0, byPlatform: {} });
          const plat = (bucket.byPlatform[src.key] ||= { spend: 0, orders: 0, revenue: 0 });
          bucket.spend += spend; bucket.orders += orders; bucket.revenue += revenue;
          plat.spend += spend; plat.orders += orders; plat.revenue += revenue;
          const cm = ((((campaignMonths[market] ||= {})[src.key] ||= {})[r.campaign_name] ||= {})[month] ||= { spend: 0, orders: 0, revenue: 0 });
          cm.spend += spend; cm.orders += orders; cm.revenue += revenue;
        }
      }

      // Every month from the start to now, so gaps show as empty months
      const months = [];
      for (let d = new Date(`${range.startDate.slice(0, 7)}-01T00:00:00Z`); d <= new Date(`${range.endDate}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1)) {
        months.push(d.toISOString().slice(0, 7));
      }
      const out = {};
      for (const code of Object.keys(MARKETS)) {
        out[code] = months.map(month => {
          const b = markets[code]?.[month] || { month, spend: 0, orders: 0, revenue: 0, byPlatform: {} };
          return { ...b, roas: b.spend > 0 && b.revenue > 0 ? b.revenue / b.spend : null };
        });
      }
      if (errors.length === sources.length) throw new Error(errors[0]);
      return { currency: 'SGD', months, dateRange: range, markets: out, campaignMonths, fx, missingFx: [...missingFx], partialErrors: errors };
    }, MONTHLY_TTL);

    res.json(result);
  } catch (err) {
    console.error('[commerce monthly error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Top ads panel (on demand): ad-level results with creative thumbnails for one
// market and date range. Brand lens: the market's Meta + TikTok brand accounts
// (commerce campaigns left out). Commerce lens: the market's Meta CPAS accounts
// with orders / revenue. Thumbnail links from Meta / TikTok expire after about
// a day, so results are cached for 30 minutes.
const TOP_ADS_TTL = 30 * 60 * 1000;

app.get('/api/top-ads', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const market = String(req.query.market || 'sg').toLowerCase();
    const lens = req.query.lens === 'commerce' ? 'commerce' : 'brand';
    if (!MARKETS[market]) return res.status(400).json({ error: `Unknown market ${market}` });
    const range = resolveDateRange(req.query);

    const result = await cached(`topads_${lens}_${market}_${range.startDate}_${range.endDate}`, async () => {
      const { fx } = await cached('goal_sheet', loadGoalSheet);
      const opts = { priority: PRIORITY.user };
      const sources = lens === 'commerce'
        ? [{
            platform: 'meta', label: 'Meta CPAS',
            accounts: [...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD].filter(a => CPAS_MARKET[a] === market),
            currencyOf: a => (CPAS_ACCOUNTS.SGD.includes(a) ? 'SGD' : MARKETS[market].currency.meta),
            dimensions: ['campaign_name', 'ad_name', 'fads_ad_creative_thumbnail_url', 'fads_ad_preview_shareable_link'],
            metrics: ['amount_spent', 'impressions', 'clicks', 'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'],
          }]
        : [
            { platform: 'meta', label: 'Meta', accounts: [ACCOUNTS.meta[market]].filter(Boolean),
              currencyOf: () => MARKETS[market].currency.meta,
              dimensions: ['campaign_name', 'ad_name', 'fads_ad_creative_thumbnail_url', 'fads_ad_preview_shareable_link'],
              metrics: ['amount_spent', 'impressions', 'clicks', 'fads_website_fb_landing_page_views', 'fads_video_thruplay_watched_actions'] },
            { platform: 'tiktok', label: 'TikTok', accounts: [ACCOUNTS.tiktok[market]].filter(Boolean),
              currencyOf: () => MARKETS[market].currency.tiktok,
              dimensions: ['campaign_name', 'ad_name', 'ttads_video_cover_url'],
              metrics: ['amount_spent', 'impressions', 'clicks', 'ttads_total_landing_page_view', 'ttads_video_watched_6s'] },
          ];

      const ads = [];
      const notes = [];
      for (const src of sources) {
        if (!src.accounts.length) continue;
        // One currency per query: group accounts by billing currency
        const groups = new Map();
        for (const a of src.accounts) groups.set(src.currencyOf(a), [...(groups.get(src.currencyOf(a)) || []), a]);
        for (const [currency, accounts] of groups) {
          try {
            const raw = await makeQuery(accounts, src.metrics, range, { ...opts, dimensions: src.dimensions });
            for (const row of raw?.data || []) {
              const r = normalizeRow(row);
              if (detectMarket(r.campaign_name) !== market) continue;
              if (lens === 'brand' && isCommerceRow(row)) continue;
              const spend = parseFloat(r.spend) || 0;
              if (!(spend > 0)) continue;
              const imp = parseFloat(r.impressions) || 0, clicks = parseFloat(r.clicks) || 0;
              ads.push({
                platform: src.platform, platformLabel: src.label,
                ad: r.ad_name, campaign: r.campaign_name, currency,
                thumbnail: r.ad_creative_thumbnail_url || r.video_cover_url || null,
                previewUrl: r.ad_preview_shareable_link || null,
                spend, spendSgd: fx[currency] ? spend * fx[currency] : null,
                impressions: imp, clicks,
                ctr: imp > 0 ? (clicks / imp) * 100 : null,
                cpm: imp > 0 ? (spend / imp) * 1000 : null,
                orders: r.orders || 0, revenue: r.revenue || 0,
                roas: lens === 'commerce' ? r.roas : null,
                landing_page_views: parseFloat(r.landing_page_views) || 0,
              });
            }
          } catch (err) { notes.push(`${src.label}: ${err.message}`); console.error('[top ads]', src.label, err.message); }
        }
      }
      if (!ads.length && notes.length) throw new Error(notes.join(' · '));
      return { market, lens, dateRange: range, ads, notes };
    }, TOP_ADS_TTL);

    res.json(result);
  } catch (err) {
    console.error('[top ads error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/commerce', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const dateRangeObj = resolveDateRange(req.query);

    const result = await cached(`commerce_${dateRangeObj.startDate}_${dateRangeObj.endDate}`, async () => {
      // All table requests are queued together (CPAS local, CPAS SGD, one per
      // Amazon profile) so they go out ahead of the monthly chart's requests
      const notes = [];
      const [localRaw, sgdRaw, amazonRaw] = await Promise.all([
        makeQuery(CPAS_ACCOUNTS.local, CPAS_METRICS, dateRangeObj),
        makeQuery(CPAS_ACCOUNTS.SGD, CPAS_METRICS, dateRangeObj),
        withTimeout(makeQuery(AMAZON_ACCOUNTS, AMAZON_METRICS, dateRangeObj, { split: false }), 75000, 'Amazon').catch(err => {
          notes.push(`Amazon: ${err.message}`);
          console.error('[commerce amazon]', err.message);
          return null;
        }),
      ]);

      const localSplit = splitByMarket(localRaw);
      const sgdSplit   = splitByMarket(sgdRaw);

      // Amazon: one block per market, in that market's Amazon currency
      const amazonSplit = splitByMarket(amazonRaw);

      const markets = Object.fromEntries(
        Object.entries(MARKETS).map(([code, cfg]) => {
          const byCurrency = new Map();
          const add = (currency, rows) => {
            if (!rows.length) return;
            byCurrency.set(currency, [...(byCurrency.get(currency) || []), ...rows]);
          };
          add(cfg.currency.meta, localSplit[code]);
          add('SGD', sgdSplit[code]);
          const cpas = [...byCurrency.entries()]
            .map(([currency, rows]) => ({ ...parsePlatformResult({ data: rows }), currency }))
            .filter(block => block.campaigns.length > 0);
          const amazonBlock = cfg.currency.amazon && amazonSplit[code]?.length
            ? { ...parsePlatformResult({ data: amazonSplit[code] }), currency: cfg.currency.amazon } : null;
          return [code, { cpas, amazon: amazonBlock?.campaigns.length ? amazonBlock : null, marketName: cfg.name }];
        })
      );

      return { markets, dateRange: dateRangeObj, notes };
    });

    res.json(result);
  } catch (err) {
    console.error('[commerce error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

const distPath = join(__dirname, '../frontend/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

// Log unexpected errors instead of letting them stop the server (a stopped
// server shows up as HTTP 502 from the hosting gateway)
process.on('unhandledRejection', err => console.error('[unhandled rejection]', err?.message || err));
process.on('uncaughtException', err => console.error('[uncaught exception]', err?.message || err));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
