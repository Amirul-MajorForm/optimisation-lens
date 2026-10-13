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
const CONV_FIXED = { date: 2, campaign: 3 }; // conversion col detected dynamically from header

const ACADEMY_RE = /ACADEMY|YMTT|TEACHER\s*TRAINING/i;

const CLIENT_CONFIG = {
  'ym-sg': {
    metaSheet: 'YM - Meta',
    metaCols: YM_META,
    metaFilter: (n) => n.startsWith('SG_') && !ACADEMY_RE.test(n),
    searchSheet: 'YM - GoogleAds Search IS',
    conversionsSheet: 'YM - Google Conversions',
    googleFilter: (n) => ['SG_', 'Free Class', 'Starter Classes', 'Website traffic'].some(p => n.startsWith(p)),
  },
  'ym-academy': {
    metaSheet: 'YM - Meta',
    metaCols: YM_META,
    metaFilter: (n) => ACADEMY_RE.test(n),
    searchSheet: null,
    conversionsSheet: null,
    googleFilter: null,
  },
  'ym-hk': {
    metaSheet: 'YM - Meta',
    metaCols: YM_META,
    metaFilter: (n) => n.startsWith('HK_'),
    searchSheet: 'YM - GoogleAds Search IS',
    conversionsSheet: 'YM - Google Conversions',
    googleFilter: (n) => n.startsWith('HK_') || n.startsWith('2025 - Always On - Hong Kong'),
  },
  'strong': {
    metaSheet: 'Strong - Meta',
    metaCols: STRONG_META,
    metaFilter: (n) => /strong/i.test(n),
    searchSheet: null,
    conversionsSheet: null,
    googleFilter: null,
    hasCampaignGroups: false,
  },
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

function dateStrToSerial(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

export function getDateRange(days) {
  const todaySerial = Math.floor(Date.now() / 86400000) + 25569;
  // end = yesterday, start = yesterday - (days - 1), so "last 7 days" = 7 complete days before today
  return { start: todaySerial - days, end: todaySerial - 1 };
}

export function getDateRangeFromStrings(startDate, endDate) {
  return { start: dateStrToSerial(startDate), end: dateStrToSerial(endDate) };
}

export function getClientConfig(clientId) {
  return CLIENT_CONFIG[clientId] ?? null;
}

// Parse + deduplicate Meta rows up to (date, campaign, adset, ad) level
// convCols: array of { key, colIndex } for all named conversion columns
function parseMeta(rows, cols, campaignFilter, dateRange, convCols = []) {
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
      const init = { dateStr, campaign, adset, ad, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 };
      for (const c of convCols) init[c.key] = 0;
      map.set(key, init);
    }
    const agg = map.get(key);
    agg.spend += n(row[cols.spend]);
    agg.clicks += n(row[cols.clicks]);
    agg.impressions += n(row[cols.impressions]);
    agg.leads += n(row[cols.leads]);
    agg.lpv += n(row[cols.lpv]);
    for (const c of convCols) agg[c.key] += n(row[c.colIndex]);
  }
  return Array.from(map.values());
}

// Conversion event columns follow "Action - Stage" format (e.g. "Class Pack - Sign Up Start")
function isConversionColName(name) {
  return name.includes(' - ');
}

