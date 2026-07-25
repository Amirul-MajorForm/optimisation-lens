// Column indices are 0-based, per spec
const YM_META = {
  date: 1, campaign: 3, adset: 4, ad: 5,
  spend: 8, cpm: 9, ctr: 11, leads: 12,
  lpv: 14, clicks: 18, impressions: 20,
};

const STRONG_META = {
  date: 1, campaign: 3, adset: 4, ad: 5,
  spend: 8, impressions: 9, cpm: 10, clicks: 11,
  ctr: 13, leads: 14, lpv: 16,
};

const SEARCH_IS = { date: 2, campaign: 3, spend: 5, impressions: 6, clicks: 7, conversions: 8, ctr: 11 };
const CONVERSIONS = { date: 2, campaign: 3, conversions: 7 };

const CLIENT_CONFIG = {
  'ym-sg': {
    metaSheet: 'YM - Meta',
    metaCols: YM_META,
    metaFilter: (n) => n.startsWith('SG_'),
    searchSheet: 'YM - GoogleAds Search IS',
    conversionsSheet: 'YM - Google Conversions',
    googleFilter: (n) => ['SG_', 'Free Class', 'Starter Classes', 'Website traffic'].some(p => n.startsWith(p)),
    hasCampaignGroups: true,
  },
  'ym-hk': {
    metaSheet: 'YM - Meta',
    metaCols: YM_META,
    metaFilter: (n) => ['HK_', 'IYD_', 'FreeClass_', 'Mats and Matcha'].some(p => n.startsWith(p)),
    searchSheet: 'YM - GoogleAds Search IS',
    conversionsSheet: 'YM - Google Conversions',
    googleFilter: (n) => ['HK_', '2025 - Always On - Hong Kong'].some(p => n.startsWith(p)),
    hasCampaignGroups: false,
  },
  'strong': {
    metaSheet: 'Strong - Meta',
    metaCols: STRONG_META,
    metaFilter: () => true,
    searchSheet: null,
    conversionsSheet: null,
    googleFilter: null,
    hasCampaignGroups: false,
  },
};

const CAMPAIGN_GROUPS = {
  'ym-singapore': (name) =>
    name.startsWith('SG_') && !/(ACADEMY|YMTT|TEACHER\s*TRAINING)/i.test(name),
  'ym-academy': (name) =>
    /(ACADEMY|YMTT|TEACHER\s*TRAINING)/i.test(name),
};

function serialToDateStr(serial) {
  return new Date((serial - 25569) * 86400 * 1000).toISOString().slice(0, 10);
}

function isValidSerial(v) {
  return typeof v === 'number' && v > 43000 && v < 49000;
}

function n(v) {
  const num = Number(v);
  return isNaN(num) ? 0 : num;
}

export function getDateRange(days) {
  const todaySerial = Math.floor(Date.now() / 86400000) + 25569;
  return { start: todaySerial - days + 1, end: todaySerial };
}

export function getClientConfig(clientId) {
  return CLIENT_CONFIG[clientId] ?? null;
}

// Parse + deduplicate Meta rows up to (date, campaign, adset, ad) level
function parseMeta(rows, cols, campaignFilter, dateRange) {
  const map = new Map();
  for (const row of rows) {
    const serial = row[cols.date];
    if (!isValidSerial(serial)) continue;
    if (serial < dateRange.start || serial > dateRange.end) continue;

    const campaign = String(row[cols.campaign] ?? '').trim();
    if (!campaign || !campaignFilter(campaign)) continue;

    const adset = String(row[cols.adset] ?? '').trim();
    const ad = String(row[cols.ad] ?? '').trim();
    const dateStr = serialToDateStr(serial);
    const key = `${dateStr}||${campaign}||${adset}||${ad}`;

    if (!map.has(key)) {
      map.set(key, { dateStr, campaign, adset, ad, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 });
    }
    const agg = map.get(key);
    agg.spend += n(row[cols.spend]);
    agg.clicks += n(row[cols.clicks]);
    agg.impressions += n(row[cols.impressions]);
    agg.leads += n(row[cols.leads]);
    agg.lpv += n(row[cols.lpv]);
  }
  return Array.from(map.values());
}

// Parse Google Search IS + Conversions, merged by (date, campaign)
function parseGoogle(searchRows, convRows, googleFilter, dateRange) {
  const searchMap = new Map();
  for (const row of searchRows) {
    const serial = row[SEARCH_IS.date];
    if (!isValidSerial(serial)) continue;
    if (serial < dateRange.start || serial > dateRange.end) continue;
    const campaign = String(row[SEARCH_IS.campaign] ?? '').trim();
    if (!campaign || !googleFilter(campaign)) continue;
    const dateStr = serialToDateStr(serial);
    const key = `${dateStr}||${campaign}`;
    if (!searchMap.has(key)) {
      searchMap.set(key, { dateStr, campaign, spend: 0, impressions: 0, clicks: 0 });
    }
    const agg = searchMap.get(key);
    agg.spend += n(row[SEARCH_IS.spend]);
    agg.impressions += n(row[SEARCH_IS.impressions]);
    agg.clicks += n(row[SEARCH_IS.clicks]);
  }

  const convMap = new Map();
  for (const row of convRows) {
    const serial = row[CONVERSIONS.date];
    if (!isValidSerial(serial)) continue;
    if (serial < dateRange.start || serial > dateRange.end) continue;
    const campaign = String(row[CONVERSIONS.campaign] ?? '').trim();
    if (!campaign || !googleFilter(campaign)) continue;
    const dateStr = serialToDateStr(serial);
    const key = `${dateStr}||${campaign}`;
    convMap.set(key, (convMap.get(key) ?? 0) + n(row[CONVERSIONS.conversions]));
  }

  return Array.from(searchMap.entries()).map(([key, s]) => ({
    dateStr: s.dateStr,
    campaign: s.campaign,
    spend: s.spend,
    impressions: s.impressions,
    clicks: s.clicks,
    conversions: convMap.get(key) ?? 0,
  }));
}

