import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fetchSheet } from './sheets.js';
import { aggregateData, getClientConfig, getDateRange, getDateRangeFromStrings } from './aggregator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GOOGLE_API_KEY;

const DATA_DIR = join(__dirname, 'data');
const STYLE_REFS_FILE = join(DATA_DIR, 'style-refs.json');

function loadStyleRefs() {
  if (!existsSync(STYLE_REFS_FILE)) return {};
  try { return JSON.parse(readFileSync(STYLE_REFS_FILE, 'utf8')); } catch { return {}; }
}

function saveStyleRefs(refs) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STYLE_REFS_FILE, JSON.stringify(refs, null, 2));
}

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/style-ref', (req, res) => {
  const { client } = req.query;
  if (!client) return res.status(400).json({ error: 'client is required' });
  const refs = loadStyleRefs();
  res.json({ text: refs[client] || '' });
});

app.post('/api/style-ref', (req, res) => {
  const { client, text } = req.body;
  if (!client) return res.status(400).json({ error: 'client is required' });
  const refs = loadStyleRefs();
  refs[client] = text || '';
  saveStyleRefs(refs);
  res.json({ ok: true });
});

app.post('/api/ai', async (req, res) => {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });

  const { prompt, maxTokens = 1024 } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err.error?.message || `Anthropic error ${r.status}` });
    }

    const json = await r.json();
    res.json({ text: json.content[0].text });
  } catch (err) {
    console.error('[ai error]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const { client = 'ym-sg', dateRange: drParam = '7', startDate, endDate } = req.query;

    const config = getClientConfig(client);
    if (!config) return res.status(400).json({ error: `Unknown client: ${client}` });

    let dateRange;
    if (drParam === 'custom' && startDate && endDate) {
      dateRange = getDateRangeFromStrings(startDate, endDate);
    } else {
      const days = Math.min(Math.max(parseInt(drParam) || 7, 1), 365);
      dateRange = getDateRange(days);
    }

    const [metaRows, searchRows, convRows] = await Promise.all([
      fetchSheet(API_KEY, config.metaSheet),
      config.searchSheet ? fetchSheet(API_KEY, config.searchSheet) : Promise.resolve([]),
      config.conversionsSheet ? fetchSheet(API_KEY, config.conversionsSheet) : Promise.resolve([]),
    ]);

    const result = aggregateData(
      metaRows, searchRows, convRows,
      client,
      null,
      dateRange,
    );

    res.json(result);
  } catch (err) {
    console.error('[dashboard error]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search-deepdive', async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });

    const { client = 'ym-sg', dateRange: drParam = '7', startDate, endDate } = req.query;

    // Only YM clients have search deepdive data
    const clientFilter = {
      'ym-sg': (campaign) => !/\bHK\b/i.test(campaign) && !/hong[\s-]kong/i.test(campaign),
      'ym-hk': (campaign) => /\bHK\b/i.test(campaign) || /hong[\s-]kong/i.test(campaign),
    }[client];

    if (!clientFilter) return res.json({ queries: [], campaigns: [], summary: null });

    let dateRange;
    if (drParam === 'custom' && startDate && endDate) {
      dateRange = getDateRangeFromStrings(startDate, endDate);
    } else {
      const days = Math.min(Math.max(parseInt(drParam) || 7, 1), 365);
      dateRange = getDateRange(days);
    }

    const rows = await fetchSheet(API_KEY, 'YM - Google Search Deepdive');
    if (rows.length < 2) return res.json({ queries: [], campaigns: [], summary: null });

    const headers = rows[0].map(h => String(h ?? '').trim().toLowerCase());
    const dataRows = rows.slice(1);

    function findCol(...terms) {
      for (const term of terms) {
        const i = headers.findIndex(h => h.includes(term));
        if (i >= 0) return i;
      }
      return -1;
    }

    const cols = {
      date: findCol('date'),
      campaign: findCol('campaign'),
      adGroup: findCol('ad group', 'adgroup'),
      query: findCol('search term', 'search query', 'query'),
      keyword: findCol('keyword'),
      matchType: findCol('match type'),
      impressions: findCol('impression'),
      clicks: findCol('click'),
      spend: findCol('cost', 'spend'),
      conversions: findCol('conv.', 'conversion'),
      impressionShare: findCol('search impr. share', 'search impression share', 'impr. share'),
      lostBudget: findCol('lost is (budget)', 'lost budget', 'budget lost'),
      lostRank: findCol('lost is (rank)', 'lost rank', 'rank lost'),
    };

    function parseNum(v) {
      if (v === null || v === undefined || v === '') return 0;
      const s = String(v).replace(/[%,\s]/g, '');
      const num = parseFloat(s);
      return isNaN(num) ? 0 : num;
    }

    function parseRowDate(v) {
      if (typeof v === 'number' && v > 43000 && v < 49000) return v;
      if (typeof v === 'string' && v) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 86400000) + 25569;
      }
      return null;
    }

    const structured = [];
    for (const row of dataRows) {
      if (cols.date >= 0) {
        const serial = parseRowDate(row[cols.date]);
        if (!serial || serial < dateRange.start || serial > dateRange.end) continue;
      }
      const campaign = cols.campaign >= 0 ? String(row[cols.campaign] ?? '').trim() : '';
      if (campaign && !clientFilter(campaign)) continue;

      structured.push({
        campaign,
        adGroup: cols.adGroup >= 0 ? String(row[cols.adGroup] ?? '').trim() : '',
        query: cols.query >= 0
          ? String(row[cols.query] ?? '').trim()
          : (cols.keyword >= 0 ? String(row[cols.keyword] ?? '').trim() : ''),
        matchType: cols.matchType >= 0 ? String(row[cols.matchType] ?? '').trim() : '',
        impressions: parseNum(cols.impressions >= 0 ? row[cols.impressions] : 0),
        clicks: parseNum(cols.clicks >= 0 ? row[cols.clicks] : 0),
        spend: parseNum(cols.spend >= 0 ? row[cols.spend] : 0),
        conversions: parseNum(cols.conversions >= 0 ? row[cols.conversions] : 0),
        impressionShare: cols.impressionShare >= 0 ? parseNum(row[cols.impressionShare]) : null,
        lostBudget: cols.lostBudget >= 0 ? parseNum(row[cols.lostBudget]) : null,
        lostRank: cols.lostRank >= 0 ? parseNum(row[cols.lostRank]) : null,
      });
    }

    // Aggregate by search query
    const queryMap = new Map();
    const campaignMap = new Map();

    for (const r of structured) {
      const qKey = r.query || `[${r.adGroup || r.campaign}]`;
      if (!queryMap.has(qKey)) {
        queryMap.set(qKey, { query: r.query || qKey, campaign: r.campaign, adGroup: r.adGroup, matchType: r.matchType, impressions: 0, clicks: 0, spend: 0, conversions: 0 });
      }
      const q = queryMap.get(qKey);
      q.impressions += r.impressions;
      q.clicks += r.clicks;
      q.spend += r.spend;
      q.conversions += r.conversions;

      const cKey = r.campaign || '(unknown)';
      if (!campaignMap.has(cKey)) {
        campaignMap.set(cKey, { campaign: cKey, impressions: 0, clicks: 0, spend: 0, conversions: 0, isSum: 0, isCount: 0 });
      }
      const c = campaignMap.get(cKey);
      c.impressions += r.impressions;
      c.clicks += r.clicks;
      c.spend += r.spend;
      c.conversions += r.conversions;
      if (r.impressionShare !== null) { c.isSum += r.impressionShare; c.isCount++; }
    }

    const queries = Array.from(queryMap.values())
      .map(q => ({
        ...q,
        ctr: q.impressions > 0 ? (q.clicks / q.impressions) * 100 : 0,
        cpc: q.clicks > 0 ? q.spend / q.clicks : 0,
        convRate: q.clicks > 0 ? (q.conversions / q.clicks) * 100 : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions);

    const campaigns = Array.from(campaignMap.values())
      .map(c => ({
        campaign: c.campaign,
        impressions: c.impressions,
        clicks: c.clicks,
        spend: c.spend,
        conversions: c.conversions,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
        impressionShare: c.isCount > 0 ? c.isSum / c.isCount : null,
      }))
      .sort((a, b) => b.impressions - a.impressions);

    const summary = structured.reduce(
      (acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, spend: acc.spend + r.spend, conversions: acc.conversions + r.conversions }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 }
    );
    summary.ctr = summary.impressions > 0 ? (summary.clicks / summary.impressions) * 100 : 0;
    summary.cpc = summary.clicks > 0 ? summary.spend / summary.clicks : 0;

    const hasImpressionShare = cols.impressionShare >= 0;

    res.json({ queries, campaigns, summary, hasImpressionShare });
  } catch (err) {
    console.error('[search-deepdive error]', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend in production
const distPath = join(__dirname, '../frontend/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
