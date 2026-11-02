import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { OATSIDE, queryTMR, parsePlatformResult, getDateRange } from './tmr.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const TMR_API_KEY = process.env.TMR_API_KEY;

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
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

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
    res.status(500).json({ error: err.message });
  }
});

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

    const { teamId, accounts } = OATSIDE;

    const [ttData, metaData, googleData] = await Promise.all([
      queryTMR(TMR_API_KEY, teamId, {
        accounts: [accounts.tiktok],
        dimensions: ['campaign_name'],
        metrics: ['amount_spent', 'impressions', 'clicks', 'video_play_actions', 'reach'],
        dateRange: dateRangeObj,
        sort: [{ fieldId: 'amount_spent', direction: 'desc' }],
      }),
      queryTMR(TMR_API_KEY, teamId, {
        accounts: [accounts.meta],
        dimensions: ['campaign_name'],
        metrics: ['amount_spent', 'impressions', 'clicks', 'reach', 'video_views'],
        dateRange: dateRangeObj,
        sort: [{ fieldId: 'amount_spent', direction: 'desc' }],
      }),
      queryTMR(TMR_API_KEY, teamId, {
        accounts: [accounts.google],
        dimensions: ['campaign_name'],
        metrics: ['amount_spent', 'impressions', 'clicks'],
        dateRange: dateRangeObj,
        sort: [{ fieldId: 'amount_spent', direction: 'desc' }],
      }),
    ]);

    res.json({
      tiktok: parsePlatformResult(ttData),
      meta:   parsePlatformResult(metaData),
      google: parsePlatformResult(googleData),
      dateRange: dateRangeObj,
    });
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