// Safe flat key for a conversion column name: "Class Pack - Sign Up Start" → "conv_class_pack_sign_up_start"
function convKey(name) {
  return 'conv_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Returns array of { name, key, colIndex } for named conversion columns in the Google Conversions sheet
function parseConversionColumns(convRows) {
  if (!convRows || convRows.length < 1) return [];
  const header = convRows[0];
  const result = [];
  for (let i = 0; i < header.length; i++) {
    const name = String(header[i] ?? '').trim();
    if (name && isConversionColName(name)) result.push({ name, key: convKey(name), colIndex: i });
  }
  return result;
}

// Returns array of { name, key, colIndex } for named conversion columns in the Meta sheet header
function parseMetaConversionColumns(metaRows, fixedCols) {
  if (!metaRows || metaRows.length < 1) return [];
  const header = metaRows[0];
  const fixedSet = new Set(Object.values(fixedCols));
  const result = [];
  for (let i = 0; i < header.length; i++) {
    if (fixedSet.has(i)) continue;
    const name = String(header[i] ?? '').trim();
    if (name && isConversionColName(name)) result.push({ name, key: convKey(name), colIndex: i });
  }
  return result;
}

// Parse Google Search IS + Conversions; all named conv columns flattened onto each row
function parseGoogle(searchRows, convRows, googleFilter, dateRange, convCols) {
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
      const init = { dateStr, campaign, spend: 0, impressions: 0, clicks: 0 };
      for (const c of convCols) init[c.key] = 0;
      searchMap.set(key, init);
    }
    const agg = searchMap.get(key);
    agg.spend += n(row[SEARCH_IS.spend]);
    agg.impressions += n(row[SEARCH_IS.impressions]);
    agg.clicks += n(row[SEARCH_IS.clicks]);
  }

  if (convRows.length > 1) {
    for (const row of convRows.slice(1)) {
      const serial = row[CONV_FIXED.date];
      if (!isValidSerial(serial)) continue;
      if (serial < dateRange.start || serial > dateRange.end) continue;
      const campaign = String(row[CONV_FIXED.campaign] ?? '').trim();
      if (!campaign || !googleFilter(campaign)) continue;
      const dateStr = serialToDateStr(serial);
      const key = `${dateStr}||${campaign}`;
      if (!searchMap.has(key)) continue;
      const agg = searchMap.get(key);
      for (const c of convCols) agg[c.key] += n(row[c.colIndex]);
    }
  }

  return Array.from(searchMap.values());
}

function addConvKeys(target, src, convKeys) {
  for (const k of convKeys) target[k] = (target[k] || 0) + (src[k] || 0);
}

function rollUpMetaCampaigns(adRows, convKeys = []) {
  const campMap = new Map();
  for (const row of adRows) {
    if (!campMap.has(row.campaign)) {
      const init = { name: row.campaign, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0, adMap: new Map() };
      for (const k of convKeys) init[k] = 0;
      campMap.set(row.campaign, init);
    }
    const c = campMap.get(row.campaign);
    c.spend += row.spend; c.clicks += row.clicks; c.impressions += row.impressions;
    c.leads += row.leads; c.lpv += row.lpv;
    addConvKeys(c, row, convKeys);

    const adKey = `${row.adset}||${row.ad}`;
    if (!c.adMap.has(adKey)) {
      const ai = { adset: row.adset, ad: row.ad, spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 };
      for (const k of convKeys) ai[k] = 0;
      c.adMap.set(adKey, ai);
    }
    const a = c.adMap.get(adKey);
    a.spend += row.spend; a.clicks += row.clicks; a.impressions += row.impressions;
    a.leads += row.leads; a.lpv += row.lpv;
    addConvKeys(a, row, convKeys);
  }

  return Array.from(campMap.values()).map(c => {
    const base = {
      name: c.name,
      spend: c.spend, clicks: c.clicks, impressions: c.impressions, leads: c.leads, lpv: c.lpv,
      ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
      cpl: c.leads > 0 ? c.spend / c.leads : 0,
      ads: Array.from(c.adMap.values()).map(a => {
        const ad = { adset: a.adset, ad: a.ad, spend: a.spend, clicks: a.clicks, impressions: a.impressions, leads: a.leads, lpv: a.lpv, ctr: a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0, cpl: a.leads > 0 ? a.spend / a.leads : 0 };
        for (const k of convKeys) ad[k] = a[k];
        return ad;
      }).sort((a, b) => b.spend - a.spend),
    };
    for (const k of convKeys) base[k] = c[k];
    return base;
  }).sort((a, b) => b.spend - a.spend);
}

function rollUpGoogleCampaigns(rows, convKeys = []) {
  const campMap = new Map();
  for (const row of rows) {
    if (!campMap.has(row.campaign)) {
      const init = { name: row.campaign, spend: 0, clicks: 0, impressions: 0 };
      for (const k of convKeys) init[k] = 0;
      campMap.set(row.campaign, init);
    }
    const c = campMap.get(row.campaign);
    c.spend += row.spend; c.clicks += row.clicks; c.impressions += row.impressions;
    addConvKeys(c, row, convKeys);
  }
  return Array.from(campMap.values()).map(c => {
    const base = { ...c, ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0 };
    return base;
  }).sort((a, b) => b.spend - a.spend);
}

