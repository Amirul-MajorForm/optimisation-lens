// Sales Lens: group Meta CPAS ads into mega-sale periods by their ad names.
//
// A mega sale is a double date in the ad name where day == month, e.g.
//   GIF_Offer_NA_9.9 Lantern Sale      -> 9.9
//   GIF_1126_NA_Prospecting_11.11_EN   -> 11.11
// Ads without one (e.g. "October ICD", "Jan New Year Sale") are not mega sales,
// and neither is any ad marked BAU (business as usual), e.g. "4.4 BAU".

const SALE_RE = /(?<![\d.])(1[0-2]|[1-9])\.(1[0-2]|[1-9])(?![\d.])/g;

// "BAU" as a whole word, with spaces or underscores around it
const BAU_RE = /(?:^|[^a-z])bau(?:[^a-z]|$)/i;

// Exceptions: ads without a double date that should still count as a mega
// sale. Temporary, agreed case by case; remove an entry to undo it.
export const SALE_EXCEPTIONS = [
  { match: /october icd/i, label: '10.10', theme: 'October ICD' },
];

// Returns { label: '9.9', month: 9, theme: 'Lantern Sale', exception? } or null
export function detectSale(adName) {
  const name = adName || '';
  if (BAU_RE.test(name)) return null;
  const ex = SALE_EXCEPTIONS.find(e => e.match.test(name));
  if (ex) return { label: ex.label, month: Number(ex.label.split('.')[0]), theme: ex.theme, exception: true };
  for (const m of name.matchAll(SALE_RE)) {
    if (m[1] !== m[2]) continue; // 9.9 yes, 9.10 no
    const label = `${m[1]}.${m[2]}`;
    // Theme: the rest of the "_"-separated part that holds the date
    const part = name.split('_').find(p => p.includes(label)) || '';
    const theme = part.replace(label, '').replace(/\s+/g, ' ').trim();
    return { label, month: Number(m[1]), theme };
  }
  return null;
}

const blank = () => ({ spend: 0, orders: 0, revenue: 0 });

// Campaign objective from the name, e.g. ..._Traffic_... or ..._Conversion_...
const isConversionCampaign = name => /_conversion(_|$)/i.test(name || '');
const objectiveOf = name => (/_traffic(_|$)/i.test(name || '') ? 'traffic'
  : /_(awareness|reach)(_|$)/i.test(name || '') ? 'awareness'
  : /_consideration(_|$)/i.test(name || '') ? 'consideration' : 'non-conversion');
const add = (t, r) => { t.spend += r.spend; t.orders += r.orders; t.revenue += r.revenue; };
const rates = t => ({
  ...t,
  roas: t.spend > 0 && t.revenue > 0 ? t.revenue / t.spend : null,
  cpa: t.spend > 0 && t.orders > 0 ? t.spend / t.orders : null,
});

// Ads from non-conversion campaigns (e.g. a traffic campaign with a "5.5 New
// Product Launch" ad) stay in the sale's totals, but are reported separately
// with what the sale looks like without them, for the footnote.
function nonConversionSplit(ads) {
  const other = ads.filter(a => !isConversionCampaign(a.campaign));
  if (!other.length) return { nonConversion: null };
  const byCampaign = new Map();
  for (const a of other) {
    const c = byCampaign.get(a.campaign) || { campaign: a.campaign, objective: objectiveOf(a.campaign), ...blank() };
    add(c, a);
    byCampaign.set(a.campaign, c);
  }
  const conv = blank();
  ads.filter(a => isConversionCampaign(a.campaign)).forEach(a => add(conv, a));
  return {
    nonConversion: {
      campaigns: [...byCampaign.values()].map(rates).sort((a, b) => b.spend - a.spend),
      conversionOnly: rates(conv),
    },
  };
}

// rows: [{ date, ad_name, campaign_name, spend, orders, revenue }] already in SGD
// TikTok has no sale naming, so a sale is a date window around the double day:
// 9.9 -> 7 Sep to 10 Sep (2 days before, 1 day after). Change here to adjust.
export const SALE_WINDOW = { before: 2, after: 1 };
const DAY = 86400000;
const isoDay = t => new Date(t).toISOString().slice(0, 10);

// 'YYYY-MM-DD' -> { label: '9.9', month: 9, year, start, end } or null
export function saleWindowFor(date) {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!isFinite(t)) return null;
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  // This month's sale day, or next month's (2.2's window starts 31 Jan)
  for (const [yy, mm] of [[y, m], m === 12 ? [y + 1, 1] : [y, m + 1]]) {
    const saleT = Date.UTC(yy, mm - 1, mm);
    const start = saleT - SALE_WINDOW.before * DAY, end = saleT + SALE_WINDOW.after * DAY;
    if (t >= start && t <= end) return { label: `${mm}.${mm}`, month: mm, year: yy, start: isoDay(start), end: isoDay(end) };
  }
  return null;
}