function rollUpMetaCampaigns(adRows) {
  const campMap = new Map();
  for (const row of adRows) {
    if (!campMap.has(row.campaign)) {
      campMap.set(row.campaign, { name: row.campaign, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0, adMap: new Map() });
    }
    const c = campMap.get(row.campaign);
    c.spend += row.spend;
    c.clicks += row.clicks;
    c.impressions += row.impressions;
    c.leads += row.leads;
    c.lpv += row.lpv;

    const adKey = `${row.adset}||${row.ad}`;
    if (!c.adMap.has(adKey)) {
      c.adMap.set(adKey, { adset: row.adset, ad: row.ad, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 });
    }
    const a = c.adMap.get(adKey);
    a.spend += row.spend;
    a.clicks += row.clicks;
    a.impressions += row.impressions;
    a.leads += row.leads;
    a.lpv += row.lpv;
  }

  return Array.from(campMap.values()).map(c => ({
    name: c.name,
    spend: c.spend, clicks: c.clicks, impressions: c.impressions, leads: c.leads, lpv: c.lpv,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
    cpl: c.leads > 0 ? c.spend / c.leads : 0,
    ads: Array.from(c.adMap.values()).map(a => ({
      adset: a.adset, ad: a.ad,
      spend: a.spend, clicks: a.clicks, impressions: a.impressions, leads: a.leads, lpv: a.lpv,
      ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0,
      cpl: a.leads > 0 ? a.spend / a.leads : 0,
    })).sort((a, b) => b.spend - a.spend),
  })).sort((a, b) => b.spend - a.spend);
}

function rollUpGoogleCampaigns(rows) {
  const campMap = new Map();
  for (const row of rows) {
    if (!campMap.has(row.campaign)) {
      campMap.set(row.campaign, { name: row.campaign, spend: 0, clicks: 0, impressions: 0, conversions: 0 });
    }
    const c = campMap.get(row.campaign);
    c.spend += row.spend;
    c.clicks += row.clicks;
    c.impressions += row.impressions;
    c.conversions += row.conversions;
  }
  return Array.from(campMap.values()).map(c => ({
    ...c,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    cpl: c.conversions > 0 ? c.spend / c.conversions : 0,
  })).sort((a, b) => b.spend - a.spend);
}

function sumMeta(rows) {
  return rows.reduce((acc, r) => ({
    spend: acc.spend + r.spend,
    clicks: acc.clicks + r.clicks,
    impressions: acc.impressions + r.impressions,
    leads: acc.leads + r.leads,
    lpv: acc.lpv + r.lpv,
  }), { spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 });
}

function sumGoogle(rows) {
  return rows.reduce((acc, r) => ({
    spend: acc.spend + r.spend,
    clicks: acc.clicks + r.clicks,
    impressions: acc.impressions + r.impressions,
    conversions: acc.conversions + r.conversions,
  }), { spend: 0, clicks: 0, impressions: 0, conversions: 0 });
}

function byDateMeta(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.dateStr]) map[r.dateStr] = { spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 };
    const d = map[r.dateStr];
    d.spend += r.spend; d.clicks += r.clicks; d.impressions += r.impressions;
    d.leads += r.leads; d.lpv += r.lpv;
  }
  return map;
}

function byDateGoogle(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.dateStr]) map[r.dateStr] = { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    const d = map[r.dateStr];
    d.spend += r.spend; d.clicks += r.clicks; d.impressions += r.impressions; d.conversions += r.conversions;
  }
  return map;
}

export function aggregateData(metaRows, searchRows, convRows, clientId, campaignGroup, dateRange) {
  const config = CLIENT_CONFIG[clientId];
  if (!config) throw new Error(`Unknown client: ${clientId}`);

  let metaFilter = config.metaFilter;
  if (campaignGroup && CAMPAIGN_GROUPS[campaignGroup]) {
    const groupFn = CAMPAIGN_GROUPS[campaignGroup];
    const baseFn = metaFilter;
    metaFilter = (name) => baseFn(name) && groupFn(name);
  }

  const parsedMeta = parseMeta(metaRows, config.metaCols, metaFilter, dateRange);
  const metaRaw = sumMeta(parsedMeta);

  const result = {
    meta: {
      total: {
        ...metaRaw,
        ctr: metaRaw.impressions > 0 ? (metaRaw.clicks / metaRaw.impressions) * 100 : 0,
        cpm: metaRaw.impressions > 0 ? (metaRaw.spend / metaRaw.impressions) * 1000 : 0,
        cpl: metaRaw.leads > 0 ? metaRaw.spend / metaRaw.leads : 0,
      },
      byDate: byDateMeta(parsedMeta),
      campaigns: rollUpMetaCampaigns(parsedMeta),
    },
    google: null,
  };

  // Include Google only when no campaign group filter is active
  if (!campaignGroup && config.searchSheet && config.googleFilter) {
    const parsedGoogle = parseGoogle(searchRows, convRows, config.googleFilter, dateRange);
    const googleRaw = sumGoogle(parsedGoogle);
    result.google = {
      total: {
        ...googleRaw,
        ctr: googleRaw.impressions > 0 ? (googleRaw.clicks / googleRaw.impressions) * 100 : 0,
        cpl: googleRaw.conversions > 0 ? googleRaw.spend / googleRaw.conversions : 0,
      },
      byDate: byDateGoogle(parsedGoogle),
      campaigns: rollUpGoogleCampaigns(parsedGoogle),
    };
  }

  return result;
}
