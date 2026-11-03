import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { TEAM_ID, MARKETS, ALL_ACCOUNTS, CPAS_ACCOUNTS, isSalesCampaign, queryTMR, parsePlatformResult, splitByMarket, getDateRange } from './tmr.js';

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
  if (Date.now() - e.ts > CACHE_TTL) { dashCache.delete(key); return null; }
  return e;
}

// Cache results for CACHE_TTL and share one in-flight fetch between callers
async function cached(key, fetchFn) {
  const hit = getCached(key);
  if (hit?.data)    return hit.data;
  if (hit?.promise) return hit.promise;
  const promise = fetchFn();
  dashCache.set(key, { ts: Date.now(), promise, data: null });
  try {
    const data = await promise;
    dashCache.set(key, { ts: Date.now(), data, promise: null });
    return data;
  } catch (err) {
    dashCache.delete(key);
    throw err;
  }
}

function resolveDateRange(query) {
  const { dateRange: drParam = '7', startDate, endDate } = query;
  if (drParam === 'custom' && startDate && endDate) return { startDate, endDate };
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

const META_METRICS = ['amount_spent', 'impressions', 'clicks', 'reach', 'video_views'];

function requireKey(res) {
  if (TMR_API_KEY) return true;
  res.status(500).json({ error: 'TMR_API_KEY not set in .env — add TMR_API_KEY=your_key' });
  return false;
}

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));


// Brand Lens: non-CPAS accounts. Campaigns named "Sales" are split out into
// `sales` so Commerce Lens can show them without another TMR request.
app.get('/api/dashboard', async (req, res) => {
  try {
    if (!requireKey(res)) return;
    const dateRangeObj = resolveDateRange(req.query);

    const result = await cached(`brand_${dateRangeObj.startDate}_${dateRangeObj.endDate}`, async () => {
      // 3 requests total — one per platform, all markets combined (queued in tmr.js)
      const ttRaw     = await makeQuery(ALL_ACCOUNTS.tiktok, ['amount_spent', 'impressions', 'clicks', 'video_play_actions', 'reach'], dateRangeObj);
      const metaRaw   = await makeQuery(ALL_ACCOUNTS.meta, META_METRICS, dateRangeObj);
      const googleRaw = await makeQuery(ALL_ACCOUNTS.google, ['amount_spent', 'impressions', 'clicks'], dateRangeObj);

      // Split each platform's rows into per-market buckets
      const split = { tiktok: splitByMarket(ttRaw), meta: splitByMarket(metaRaw), google: splitByMarket(googleRaw) };

      const markets = Object.fromEntries(
        Object.entries(MARKETS).map(([code, cfg]) => {
          const brand = {}, sales = {};
          for (const platform of ['tiktok', 'meta', 'google']) {
            const rows = split[platform][code];
            const currency = cfg.currency[platform];
            brand[platform] = { ...parsePlatformResult({ data: rows.filter(r => !isSalesCampaign(r.campaign_name)) }), currency };
            sales[platform] = { ...parsePlatformResult({ data: rows.filter(r =>  isSalesCampaign(r.campaign_name)) }), currency };
          }
          return [code, { ...brand, sales, marketName: cfg.name }];
        })
      );

      return { markets, dateRange: dateRangeObj };
    });

    res.json(result);
  } catch (err) {
    console.error('[dashboard error]', err.message);
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