function sumMeta(rows, convKeys = []) {
  const init = { spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 };
  for (const k of convKeys) init[k] = 0;
  return rows.reduce((acc, r) => {
    acc.spend += r.spend; acc.clicks += r.clicks; acc.impressions += r.impressions;
    acc.leads += r.leads; acc.lpv += r.lpv;
    addConvKeys(acc, r, convKeys);
    return acc;
  }, init);
}

function sumGoogle(rows, convKeys = []) {
  const init = { spend: 0, clicks: 0, impressions: 0 };
  for (const k of convKeys) init[k] = 0;
  return rows.reduce((acc, r) => {
    acc.spend += r.spend; acc.clicks += r.clicks; acc.impressions += r.impressions;
    addConvKeys(acc, r, convKeys);
    return acc;
  }, init);
}

function byDateMeta(rows, convKeys = []) {
  const map = {};
  for (const r of rows) {
    if (!map[r.dateStr]) {
      map[r.dateStr] = { spend: 0, clicks: 0, impressions: 0, leads: 0, lpv: 0 };
      for (const k of convKeys) map[r.dateStr][k] = 0;
    }
    const d = map[r.dateStr];
    d.spend += r.spend; d.clicks += r.clicks; d.impressions += r.impressions;
    d.leads += r.leads; d.lpv += r.lpv;
    addConvKeys(d, r, convKeys);
  }
  return map;
}

function byDateGoogle(rows, convKeys = []) {
  const map = {};
  for (const r of rows) {
    if (!map[r.dateStr]) {
      map[r.dateStr] = { spend: 0, clicks: 0, impressions: 0 };
      for (const k of convKeys) map[r.dateStr][k] = 0;
    }
    const d = map[r.dateStr];
    d.spend += r.spend; d.clicks += r.clicks; d.impressions += r.impressions;
    addConvKeys(d, r, convKeys);
  }
  return map;
}

export function aggregateData(metaRows, searchRows, convRows, clientId, _campaignGroup, dateRange) {
  const config = CLIENT_CONFIG[clientId];
  if (!config) throw new Error(`Unknown client: ${clientId}`);

  const metaConvCols = parseMetaConversionColumns(metaRows, config.metaCols);
  const metaConvKeys = metaConvCols.map(c => c.key);

  const parsedMeta = parseMeta(metaRows, config.metaCols, config.metaFilter, dateRange, metaConvCols);
  const metaRaw = sumMeta(parsedMeta, metaConvKeys);

  const result = {
    meta: {
      total: {
        ...metaRaw,
        ctr: metaRaw.impressions > 0 ? (metaRaw.clicks / metaRaw.impressions) * 100 : 0,
        cpm: metaRaw.impressions > 0 ? (metaRaw.spend / metaRaw.impressions) * 1000 : 0,
        cpl: metaRaw.leads > 0 ? metaRaw.spend / metaRaw.leads : 0,
      },
      byDate: byDateMeta(parsedMeta, metaConvKeys),
      campaigns: rollUpMetaCampaigns(parsedMeta, metaConvKeys),
    },
    google: null,
    metaConversions: metaConvCols.map(c => ({ name: c.name, key: c.key })),
    googleConversions: [],
  };

  if (config.searchSheet && config.googleFilter) {
    const googleConvCols = parseConversionColumns(convRows);
    const googleConvKeys = googleConvCols.map(c => c.key);
    result.googleConversions = googleConvCols.map(c => ({ name: c.name, key: c.key }));

    const parsedGoogle = parseGoogle(searchRows, convRows, config.googleFilter, dateRange, googleConvCols);
    const googleRaw = sumGoogle(parsedGoogle, googleConvKeys);
    result.google = {
      total: {
        ...googleRaw,
        ctr: googleRaw.impressions > 0 ? (googleRaw.clicks / googleRaw.impressions) * 100 : 0,
      },
      byDate: byDateGoogle(parsedGoogle, googleConvKeys),
      campaigns: rollUpGoogleCampaigns(parsedGoogle, googleConvKeys),
    };
  }

  return result;
}
