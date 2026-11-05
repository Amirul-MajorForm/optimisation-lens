import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { loadGoalSheet, scoreGoals, previousRange } from './goals.js';
import { TEAM_ID, MARKETS, ALL_ACCOUNTS, CPAS_ACCOUNTS, isCommerceCampaign, queryTMR, parsePlatformResult, splitByMarket, getDateRange } from './tmr.js';

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

const makeQuery = (accounts, metrics, dateRange) => queryTMR(TMR_API_KEY, TEAM_ID, {
  accounts,
  dimensions: ['campaign_name'],
  metrics,
  dateRange,
  sort: [{ fieldId: 'amount_spent', direction: 'desc' }],
});

// TMR field ids: amount_spent, impressions and clicks are common fields shared by
// every connector; platform-specific fields must carry the connector prefix
// (e.g. ttads_video_play_actions). parsePlatformResult strips the prefix again.
// Landing page views and quality video views feed goal tracking (CPLV, CPV).
const META_METRICS   = ['amount_spent', 'impressions', 'clicks', 'fads_reach', 'fads_video_views',
                        'fads_website_fb_landing_page_views', 'fads_video_thruplay_watched_actions'];
const TIKTOK_METRICS = ['amount_spent', 'impressions', 'clicks', 'ttads_video_play_actions', 'ttads_reach',
                        'ttads_total_landing_page_view', 'ttads_video_watched_6s'];
const GOOGLE_METRICS = ['amount_spent', 'impressions', 'clicks'];

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
// against the selected range. Without ?trend=1 it only needs the current-period
// brand data (shared with /api/dashboard), so it returns as soon as the tables
// can. With ?trend=1 it also fetches the equal-length previous period
// (3 more TMR requests, cached for an hour since that data is historical).
const PREVIOUS_PERIOD_TTL = 60 * 60 * 1000;

app.get('/api/goals', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const range = resolveDateRange(req.query);
    const prevRange = previousRange(range);
    const withTrend = req.query.trend === '1';

    const [sheet, current] = await Promise.all([cached('goal_sheet', loadGoalSheet), fetchBrand(range)]);

    let previous = null, previousError = null;
    if (withTrend) {
      // Previous period is only for the trend; goals still show if it fails
      try { previous = await fetchBrand(prevRange, PREVIOUS_PERIOD_TTL); }
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

// Commerce Lens: Meta CPAS accounts, fetched only when the tab is opened.
// 2 requests: accounts billed in local currency, then accounts billed in SGD.
// Each market gets one CPAS block per currency so currencies are never summed.
app.get('/api/commerce', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const dateRangeObj = resolveDateRange(req.query);

    const result = await cached(`commerce_${dateRangeObj.startDate}_${dateRangeObj.endDate}`, async () => {
      const localRaw = await makeQuery(CPAS_ACCOUNTS.local, META_METRICS, dateRangeObj);
      const sgdRaw   = await makeQuery(CPAS_ACCOUNTS.SGD, META_METRICS, dateRangeObj);

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
