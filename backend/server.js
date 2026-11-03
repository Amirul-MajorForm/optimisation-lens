import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { TEAM_ID, MARKETS, ALL_ACCOUNTS, queryTMR, parsePlatformResult, splitByMarket, getDateRange } from './tmr.js';

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

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));


app.get('/api/dashboard', async (req, res) => {
  try {
    if (!TMR_API_KEY) {
      return res.status(500).json({ error: 'TMR_API_KEY not set in .env — add TMR_API_KEY=your_key' });
    }

    const { dateRange: drParam = '7', startDate, endDate } = req.query;

    let dateRangeObj;
    if (drParam === 'custom' && startDate && endDate) {
      dateRangeObj = { startDate, endDate };
    } else {
      const days = Math.min(Math.max(parseInt(drParam) || 7, 1), 365);
      dateRangeObj = getDateRange(days);
    }

    const cacheKey = `all_${dateRangeObj.startDate}_${dateRangeObj.endDate}`;
    const cached = getCached(cacheKey);
    if (cached?.data)    return res.json(cached.data);
    if (cached?.promise) return res.json(await cached.promise);

    const makeQuery = (accounts, metrics) => queryTMR(TMR_API_KEY, TEAM_ID, {
      accounts,
      dimensions: ['campaign_name'],
      metrics,
      dateRange: dateRangeObj,
      sort: [{ fieldId: 'amount_spent', direction: 'desc' }],
    });

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const fetchPromise = (async () => {
      // 3 requests total — one per platform, all markets combined
      const ttRaw     = await makeQuery(ALL_ACCOUNTS.tiktok, ['amount_spent', 'impressions', 'clicks', 'video_play_actions', 'reach']);
      await sleep(1500);
      const metaRaw   = await makeQuery(ALL_ACCOUNTS.meta,   ['amount_spent', 'impressions', 'clicks', 'reach', 'video_views']);
      await sleep(1500);
      const googleRaw = await makeQuery(ALL_ACCOUNTS.google, ['amount_spent', 'impressions', 'clicks']);

      // Split each platform's rows into per-market buckets
      const ttSplit     = splitByMarket(ttRaw);
      const metaSplit   = splitByMarket(metaRaw);
      const googleSplit = splitByMarket(googleRaw);

      const markets = Object.fromEntries(
        Object.entries(MARKETS).map(([code, cfg]) => [code, {
          tiktok: parsePlatformResult({ data: ttSplit[code] }),
          meta:   parsePlatformResult({ data: metaSplit[code] }),
          google: parsePlatformResult({ data: googleSplit[code] }),
          marketName: cfg.name,
        }])
      );

      return { markets, dateRange: dateRangeObj };
    })();

    dashCache.set(cacheKey, { ts: Date.now(), promise: fetchPromise, data: null });
    const result = await fetchPromise;
    dashCache.set(cacheKey, { ts: Date.now(), data: result, promise: null });

    res.json(result);
  } catch (err) {
    console.error('[dashboard error]', err.message);
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
