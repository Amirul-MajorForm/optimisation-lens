import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { loadGoalSheet, scoreGoals, previousRange } from './goals.js';
import { normalizeRow } from './tmr.js';
import { groupSales } from './sales.js';
import { PRIORITY, CPAS_MARKET, detectMarket, TEAM_ID, MARKETS, ACCOUNTS, ALL_ACCOUNTS, CPAS_ACCOUNTS, isCommerceCampaign, queryTMR, parsePlatformResult, splitByMarket, getDateRange } from './tmr.js';

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
const isoDay = t => new Date(t).toISOString().slice(0, 10);

// Sum rows that share the same dimension values (results of split queries). All
// metrics we request are additive except reach, which is slightly overstated
// when a single campaign's date range had to be split.
const DIMENSION_KEYS = ['campaign_name', 'date', 'year_month', 'ad_name'];
function mergeRows(...results) {
  const byName = new Map();
  for (const r of results.flatMap(x => x?.data || [])) {
    const key = `${r.campaign_name ?? ''}|${r.date ?? ''}|${r.year_month ?? ''}|${r.ad_name ?? ''}`;
    const prev = byName.get(key);
    if (!prev) { byName.set(key, { ...r }); continue; }
    for (const [k, v] of Object.entries(r)) {
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
      return makeQuerySplit(accounts, swap(metrics), dateRange, { ...opts, dimensions: swap(opts.dimensions), suggested: true });
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
const META_METRICS   = ['amount_spent', 'impressions', 'clicks', 'fads_reach', 'fads_video_views', 'fads_website_fb_landing_page_views',
                        'fads_all_purchases', 'fads_purchase_conversions_all', 'fads_video_thruplay_watched_actions'];
const TIKTOK_METRICS = ['amount_spent', 'impressions', 'clicks', 'ttads_video_play_actions', 'ttads_reach', 'ttads_total_landing_page_view',
                        'ttads_gmv_cost', 'ttads_gmv_orders', 'ttads_gmv_gross_revenue'];
const GOOGLE_METRICS = ['amount_spent', 'impressions', 'clicks', 'conversions', 'gadw_metrics_conversions_value'];
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
          brand[platform] = { ...parsePlatformResult({ data: rows.filter(r => !isCommerceCampaign(r.campaign_name)) }), currency };
          commerceCampaigns[platform] = { ...parsePlatformResult({ data: rows.filter(r =>  isCommerceCampaign(r.campaign_name)) }), currency };
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

// TMR may return dates as 2026-10-01, 20261001 or a full timestamp
function normalizeDate(v) {
  const s = String(v ?? '');
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

app.get('/api/trend', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const { platform, campaign, lens = 'brand' } = req.query;
    if (!TREND_METRICS[platform] || !campaign) return res.status(400).json({ error: 'platform and campaign are required' });
    const range = resolveDateRange(req.query);
    const withLpv = req.query.lpv === '1' && TREND_LPV[platform];
    const metrics = [...TREND_BASE, ...(TREND_EXTRA[platform] || []), ...(withLpv ? [TREND_LPV[platform]] : [])];

    const market = detectMarket(campaign);
    const all = lens === 'commerce' && platform === 'meta'
      ? [...CPAS_ACCOUNTS.local, ...CPAS_ACCOUNTS.SGD]
      : ALL_ACCOUNTS[platform];
    const own = lens === 'commerce' && platform === 'meta'
      ? all.filter(a => CPAS_MARKET[a] === market)
      : [ACCOUNTS[platform]?.[market]].filter(Boolean);
    const others = all.filter(a => !own.includes(a));

    const result = await cached(`trend_${lens}_${platform}_${withLpv ? 'lpv' : 'base'}_${campaign}_${range.startDate}_${range.endDate}`, async () => {
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
        });
      }
      // Every day in the range, so days without delivery show as gaps
      const days = [];
      for (let t = Date.parse(range.startDate); t <= Date.parse(range.endDate); t += DAY) {
        const date = isoDay(t);
        days.push({ date, ...(byDate.get(date) || { spend: 0, impressions: 0, clicks: 0, landing_page_views: 0 }) });
      }
      return { campaign, platform, lens, dateRange: range, days, hasLpv: !!withLpv };
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
// Ignores the dashboard's date filter. 5 month-level queries (one per source),
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

    const result = await cached(`sales_${market}_${range.startDate}_${range.endDate}`, async () => {
      if (!accounts.length) return { market, currency: 'SGD', dateRange: range, sales: [], notSale: [] };
      const { fx } = await cached('goal_sheet', loadGoalSheet);
      const raw = await makeQuery(accounts,
        ['amount_spent', 'fads_collab_action_omni_purchase', 'fads_collab_ads_value_omni_purchase'], range,
        { dimensions: ['date', 'campaign_name', 'ad_name'], chunk: false, priority: PRIORITY.normal });

      // Without account ids per row, take the currency from the account group:
      // if all of the market's CPAS accounts bill the same way, use that.
      const localCur = MARKETS[market].currency.meta;
      const curOf = new Set(accounts.map(a => (CPAS_ACCOUNTS.SGD.includes(a) ? 'SGD' : localCur)));
      const currency = curOf.size === 1 ? [...curOf][0] : null;
      const rate = currency ? fx[currency] : null;
      if (!rate) throw new Error(currency
        ? `No FOREX rate for ${currency}`
        : `${MARKETS[market].name} CPAS accounts bill in more than one currency; Sales Lens supports one currency per market for now`);

      const rows = (raw?.data || []).map(row => {
        const r = normalizeRow(row);
        return {
          date: normalizeDate(r.date), ad_name: r.ad_name, campaign_name: r.campaign_name,
          spend: (parseFloat(r.spend) || 0) * rate, orders: r.orders || 0, revenue: (r.revenue || 0) * rate,
        };
      });
      return { market, currency: 'SGD', sourceCurrency: currency, dateRange: range, ...groupSales(rows) };
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
      ];

      const markets = {};
      const missingFx = new Set();
      const errors = [];
      for (const src of sources) {
        let raw;
        try { raw = await makeQuery(src.accounts, src.metrics, range, opts); }
        catch (err) { errors.push(`${src.key}: ${err.message}`); console.error('[commerce monthly]', src.key, err.message); continue; }
        for (const row of raw?.data || []) {
          const r = normalizeRow(row);
          if (src.commerceOnly && !isCommerceCampaign(r.campaign_name)) continue;
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
      return { currency: 'SGD', months, dateRange: range, markets: out, missingFx: [...missingFx], partialErrors: errors };
    }, MONTHLY_TTL);

    res.json(result);
  } catch (err) {
    console.error('[commerce monthly error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/commerce', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const dateRangeObj = resolveDateRange(req.query);

    const result = await cached(`commerce_${dateRangeObj.startDate}_${dateRangeObj.endDate}`, async () => {
      const localRaw = await makeQuery(CPAS_ACCOUNTS.local, CPAS_METRICS, dateRangeObj);
      const sgdRaw   = await makeQuery(CPAS_ACCOUNTS.SGD, CPAS_METRICS, dateRangeObj);

      const localSplit = splitByMarket(localRaw);
      const sgdSplit   = splitByMarket(sgdRaw);

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
          return [code, { cpas, marketName: cfg.name }];
        })
      );

      return { markets, dateRange: dateRangeObj };
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
