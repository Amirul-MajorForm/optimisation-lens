// Pacing Lens: campaign budgets, flights, spend to date and pacing from the
// MajorPace sheet ("Pacing - OS Brand" and "Pacing - OS Ecomm" tabs).
//
// The sheet already works out spend to date (from its own TMR pull, as of its
// "Pacing Date"), time pacing, spend pacing and overall pacing. Its money
// columns mix currencies (S$, RM, Rp, ¥, ...), so the dashboard uses the sheet's
// own percentages instead of recomputing them, and shows the money as written.

import { fetchTab, parseMoney, parseSheetDate } from './goals.js';

export const PACING_TABS = {
  Brand: process.env.PACING_BRAND_GID || '116061889', // "Pacing - OS Brand"
  Ecomm: process.env.PACING_ECOMM_GID || '46516630',  // "Pacing - OS Ecomm"
};

// Overall pacing (spend pacing / time pacing) within this band counts as on track
export const ON_TRACK = { low: 0.9, high: 1.1 };

const MARKETS = {
  singapore: 'sg', malaysia: 'my', philippines: 'ph', vietnam: 'vn', indonesia: 'id', thailand: 'th',
  japan: 'jp', korea: 'kr', 'south korea': 'kr', 'hong kong': 'hk',
};
const platformOf = p => {
  const s = String(p || '').toLowerCase();
  if (s.startsWith('tiktok')) return 'tiktok';
  if (s.startsWith('meta') || s.startsWith('facebook')) return 'meta';
  if (s.startsWith('google') || s.startsWith('youtube')) return 'google';
  if (s.startsWith('amazon')) return 'amazon';
  return s || 'other';
};
// "90%" -> 0.9; "-" or anything that is not a percentage -> null
const pct = v => { const m = String(v || '').trim().match(/^(-?[\d.,]+)\s*%$/); return m ? parseFloat(m[1].replace(/,/g, '')) / 100 : null; };

// LIVE / Paused / Scheduled / To Set Up / Ended / Did Not Run - Missed
export function statusOf(text) {
  const s = String(text || '').trim().toLowerCase();
  if (s === 'live' || s === 'active') return 'live';
  if (s.startsWith('pause')) return 'paused';
  if (s.startsWith('scheduled')) return 'scheduled';
  if (s.includes('set up') || s.includes('setup')) return 'setup';
  if (s.startsWith('ended') || s === 'completed' || s === 'complete') return 'ended';
  if (s.includes('did not run') || s.includes('missed')) return 'missed';
  return s ? 'other' : 'unknown';
}

// Pacing state for campaigns that are running (live / paused)
export function pacingState(overall) {
  if (overall == null) return null;
  if (overall < ON_TRACK.low) return 'under';
  if (overall > ON_TRACK.high) return 'over';
  return 'ok';
}

export function parsePacingTab(rows, tab) {
  const h = rows.findIndex(r => r.includes('Campaign Name') && r.includes('Platform'));
  if (h < 0) return { rows: [], pacingDate: null };
  const head = rows[h];
  const col = name => head.indexOf(name);
  const get = (r, name) => (col(name) >= 0 ? String(r[col(name)] ?? '').trim() : '');
  let pacingDate = null;
  const out = [];
  rows.slice(h + 1).forEach((r, i) => {
    const campaign = get(r, 'Campaign Name');
    const start = parseSheetDate(get(r, 'Start Date')), end = parseSheetDate(get(r, 'End Date'));
    if (!campaign || !start) return; // blank / total rows
    const pd = parseSheetDate(get(r, 'Pacing Date'));
    if (pd && (!pacingDate || pd > pacingDate)) pacingDate = pd;
    // Budget: "Budget" (Brand tab); Ecomm has "Briefed Budget" + "SGD Budget" (the one pacing uses)
    const budgetText = get(r, 'Budget') || get(r, 'SGD Budget') || get(r, 'Briefed Budget');
    const spendText = get(r, 'Spend to Date');
    const status = statusOf(get(r, 'Status'));
    const timePacing = pct(get(r, 'Time Pacing')), spendPacing = pct(get(r, 'Spend Pacing')), overall = pct(get(r, 'Overall Pacing'));
    const running = status === 'live' || status === 'paused';
    const budget = parseMoney(budgetText), spend = parseMoney(spendText);
    // Share of budget spent when the sheet has no spend pacing (e.g. ended rows),
    // if budget and spend are in the same currency
    const share = budget?.value > 0 && spend && spend.currency === budget.currency ? spend.value / budget.value : null;
    // Time elapsed when the sheet's time pacing cell is not a percentage
    const asOf = pd || null;
    const elapsed = asOf && end && start ? Math.min(1, Math.max(0, ((Date.parse(asOf) - Date.parse(start)) / 864e5 + 1) / ((Date.parse(end) - Date.parse(start)) / 864e5 + 1))) : null;
    out.push({
      id: `${tab}-${h + 2 + i}`, // tab + sheet row number
      tab,
      campaign,
      adName: get(r, 'Ad Name'),
      platformLabel: get(r, 'Platform'),
      platform: platformOf(get(r, 'Platform')),
      market: MARKETS[get(r, 'Market').toLowerCase()] || get(r, 'Market').toLowerCase().slice(0, 2),
      marketName: get(r, 'Market'),
      model: get(r, 'Model'),
      budgetText: budgetText && budgetText !== '-' ? budgetText : '',
      spendText,
      start, end,
      statusText: get(r, 'Status'),
      status,
      timePacing: timePacing ?? (running ? elapsed : null), spendPacing: spendPacing ?? share, overall,
      state: running ? pacingState(overall) : null,
      // Sheet still says LIVE / Paused but the flight ended before the pacing date
      flightOver: running && !!(end && asOf && end < asOf),
      idealDaily: get(r, 'Ideal Daily Spend').replace(/^-$/, ''),
      equalSpend: get(r, 'Equal Spend').replace(/^-$/, ''),
      notes: get(r, 'Opti Notes'),
    });
  });
  return { rows: out, pacingDate };
}

export async function loadPacing() {
  const tabs = await Promise.all(Object.entries(PACING_TABS).map(async ([tab, gid]) => ({ tab, ...parsePacingTab(await fetchTab(gid), tab) })));
  const pacingDate = tabs.map(t => t.pacingDate).filter(Boolean).sort().pop() || null;
  return { rows: tabs.flatMap(t => t.rows), pacingDate, onTrack: ON_TRACK, tabs: Object.keys(PACING_TABS) };
}

// Link to the campaign in its ad platform, from the IDs TMR returns
export function platformLink(platform, { account, id, market }) {
  if (!account) return null;
  const acc = String(account).replace(/^act_/, '');
  switch (platform) {
    case 'meta':
      return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${acc}${id ? `&selected_campaign_ids=${id}` : ''}`;
    case 'tiktok':
      return `https://ads.tiktok.com/i18n/perf/campaign?aadvid=${acc}${id ? `&keyword=${id}` : ''}`;
    case 'google':
      return `https://ads.google.com/aw/campaigns?__e=${acc.replace(/-/g, '')}${id ? `&campaignId=${id}` : ''}`;
    case 'amazon': {
      const host = market === 'jp' ? 'advertising.amazon.co.jp' : market === 'sg' ? 'advertising.amazon.sg' : 'advertising.amazon.com';
      return id ? `https://${host}/cm/sp/campaigns/${id}/ad-groups?entityId=${acc}` : `https://${host}/cm/campaigns?entityId=${acc}`;
    }
    default: return null;
  }
}
