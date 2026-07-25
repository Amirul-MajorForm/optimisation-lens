import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fetchSheet } from './sheets.js';
import { aggregateData, getClientConfig, getDateRange, getDateRangeFromStrings } from './aggregator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

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

// Serve built frontend in production
const distPath = join(__dirname, '../frontend/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
