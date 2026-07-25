import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchSheet } from './sheets.js';
import { aggregateData, getClientConfig, getDateRange } from './aggregator.js';

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.GOOGLE_API_KEY;

app.use(cors());
app.use(express.json());

app.get('/api/dashboard', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'GOOGLE_API_KEY not configured' });
    }

    const { client = 'ym-sg', dateRange: drParam = '7', campaignGroup } = req.query;
    const days = Math.min(Math.max(parseInt(drParam) || 7, 1), 90);

    const config = getClientConfig(client);
    if (!config) return res.status(400).json({ error: `Unknown client: ${client}` });

    const dateRange = getDateRange(days);

    const [metaRows, searchRows, convRows] = await Promise.all([
      fetchSheet(API_KEY, config.metaSheet),
      config.searchSheet ? fetchSheet(API_KEY, config.searchSheet) : Promise.resolve([]),
      config.conversionsSheet ? fetchSheet(API_KEY, config.conversionsSheet) : Promise.resolve([]),
    ]);

    const result = aggregateData(
      metaRows, searchRows, convRows,
      client,
      campaignGroup || null,
      dateRange,
    );

    res.json(result);
  } catch (err) {
    console.error('[dashboard error]', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