function newSale(key, info) {
  return {
    key, label: info.label, year: info.year, month: info.month,
    ...blank(), firstDate: null, lastDate: null, activeDays: new Set(),
    themes: new Set(), exceptions: new Map(), ads: new Map(), byPlatform: {},
  };
}

function accumulate(sales, info, r, platform) {
  const key = `${info.year}-${String(info.month).padStart(2, '0')}`;
  const s = sales.get(key) || newSale(key, info);
  add(s, r);
  const p = (s.byPlatform[platform] ||= { ...blank(), dates: new Set(), firstDate: null, lastDate: null });
  add(p, r);
  if (info.start) p.window = { start: info.start, end: info.end };
  if (r.date) {
    if (r.spend > 0) { s.activeDays.add(r.date); p.dates.add(r.date); }
    for (const x of [s, p]) {
      if (!x.firstDate || r.date < x.firstDate) x.firstDate = r.date;
      if (!x.lastDate || r.date > x.lastDate) x.lastDate = r.date;
    }
  }
  if (info.theme) s.themes.add(info.theme);
  if (info.exception) {
    const e = s.exceptions.get(info.theme) || { theme: info.theme, ...blank() };
    add(e, r);
    s.exceptions.set(info.theme, e);
  }
  const ad = r.ad_name ?? r.campaign_name;
  const adKey = `${platform}|${r.campaign_name}|${ad}`;
  const entry = s.ads.get(adKey) || { platform, ad, campaign: r.campaign_name, ...blank() };
  add(entry, r);
  s.ads.set(adKey, entry);
  sales.set(key, s);
}

// cpasRows:   [{ date, ad_name, campaign_name, spend, orders, revenue }]  (SGD)
// tiktokRows: [{ date, campaign_name, spend, orders, revenue }]           (SGD, GMV campaigns)
export function groupSales(cpasRows, tiktokRows = []) {
  const sales = new Map();
  const notSale = new Map();

  for (const r of cpasRows) {
    if (!r.spend && !r.orders && !r.revenue) continue;
    const sale = detectSale(r.ad_name);
    if (!sale) {
      const o = notSale.get(r.ad_name) || { ad: r.ad_name, ...blank() };
      add(o, r);
      notSale.set(r.ad_name, o);
      continue;
    }
    accumulate(sales, { ...sale, year: Number((r.date || '').slice(0, 4)) }, r, 'cpas');
  }

  for (const r of tiktokRows) {
    if (!r.spend && !r.orders && !r.revenue) continue;
    const w = saleWindowFor(r.date);
    if (w) accumulate(sales, w, r, 'tiktok');
  }

  const list = [...sales.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(s => ({
      key: s.key, label: s.label, year: s.year, month: s.month,
      themes: [...s.themes],
      firstDate: s.firstDate, lastDate: s.lastDate, activeDays: s.activeDays.size,
      ...rates({ spend: s.spend, orders: s.orders, revenue: s.revenue }),
      byPlatform: Object.fromEntries(Object.entries(s.byPlatform).map(([k, p]) => [k, {
        ...rates({ spend: p.spend, orders: p.orders, revenue: p.revenue }),
        firstDate: p.firstDate, lastDate: p.lastDate, activeDates: [...p.dates].sort(), window: p.window || null,
      }])),
      ads: [...s.ads.values()].map(rates).sort((a, b) => b.spend - a.spend),
      ...nonConversionSplit([...s.ads.values()].filter(a => a.platform === 'cpas')),
      exceptions: [...s.exceptions.values()].map(rates),
    }));

  // Token-spend sales (under 20% of the average sale's spend, e.g. SGD 4 at
  // 87x ROAS) are flagged and never used as the comparison point
  const avg = list.length ? list.reduce((a, s) => a + s.spend, 0) / list.length : 0;
  list.forEach(s => { s.lowSpend = s.spend < avg * 0.2; });

  // Change vs the previous sale that actually ran, for the bird's-eye comparison
  list.forEach((s, i) => {
    const p = list.slice(0, i).reverse().find(x => !x.lowSpend);
    const pct = (a, b) => (a != null && b > 0 ? ((a - b) / b) * 100 : null);
    s.vsPrevious = p ? { label: p.label, spend: pct(s.spend, p.spend), orders: pct(s.orders, p.orders), roas: pct(s.roas, p.roas) } : null;
  });

  const platforms = ['cpas', 'tiktok'].filter(k => list.some(s => s.byPlatform[k]));
  return {
    sales: list,
    platforms,
    saleWindow: SALE_WINDOW,
    notSale: [...notSale.values()].map(rates).sort((a, b) => b.spend - a.spend),
  };
}
