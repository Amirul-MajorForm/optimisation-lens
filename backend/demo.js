// Demo client ("Brightleaf", a made-up tea brand) for pitches and client demos.
//
// Every Two Minute Reports query and every MajorPace sheet tab for the demo
// client is answered here, in-process, instead of over the network, so every
// lens, drill-down, chart and view works and loads instantly. The numbers are
// generated, deterministic (the same range always shows the same numbers) and
// shaped like real data: daily seasonality, mega-sale spikes (9.9, 10.10,
// 11.11 ...), ad sets / ads with winners and losers, search terms with waste,
// overlap and movers, impression share, pacing and goals.

const DAY = 864e5;
const iso = t => new Date(t).toISOString().slice(0, 10);
const yesterday = () => iso(Date.now() - DAY);

// ---------------------------------------------------------------- randomness
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995); x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
const jitter = (key, amp) => 1 + (hash(key) - 0.5) * 2 * amp;
// Unbiased whole numbers that still add up on average
const roundish = (v, key) => { const f = Math.floor(v); return f + (hash(key) < v - f ? 1 : 0); };

// ---------------------------------------------------------------- accounts
export const DEMO_ACCOUNTS = {
  meta: { sg: 'fads_act_demo_sg', my: 'fads_act_demo_my' },
  tiktok: { sg: 'ttads_demo_sg', my: 'ttads_demo_my' },
  google: { sg: 'gadw_demo_sg', my: 'gadw_demo_my' },
  cpasSG: 'fads_act_demo_cpas_sg', cpasMY: 'fads_act_demo_cpas_my',
  amazonSG: 'amazonads_demo-SG', amazonJP: 'amazonads_demo-JP',
};
const A = DEMO_ACCOUNTS;

// ---------------------------------------------------------------- rates per kind
// Costs in SGD; fx scales money for MYR / JPY campaigns
const KIND = {
  reach:    { cpm: 3.2, ctr: 0.0045, lpv: 0.55, v3: 0.20, thru: 0.05, plays: 0.28, watch: 3.1, v6: 0.08, v15: 0.03, freq: 2.6 },
  traffic:  { cpm: 6.5, ctr: 0.016, lpv: 0.74, v3: 0.12, thru: 0.03, plays: 0.20, watch: 2.4, v6: 0.05, v15: 0.02, freq: 1.8 },
  views:    { cpm: 4.6, ctr: 0.006, lpv: 0.50, v3: 0.38, thru: 0.16, plays: 0.55, watch: 6.8, v6: 0.24, v15: 0.11, freq: 1.9 },
  sales:    { cpm: 9.0, ctr: 0.013, lpv: 0.70, v3: 0.10, thru: 0.03, plays: 0.18, watch: 2.2, v6: 0.04, v15: 0.02, freq: 1.7, cvr: 0.028, aov: 46, src: 'meta' },
  cpas:     { cpm: 8.0, ctr: 0.015, lpv: 0.60, v3: 0.10, thru: 0.03, plays: 0.18, watch: 2.0, v6: 0.04, v15: 0.02, freq: 1.7, cvr: 0.034, aov: 29, src: 'cpas' },
  gmv:      { cpm: 7.0, ctr: 0.018, lpv: 0.60, v3: 0.20, thru: 0.06, plays: 0.40, watch: 4.0, v6: 0.12, v15: 0.05, freq: 1.8, cvr: 0.036, aov: 25, src: 'gmv' },
  brandsearch: { cpm: 80, ctr: 0.17, lpv: 0.9, cvr: 0.11, aov: 36, src: 'google', freq: 1.2, is: [0.89, 0.07, 0.02] },
  search:   { cpm: 70, ctr: 0.065, lpv: 0.85, cvr: 0.045, aov: 52, src: 'google', freq: 1.3, is: [0.42, 0.36, 0.19] },
  shopping: { cpm: 6, ctr: 0.012, lpv: 0.85, cvr: 0.022, aov: 47, src: 'google', freq: 1.4, is: [0.57, 0.38, 0.03] },
  youtube:  { cpm: 5.5, ctr: 0.004, lpv: 0.6, v3: 0, thru: 0, plays: 0, watch: 0, freq: 2.2, src: 'google' },
  amazon:   { cpm: 4.2, ctr: 0.0048, lpv: 0, cvr: 0.11, aov: 28, src: 'amazon', freq: 1.5 },
};
const COMMERCE_KINDS = new Set(['sales', 'cpas', 'gmv', 'search', 'brandsearch', 'shopping', 'amazon']);

// ---------------------------------------------------------------- campaigns
// daily = average daily spend in the account's currency; fx = currency vs SGD
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function catalogue() {
  const y = new Date().getUTCFullYear();
  const Y = String(y);
  const c = (market, platform, account, mid, kind, daily, extra = {}) => ({
    name: `${market.toUpperCase()}_${platform === 'meta' ? 'Meta' : platform === 'tiktok' ? 'TikTok' : platform === 'google' ? 'Google' : 'Amazon'}_Brightleaf_${mid}`.replace('{Y}', Y),
    market, platform, account, kind, daily, fx: 1, start: `${Y}-01-01`, end: null, status: 'active', ...extra,
  });
  return [
    // ---------- Singapore
    c('sg', 'meta', A.meta.sg, 'Awareness_CPM_Reach_{Y}_Always-On', 'reach', 95),
    c('sg', 'meta', A.meta.sg, 'Consideration_CPLV_Traffic_{Y}_Matcha', 'traffic', 140, { shift: { ctr: 0.7 } }),
    c('sg', 'meta', A.meta.sg, 'Consideration_CPV_Views_{Y}_Cold-Brew-Launch', 'views', 120, { start: `${Y}-09-15` }),
    c('sg', 'meta', A.meta.sg, 'Consideration_CPLV_Traffic_{Y}_Oct-Promo', 'traffic', 110, { start: `${Y}-10-01`, end: `${Y}-10-31` }),
    c('sg', 'meta', A.meta.sg, 'Conversion_ROAS_Sales_{Y}_Website', 'sales', 210),
    c('sg', 'tiktok', A.tiktok.sg, 'Awareness_CPM_Reach_{Y}_Always-On', 'reach', 80),
    c('sg', 'tiktok', A.tiktok.sg, 'Consideration_CPV_Views_{Y}_Cold-Brew-Launch', 'views', 130, { start: `${Y}-09-15`, shift: { cpm: 1.32 } }),
    c('sg', 'tiktok', A.tiktok.sg, 'Consideration_CPLV_Traffic_{Y}_Shop-Visits', 'traffic', 90, { pausedFrom: -12 }),
    c('sg', 'tiktok', A.tiktok.sg, 'Conversion_ROI_Sales_{Y}_GMV-Max-Product', 'gmv', 260),
    c('sg', 'tiktok', A.tiktok.sg, 'Conversion_ROI_Sales_{Y}_LIVE-GMV-Max', 'gmv', 150),
    c('sg', 'google', A.google.sg, 'Conversion_CPA_Sales_{Y}_Search-Brand', 'brandsearch', 60),
    c('sg', 'google', A.google.sg, 'Conversion_CPA_Sales_{Y}_Search-Generic', 'search', 170, { shift: { cvr: 0.6 } }),
    c('sg', 'google', A.google.sg, 'Conversion_ROAS_Sales_{Y}_Shopping', 'shopping', 120),
    c('sg', 'google', A.google.sg, 'Consideration_CPV_Views_{Y}_YouTube', 'youtube', 70),
    c('sg', 'meta', A.cpasSG, 'Conversion_ROAS_Sales_{Y}_CPAS-Shopee', 'cpas', 230),
    c('sg', 'meta', A.cpasSG, 'Conversion_ROAS_Sales_{Y}_CPAS-Lazada', 'cpas', 160, { shift: { cvr: 0.66 } }),
    c('sg', 'amazon', A.amazonSG, 'Conversion_ROAS_Sales_{Y}_SP-Auto', 'amazon', 70),
    c('sg', 'amazon', A.amazonSG, 'Conversion_ROAS_Sales_{Y}_SP-Manual-Exact', 'amazon', 55),
    // ---------- Malaysia (Meta bills in MYR)
    c('my', 'meta', A.meta.my, 'Awareness_CPM_Reach_{Y}_Always-On', 'reach', 260, { fx: 3.3 }),
    c('my', 'meta', A.meta.my, 'Consideration_CPLV_Traffic_{Y}_Matcha', 'traffic', 330, { fx: 3.3 }),
    c('my', 'tiktok', A.tiktok.my, 'Consideration_CPV_Views_{Y}_Cold-Brew-Launch', 'views', 85, { start: `${Y}-09-15` }),
    c('my', 'tiktok', A.tiktok.my, 'Conversion_ROI_Sales_{Y}_GMV-Max-Product', 'gmv', 150, { shift: { cvr: 1.35 } }),
    c('my', 'google', A.google.my, 'Conversion_CPA_Sales_{Y}_Search-Generic', 'search', 75),
    c('my', 'meta', A.cpasMY, 'Conversion_ROAS_Sales_{Y}_CPAS-Shopee', 'cpas', 520, { fx: 3.3 }),
    // ---------- Japan (Amazon, JPY)
    c('jp', 'amazon', A.amazonJP, 'Conversion_ROAS_Sales_{Y}_SP-Auto', 'amazon', 9500, { fx: 110 }),
    c('jp', 'amazon', A.amazonJP, 'Conversion_ROAS_Sales_{Y}_SP-Manual-Exact', 'amazon', 6200, { fx: 110 }),
  ].map(x => {
    const out = { ...x };
    if (out.pausedFrom != null) { out.pauseDate = iso(Date.now() + out.pausedFrom * DAY); out.status = 'paused'; }
    if (out.end && out.end < yesterday()) out.status = 'ended';
    return out;
  });
}
let catCache = null, catDay = null;
const CAT = () => { if (catDay !== yesterday()) { catCache = catalogue(); catDay = yesterday(); } return catCache; };

// ---------------------------------------------------------------- seasonality
const WEEKDAY = [0.92, 1.0, 1.02, 1.03, 1.05, 1.09, 0.97];
function seasonFactor(dayIso, commerce) {
  const d = new Date(`${dayIso}T00:00:00Z`);
  const m = d.getUTCMonth() + 1, day = d.getUTCDate();
  let f = WEEKDAY[d.getUTCDay()] * (1 + 0.18 * (m - 1) / 11);
  const big = m >= 9 ? 1.4 : 1; // Q4 sales are bigger
  if (commerce) {
    if (day === m) f *= 3.0 * big;
    else if (day >= m - 3 && day < m) f *= 1.5;
    else if (day === m + 1) f *= 1.3;
    if (day === 25) f *= 1.2; // payday
  } else if (day === m) f *= 1.2;
  return f;
}
const cvrBoost = dayIso => { const d = new Date(`${dayIso}T00:00:00Z`); return d.getUTCDate() === d.getUTCMonth() + 1 ? 1.35 : 1; };

// Campaign totals for one day (zero outside its flight, and from yesterday on)
function dayTotals(c, dayIso) {
  if (dayIso < c.start || (c.end && dayIso > c.end) || dayIso > yesterday() || (c.pauseDate && dayIso >= c.pauseDate)) return null;
  const k = KIND[c.kind];
  const key = `${c.name}|${dayIso}`;
  // Built-in change over the last 7 days (worse CTR / CPM / CVR, or better)
  const recent = c.shift && Math.round((Date.parse(yesterday()) - Date.parse(dayIso)) / DAY) < 7 ? c.shift : {};
  const spend = c.daily * seasonFactor(dayIso, COMMERCE_KINDS.has(c.kind)) * jitter(`${key}|s`, 0.14);
  const impr = (spend / c.fx) / (k.cpm * (recent.cpm || 1)) * 1000 * jitter(`${key}|i`, 0.07);
  const clicks = impr * k.ctr * (recent.ctr || 1) * jitter(`${key}|c`, 0.09);
  const orders = clicks * (k.cvr || 0) * (recent.cvr || 1) * cvrBoost(dayIso) * jitter(`${key}|o`, 0.22);
  const revenue = orders * (k.aov || 0) * c.fx * jitter(`${key}|r`, 0.08);
  const is = k.is ? k.is.map((v, j) => Math.max(0.02, v * jitter(`${key}|is${j}`, 0.1))) : null;
  if (is) { const sum = is[0] + is[1] + is[2]; if (sum > 0.98) is.forEach((_, j) => { is[j] *= 0.98 / sum; }); }
  return { spend, impr, clicks, orders, revenue, is };
}

// ---------------------------------------------------------------- breakdowns
// Leaves: the finest rows of one breakdown, with a share of the campaign and
// efficiency multipliers. Each day the shares are re-normalised over the
// leaves that are live, so every breakdown adds up to the campaign.
const ADSETS = {
  meta: ['Broad_18-44', 'Interest_Health-Wellness', 'LAL_1%_Purchasers', 'Retargeting_30D'],
  tiktok: ['Broad_18-34', 'Interest_Food-Drink', 'Creator-Affinity'],
};
const THEMES = ['Morning-Ritual', 'Matcha-Latte', 'Cold-Brew', 'Product-Hero', 'UGC-Review', 'Founder-Story', 'Flavour-Range'];
function adsFor(c) {
  if (c.kind === 'cpas') {
    const sale = ['New Year Sale', 'CNY Sale', 'Spring Sale', 'Mid-Year Prep', 'Mid-Year Sale', 'Mega Sale', 'Payday Sale', 'Brand Day', 'Super Sale', 'Brand Day', 'Singles Day', 'Year-End Sale'];
    const lang = c.market === 'my' ? 'BM' : 'EN';
    const leaves = [];
    for (let m = 1; m <= 12; m++) {
      const type = ['VID', 'IMG', 'GIF'][m % 3];
      leaves.push({ adset: 'Mega-Sale', ad: `${type}_Offer_NA_${m}.${m} ${sale[m - 1]}_${m % 2 ? 'EN' : lang}`, w: 3, eff: [1, 1.1, 1.25], window: { month: m } });
    }
    leaves.push({ adset: 'Always-On', ad: `IMG_Bestsellers_NA_BAU_EN`, w: 1, eff: [1, 1, 0.9] });
    leaves.push({ adset: 'Always-On', ad: `CAR_Flavours_NA_BAU_${lang}`, w: 0.8, eff: [1, 0.9, 0.8] });
    return leaves;
  }
  if (c.platform === 'google') {
    const groups = c.kind === 'brandsearch' ? ['Brand_Exact', 'Brand_Phrase'] : c.kind === 'search' ? ['Matcha', 'Green-Tea', 'Healthy-Drinks']
      : c.kind === 'shopping' ? ['All-Products'] : ['In-Market_Beverages', 'Custom-Intent_Matcha'];
    const type = c.kind === 'youtube' ? 'VIDEO_RESPONSIVE_AD' : c.kind === 'shopping' ? 'SHOPPING_PRODUCT_AD' : 'RESPONSIVE_SEARCH_AD';
    return groups.flatMap((g, gi) => [0, 1].map(v => ({
      adset: g, ad: c.kind === 'youtube' ? `VID_${THEMES[(gi + v) % THEMES.length]}_${v ? '6s' : '15s'}_EN` : '',
      adId: String(700000000000 + Math.floor(hash(`${c.name}|${g}|${v}`) * 1e9)), adType: type,
      w: 1 + hash(`${c.name}|${g}|${v}|w`), eff: [jitter(`${c.name}${g}${v}a`, 0.25), jitter(`${c.name}${g}${v}b`, 0.35), jitter(`${c.name}${g}${v}c`, 0.5)],
    })));
  }
  const sets = c.platform === 'meta' ? ADSETS.meta.slice(0, c.kind === 'sales' ? 4 : 3) : c.kind === 'gmv' ? ['Product-GMV-Max'] : ADSETS.tiktok;
  const langs = c.market === 'my' ? ['EN', 'BM'] : ['EN'];
  return sets.flatMap((s, si) => [0, 1, 2].map(v => {
    const type = ['VID', 'IMG', 'CAR'][(si + v) % 3];
    const theme = THEMES[(si * 3 + v) % THEMES.length];
    const lang = langs[(si + v) % langs.length];
    const key = `${c.name}|${s}|${v}`;
    // One clear winner and loser per ad set: efficiency spread on ctr / views / cvr
    const spread = v === 0 ? 1.35 : v === 1 ? 1 : 0.62;
    return { adset: s, ad: `${type}_${theme}_${type === 'VID' ? (v % 2 ? '6s' : '15s') : `V${v + 1}`}_${lang}`, w: 0.6 + hash(`${key}w`) * 1.2,
      eff: [spread * jitter(`${key}a`, 0.1), spread * jitter(`${key}b`, 0.15), spread * jitter(`${key}c`, 0.2)], video: type === 'VID' };
  }));
}

// Google search: keyword -> search terms (with waste, overlap and movers)
const SEARCH_SG_BRAND = [
  ['Brand_Exact', 'brightleaf', 'EXACT', 9, ['brightleaf', 'brightleaf tea', 'brightleaf singapore']],
  ['Brand_Phrase', 'brightleaf matcha', 'PHRASE', 8, ['brightleaf matcha', 'brightleaf matcha latte', 'brightleaf promo code', 'brightleaf near me']],
];
const SEARCH_SG_GENERIC = [
  ['Matcha', 'matcha powder', 'BROAD', 6, ['matcha powder', 'best matcha powder singapore', 'ceremonial grade matcha', 'free matcha sample', 'matcha latte recipe', 'brightleaf matcha']],
  ['Matcha', 'matcha cold brew', 'PHRASE', 7, ['matcha cold brew', 'cold brew matcha bottle']],
  ['Green-Tea', 'green tea', 'PHRASE', 5, ['organic green tea', 'green tea bags', 'green tea benefits', 'green tea recipe', 'free green tea', 'japanese green tea']],
  ['Healthy-Drinks', 'healthy drinks', 'BROAD', 4, ['healthy drinks', 'healthy drinks for weight loss', 'low sugar drinks', 'healthy drinks recipe', 'kombucha']],
  ['Healthy-Drinks', 'tea gift set', 'EXACT', 7, ['tea gift set', 'brightleaf gift set']],
];
const SEARCH_MY = [
  ['Matcha', 'matcha powder', 'BROAD', 6, ['matcha powder', 'serbuk matcha', 'matcha murah', 'matcha latte recipe']],
  ['Green-Tea', 'green tea', 'PHRASE', 5, ['green tea malaysia', 'teh hijau', 'green tea benefits']],
];
// Term behaviour: cvr multiplier, share, and windows relative to today (movers)
const TERM_TRAITS = {
  'free matcha sample': { cvr: 0, w: 1.2 }, 'matcha latte recipe': { cvr: 0, w: 1.4 }, 'green tea benefits': { cvr: 0, w: 1.1 },
  'green tea recipe': { cvr: 0, w: 0.9 }, 'free green tea': { cvr: 0, w: 0.8 }, 'healthy drinks recipe': { cvr: 0, w: 0.7 },
  'kombucha': { cvr: 0.1, w: 0.9 }, 'brightleaf near me': { cvr: 0.2, w: 0.5 }, 'matcha murah': { cvr: 0, w: 0.8 },
  'ceremonial grade matcha': { cvr: 2.0, w: 0.6 }, 'cold brew matcha bottle': { cvr: 2.3, w: 0.7 },
  'matcha cold brew': { cvr: 1.6, w: 1.2, newDays: 6 },                 // new this week
  'brightleaf gift set': { cvr: 2.5, w: 0.9, untilDaysAgo: 9 },        // lost converter
  'organic green tea': { cvr: 1.3, w: 1.1, worseLastDays: 7 },          // getting worse
  'healthy drinks for weight loss': { cvr: 0.3, w: 1.0, betterLastDays: 7 }, // improving
  'brightleaf matcha': { cvr: 1.8, w: 1.2 }, 'matcha powder': { cvr: 1.1, w: 2.2 }, 'brightleaf': { cvr: 1.3, w: 3 },
};
// Amazon: targeting group -> search terms
const AMZ_SG = {
  auto: [['close-match', ['matcha powder', 'matcha', 'brightleaf matcha']], ['loose-match', ['green tea', 'tea bags', 'healthy drinks']],
    ['substitutes', ['matcha powder', 'b0c7k2xq1z', 'ceremonial matcha']], ['complements', ['bamboo whisk', 'matcha whisk set', 'coffee']]],
  manual: [['matcha powder', ['matcha powder', 'organic matcha powder']], ['green tea', ['green tea', 'japanese green tea']], ['brightleaf', ['brightleaf', 'brightleaf matcha']]],
};
const AMZ_JP = {
  auto: [['close-match', ['抹茶', '抹茶 パウダー', 'ブライトリーフ 抹茶']], ['loose-match', ['緑茶', 'グリーンティー', 'ほうじ茶']],
    ['substitutes', ['抹茶 パウダー', '抹茶 ラテ', 'コーヒー']], ['complements', ['茶筅', '抹茶 茶碗']]],
  manual: [['抹茶 パウダー', ['抹茶 パウダー', '抹茶 パウダー 無添加']], ['緑茶', ['緑茶', '緑茶 ティーバッグ']]],
};
const AMZ_TRAITS = { 'coffee': { cvr: 0, w: 0.9 }, 'tea bags': { cvr: 0.3 }, 'bamboo whisk': { cvr: 0.4 }, 'b0c7k2xq1z': { cvr: 1.4 }, 'ほうじ茶': { cvr: 0, w: 0.9 }, 'コーヒー': { cvr: 0, w: 0.8 }, 'brightleaf matcha': { cvr: 2 }, 'ブライトリーフ 抹茶': { cvr: 2 } };
export const DEMO_TRANSLATIONS = {
  '抹茶': 'matcha', '抹茶 パウダー': 'matcha powder', 'ブライトリーフ 抹茶': 'Brightleaf matcha', '緑茶': 'green tea', 'グリーンティー': 'green tea',
  'ほうじ茶': 'roasted green tea', '抹茶 ラテ': 'matcha latte', 'コーヒー': 'coffee', '茶筅': 'tea whisk', '抹茶 茶碗': 'matcha bowl',
  '抹茶 パウダー 無添加': 'matcha powder, additive-free', '緑茶 ティーバッグ': 'green tea bags',
};

function searchLeaves(c) {
  const list = c.kind === 'brandsearch' ? SEARCH_SG_BRAND : c.market === 'my' ? SEARCH_MY : SEARCH_SG_GENERIC;
  return list.flatMap(([group, kw, match, qs, terms]) => terms.map(t => {
    const tr = TERM_TRAITS[t] || {};
    const key = `${c.name}|${kw}|${t}`;
    return { adset: group, keyword: kw, match, qs, term: t, termMatch: match, w: (tr.w ?? 1) * (0.6 + hash(key)),
      eff: [jitter(`${key}a`, 0.2), jitter(`${key}b`, 0.25), tr.cvr ?? jitter(`${key}c`, 0.35)], traits: tr,
      isf: [jitter(`${key}is`, 0.25), jitter(`${key}rk`, 0.3)] };
  }));
}
function amazonLeaves(c) {
  const src = (c.market === 'jp' ? AMZ_JP : AMZ_SG)[/Auto/.test(c.name) ? 'auto' : 'manual'];
  return src.flatMap(([targeting, terms]) => terms.map(t => {
    const tr = AMZ_TRAITS[t] || {};
    const key = `${c.name}|${targeting}|${t}`;
    return { targeting, term: t, w: (tr.w ?? 1) * (0.5 + hash(key) * 1.5), eff: [jitter(`${key}a`, 0.2), jitter(`${key}b`, 0.25), tr.cvr ?? jitter(`${key}c`, 0.3)], traits: tr };
  }));
}
const leafCache = new Map();
function leavesOf(c, family) {
  const key = `${c.name}|${family}`;
  if (!leafCache.has(key)) leafCache.set(key, family === 'ad' ? adsFor(c) : family === 'kw' ? searchLeaves(c) : family === 'amz' ? amazonLeaves(c) : [{ w: 1, eff: [1, 1, 1] }]);
  return leafCache.get(key);
}

// Live on a day? (sale ads around their sale; movers' windows)
function leafLive(leaf, dayIso) {
  if (leaf.window) {
    const d = new Date(`${dayIso}T00:00:00Z`);
    const sale = Date.UTC(d.getUTCFullYear(), leaf.window.month - 1, leaf.window.month);
    const t = d.getTime();
    if (t < sale - 7 * DAY || t > sale + DAY) return false;
  }
  const tr = leaf.traits || {};
  const daysAgo = Math.round((Date.parse(yesterday()) - Date.parse(dayIso)) / DAY) + 1;
  if (tr.newDays && daysAgo > tr.newDays) return false;
  if (tr.untilDaysAgo && daysAgo < tr.untilDaysAgo) return false;
  return true;
}
function leafCvr(leaf, dayIso) {
  const tr = leaf.traits || {};
  const daysAgo = Math.round((Date.parse(yesterday()) - Date.parse(dayIso)) / DAY) + 1;
  if (tr.worseLastDays && daysAgo <= tr.worseLastDays) return leaf.eff[2] * 0.35;
  if (tr.betterLastDays) return daysAgo <= tr.betterLastDays ? 2.2 : leaf.eff[2];
  return leaf.eff[2];
}

// ---------------------------------------------------------------- dimensions
const AD_DIMS = new Set(['ad_name', 'fads_adset_name', 'ttads_adgroup_name', 'gadw_ad_group_name', 'gadw_ad_group_ad_ad_name', 'gadw_ad_group_ad_ad_id',
  'gadw_ad_group_ad_ad_type', 'fads_ad_creative_thumbnail_url', 'fads_ad_preview_shareable_link', 'ttads_video_cover_url']);
const KW_DIMS = new Set(['gadw_search_term_view_search_term', 'gadw_segments_keyword_info_text', 'gadw_segments_keyword_info_match_type',
  'gadw_ad_group_criterion_keyword_text', 'gadw_ad_group_criterion_match_type', 'gadw_ad_group_criterion_quality_info_quality_score']);
const AMZ_DIMS = new Set(['amazonads_search_term', 'amazonads_targeting_expression']);
// IDs that would link to real ad platforms: never generated
const NO_DATA_DIMS = /_campaign_id$|account_id|advertiser_id|conversion_action_name|result_values_performance_indicator/;

// A placeholder creative (SVG) for the top ads drawer
const PALETTE = ['#0f766e', '#7c3aed', '#c2410c', '#2563eb', '#be185d', '#15803d', '#a16207'];
function thumb(ad) {
  const col = PALETTE[Math.floor(hash(ad) * PALETTE.length)];
  const label = ad.split('_').slice(0, 2).join(' ').replace(/-/g, ' ').slice(0, 22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="160" height="160" fill="url(#g)"/><circle cx="118" cy="40" r="22" fill="#ffffff" opacity="0.18"/><text x="14" y="128" font-family="Arial" font-size="13" font-weight="700" fill="#ffffff">${label}</text><text x="14" y="146" font-family="Arial" font-size="10" fill="#ffffff" opacity="0.75">Brightleaf · demo</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function attrs(c, leaf, dayIso) {
  const adsetDim = c.platform === 'meta' ? 'fads_adset_name' : c.platform === 'tiktok' ? 'ttads_adgroup_name' : 'gadw_ad_group_name';
  const paused = c.status === 'paused', ended = c.status === 'ended';
  return {
    campaign_name: c.name, date: dayIso, year_month: dayIso.slice(0, 7),
    [adsetDim]: leaf.adset ?? '', ad_name: leaf.ad ?? '',
    gadw_ad_group_ad_ad_name: leaf.ad ?? '', gadw_ad_group_ad_ad_id: leaf.adId ?? '', gadw_ad_group_ad_ad_type: leaf.adType ?? '',
    fads_ad_creative_thumbnail_url: leaf.ad ? thumb(leaf.ad) : '', ttads_video_cover_url: leaf.ad ? thumb(leaf.ad) : '', fads_ad_preview_shareable_link: '',
    gadw_search_term_view_search_term: leaf.term ?? '', gadw_segments_keyword_info_text: leaf.keyword ?? '', gadw_segments_keyword_info_match_type: leaf.match ?? '',
    gadw_ad_group_criterion_keyword_text: leaf.keyword ?? '', gadw_ad_group_criterion_match_type: leaf.match ?? '', gadw_ad_group_criterion_quality_info_quality_score: leaf.qs ?? '',
    amazonads_search_term: leaf.term ?? '', amazonads_targeting_expression: leaf.targeting ?? '',
    fads_campaign_effective_status: paused ? 'PAUSED' : 'ACTIVE', fads_campaign_stop_time: c.end || '',
    ttads_campaign_operation_status: paused ? 'DISABLE' : 'ENABLE', ttads_campaign_secondary_status: paused ? 'CAMPAIGN_STATUS_DISABLE' : 'CAMPAIGN_STATUS_ENABLE',
    gadw_campaign_status: paused ? 'PAUSED' : 'ENABLED', gadw_campaign_serving_status: ended ? 'ENDED' : 'SERVING', gadw_campaign_end_date: c.end || '',
    amazonads_campaign_status: paused ? 'PAUSED' : 'ENABLED', amazonads_campaign_end_date: c.end || '',
  };
}

// ---------------------------------------------------------------- the query
function* days(range) {
  const last = Math.min(Date.parse(range.endDate), Date.parse(yesterday()));
  for (let t = Date.parse(range.startDate); t <= last; t += DAY) yield iso(t);
}
const matchFilter = (a, f) => {
  const v = String(a[f.fieldId] ?? ''), want = String(f.value ?? f.expression ?? '');
  if (f.operator === 'contains') return v.toLowerCase().includes(want.toLowerCase());
  if (f.operator === 'in') return want.split(',').map(s => s.trim()).includes(v);
  if (f.operator === 'notEquals') return v !== want;
  return v === want;
};

export function demoQuery({ accounts, metrics, dimensions = ['campaign_name'], dateRange, filters = [] }) {
  const dims = dimensions;
  if (dims.some(d => NO_DATA_DIMS.test(d))) return { data: [] };
  const family = dims.some(d => KW_DIMS.has(d)) ? 'kw' : dims.some(d => AMZ_DIMS.has(d)) ? 'amz' : dims.some(d => AD_DIMS.has(d)) ? 'ad' : 'campaign';
  const campaigns = CAT().filter(c => accounts.includes(c.account)
    && (family === 'kw' ? c.kind === 'search' || c.kind === 'brandsearch' : family === 'amz' ? c.platform === 'amazon' : family === 'ad' ? c.platform !== 'amazon' : true));
  const keywordLevel = dims.some(d => d.startsWith('gadw_ad_group_criterion') || d.startsWith('gadw_search_term') || d.startsWith('gadw_segments_keyword'));
  const groups = new Map();
  for (const c of campaigns) {
    const k = KIND[c.kind];
    const leaves = leavesOf(c, family);
    for (const day of days(dateRange)) {
      const T = dayTotals(c, day);
      if (!T) continue;
      const live = leaves.filter(l => leafLive(l, day));
      if (!live.length) continue;
      // Shares with a little daily movement, then efficiencies, each normalised to the campaign total
      const w = live.map((l, i) => l.w * jitter(`${c.name}|${day}|w${i}`, 0.12));
      const sw = w.reduce((a, b) => a + b, 0);
      const ri = live.map((l, i) => (w[i] / sw) * l.eff[0]); const si = ri.reduce((a, b) => a + b, 0);
      const imps = ri.map(v => (T.impr * v) / si);
      const rc = live.map((l, i) => imps[i] * l.eff[1]); const sc = rc.reduce((a, b) => a + b, 0);
      const clicks = rc.map(v => (sc > 0 ? (T.clicks * v) / sc : 0));
      const ro = live.map((l, i) => clicks[i] * leafCvr(l, day)); const so = ro.reduce((a, b) => a + b, 0);
      const orders = ro.map(v => (so > 0 ? (T.orders * v) / so : 0));
      live.forEach((leaf, i) => {
        const a = attrs(c, leaf, day);
        if (filters.length && !filters.every(f => matchFilter(a, f))) return;
        const rk = `${c.name}|${day}|${i}`;
        const imp = roundish(imps[i], `${rk}i`), clk = Math.min(imp, roundish(clicks[i], `${rk}c`)), ord = roundish(orders[i], `${rk}o`);
        if (!(imp > 0) && !(clk > 0)) return;
        const spend = T.spend * (w[i] / sw);
        const view = leaf.video === false ? 0.4 : leaf.eff[0];
        const key = dims.map(d => a[d] ?? '').join('\u0001');
        const g = groups.get(key) || { a, s: {} };
        const s = g.s;
        const add = (f, v) => { s[f] = (s[f] || 0) + v; };
        add('spend', spend); add('impr', imp); add('clicks', clk);
        add('lpv', roundish(clk * (k.lpv || 0), `${rk}l`));
        add('v3', roundish(imp * (k.v3 || 0) * view, `${rk}3`)); add('thru', roundish(imp * (k.thru || 0) * view, `${rk}t`));
        const plays = roundish(imp * (k.plays || 0) * view, `${rk}p`);
        add('plays', plays); add('watch', plays * (k.watch || 0) * jitter(`${rk}w`, 0.15));
        add('v6', roundish(imp * (k.v6 || 0) * view, `${rk}6`)); add('v15', roundish(imp * (k.v15 || 0) * view, `${rk}5`));
        add('reach', Math.round(imp / (k.freq || 2)));
        if (k.src) { add(`orders_${k.src}`, ord); add(`revenue_${k.src}`, T.orders > 0 ? ord * (T.revenue / T.orders) * jitter(`${rk}r`, 0.06) : 0); }
        if (c.kind === 'gmv') add('spend_gmv', spend);
        if (T.is) {
          const isf = leaf.isf || [1, 1];
          const share = Math.min(0.97, T.is[0] * isf[0]);
          const rank = Math.min(1 - share - 0.01, T.is[1] * isf[1]);
          const elig = imp / share;
          add('elig', elig); add('rankW', elig * rank); add('budgetW', elig * T.is[2]);
          add('topW', elig * share * 0.68); add('absTopW', elig * share * 0.36);
          add('eligClicks', clk / Math.min(0.97, share * 1.05));
        }
        groups.set(key, g);
      });
    }
  }
  const r2 = v => Math.round(v * 100) / 100;
  const data = [...groups.values()].map(({ a, s }) => {
    const row = {};
    for (const d of dims) row[d] = a[d] ?? '';
    const share = f => (s.elig > 0 ? r2((s[f] / s.elig) * 10000) / 10000 : '');
    const M = {
      amount_spent: r2((s.spend || 0) - (s.spend_gmv || 0)) || (s.spend_gmv ? '' : 0), impressions: s.impr || 0, clicks: s.clicks || 0,
      fads_reach: s.reach || 0, ttads_reach: s.reach || 0, fads_video_views: s.v3 || 0, fads_video_thruplay_watched_actions: s.thru || 0,
      fads_video_play_actions: s.plays || 0, ttads_video_play_actions: s.plays || 0,
      fads_video_average_watch_time: s.plays > 0 ? r2(s.watch / s.plays) : 0, ttads_average_video_play: s.plays > 0 ? r2(s.watch / s.plays) : 0,
      fads_website_fb_landing_page_views: s.lpv || 0, ttads_total_landing_page_view: s.lpv || 0,
      fads_all_purchases: s.orders_meta || 0, fads_purchase_conversions_all: r2(s.revenue_meta || 0), fads_lead: 0,
      ttads_gmv_cost: r2(s.spend_gmv || 0), ttads_gmv_orders: s.orders_gmv || 0, ttads_gmv_gross_revenue: r2(s.revenue_gmv || 0),
      ttads_video_watched_6s: s.v6 || 0, ttads_engaged_view_15s: s.v15 || 0,
      conversions: s.orders_google || 0, gadw_metrics_conversions_value: r2(s.revenue_google || 0),
      amazonads_cost: r2(s.spend || 0), amazonads_total_purchases: s.orders_amazon || 0, amazonads_total_sales: r2(s.revenue_amazon || 0),
      fads_collab_action_omni_purchase: s.orders_cpas || 0, fads_collab_ads_value_omni_purchase: r2(s.revenue_cpas || 0),
      gadw_metrics_search_impression_share: s.elig > 0 ? r2((s.impr / s.elig) * 10000) / 10000 : '',
      gadw_metrics_search_rank_lost_impression_share: share('rankW'),
      gadw_metrics_search_budget_lost_impression_share: keywordLevel ? '' : share('budgetW'),
      gadw_metrics_search_top_impression_share: share('topW'), gadw_metrics_search_absolute_top_impression_share: share('absTopW'),
      gadw_metrics_search_click_share: s.eligClicks > 0 ? r2((s.clicks / s.eligClicks) * 10000) / 10000 : '',
    };
    for (const m of metrics) row[m] = M[m] ?? 0;
    return row;
  });
  return { data };
}

// ---------------------------------------------------------------- sheets
const fmtDate = isoDay => { const [y, m, d] = isoDay.split('-'); return `${Number(d)}/${Number(m)}/${y}`; };
const SYMBOL = { 1: 'S$', 3.3: 'RM', 110: '¥' };
const money = (v, fx) => `${SYMBOL[fx] || 'S$'}${v.toLocaleString('en-US', { minimumFractionDigits: fx === 110 ? 0 : 2, maximumFractionDigits: fx === 110 ? 0 : 2 })}`;
const MARKET_NAME = { sg: 'Singapore', my: 'Malaysia', jp: 'Japan' };
const PLATFORM_NAME = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', amazon: 'Amazon' };
const pctText = v => `${Math.round(v * 100)}%`;
function totals(c, start, end) {
  const t = { spend: 0, impr: 0, clicks: 0, lpv: 0, v6: 0, thru: 0 };
  const k = KIND[c.kind];
  for (const d of days({ startDate: start, endDate: end })) {
    const T = dayTotals(c, d);
    if (!T) continue;
    t.spend += T.spend; t.impr += T.impr; t.clicks += T.clicks; t.lpv += T.clicks * (k.lpv || 0);
    t.v6 += T.impr * (k.v6 || 0) * 1.05; t.thru += T.impr * (k.thru || 0) * 1.05;
  }
  return t;
}
const monthFlight = () => {
  const y = new Date(Date.parse(yesterday()));
  const start = iso(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1));
  const end = iso(Date.UTC(y.getUTCFullYear(), y.getUTCMonth() + 1, 0));
  return { start, end };
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
const modelOf = name => (name.match(/_(CPLV|CPM|CPV|CPA|ROAS|ROI|CPC)_/) || [])[1] || '';

function pacingTab(commerce) {
  const header = ['Brand', 'Market', 'Platform', 'Campaign Name', 'Ad Name', 'Model', 'Start Date', 'End Date', 'Status', 'Budget', 'Spend to Date', 'Pacing Date',
    'Time Pacing', 'Spend Pacing', 'Overall Pacing', 'Ideal Daily Spend', 'Equal Spend', 'Opti Notes'];
  const pd = yesterday();
  const fl = monthFlight();
  const rows = [['MajorPace · Brightleaf (demo)'], [], header];
  const NOTES = ['', 'Shifted budget to best ad set', '', 'Raise bids on top keywords', 'New creatives going live Monday', ''];
  for (const c of CAT()) {
    if (COMMERCE_KINDS.has(c.kind) !== commerce) continue;
    const pick = hash(`${c.name}|pace`);
    // Ended flights: the October promo is still marked LIVE in the sheet (needs a status check)
    if (c.status === 'ended') {
      const t = totals(c, c.start, c.end);
      rows.push(['Brightleaf', MARKET_NAME[c.market], PLATFORM_NAME[c.platform], c.name, '', modelOf(c.name), fmtDate(c.start), fmtDate(c.end), 'LIVE',
        money(t.spend * 0.97, c.fx), money(t.spend, c.fx), fmtDate(pd), '100%', pctText(1 / 0.97), pctText(1 / 0.97), '-', '-', 'Flight ended, update status']);
      continue;
    }
    const start = c.start > fl.start ? c.start : fl.start;
    const total = daysBetween(start, fl.end), elapsed = Math.min(total, daysBetween(start, pd));
    const t = totals(c, start, pd);
    const time = elapsed / total;
    // Budget so pacing lands on track, over or under (a mix, as in real life)
    const factor = (pick < 0.5 ? 1 + (pick - 0.25) * 0.24 : pick < 0.72 ? 0.74 : pick < 0.9 ? 1.42 : 1.75) * jitter(`${c.name}|pace2`, 0.07);
    const budget = (t.spend / Math.max(time, 0.01)) * factor;
    const spendPace = budget > 0 ? t.spend / budget : 0;
    const status = c.status === 'paused' ? 'Paused' : 'LIVE';
    const remaining = Math.max(0, budget - t.spend), left = Math.max(1, total - elapsed);
    rows.push(['Brightleaf', MARKET_NAME[c.market], PLATFORM_NAME[c.platform], c.name, '', modelOf(c.name), fmtDate(start), fmtDate(fl.end), status,
      money(budget, c.fx), money(t.spend, c.fx), fmtDate(pd), pctText(time), pctText(spendPace), pctText(spendPace / Math.max(time, 0.01)),
      money(remaining / left, c.fx), money(budget / total, c.fx), NOTES[Math.floor(pick * NOTES.length)]]);
  }
  // Next month's festive burst: scheduled
  if (!commerce) {
    const ny = new Date(Date.parse(fl.end) + DAY);
    const s = iso(ny.getTime()), e = iso(Date.UTC(ny.getUTCFullYear(), ny.getUTCMonth() + 1, 0));
    rows.push(['Brightleaf', 'Singapore', 'Meta', `SG_Meta_Brightleaf_Awareness_CPM_Reach_${ny.getUTCFullYear()}_${MONTHS[ny.getUTCMonth()]}-Festive`, '', 'CPM',
      fmtDate(s), fmtDate(e), 'Scheduled', money(4500, 1), '-', fmtDate(pd), '-', '-', '-', '-', money(4500 / daysBetween(s, e), 1), 'Creatives approved']);
  }
  return rows;
}

function goalsTab() {
  const header = ['#', 'Brand', 'Market', 'Platform', 'Campaign Name', 'Ad Name', 'Model', 'Start Date', 'End Date', 'Goal', 'Currency', 'Status'];
  const rows = [['Goals · Brightleaf (demo)'], header];
  const fl = monthFlight();
  const pd = yesterday();
  for (const c of CAT()) {
    if (COMMERCE_KINDS.has(c.kind) || c.platform === 'amazon') continue;
    const model = modelOf(c.name);
    if (!['CPM', 'CPLV', 'CPV'].includes(model)) continue;
    if (c.platform === 'google' && model === 'CPV') continue; // YouTube views are not in the goal metrics
    const start = c.status === 'ended' ? c.start : (c.start > fl.start ? c.start : fl.start);
    const end = c.status === 'ended' ? c.end : fl.end;
    const t = totals(c, start, c.status === 'ended' ? c.end : pd);
    const actual = model === 'CPM' ? (t.spend / Math.max(1, t.impr)) * 1000 : model === 'CPLV' ? t.spend / Math.max(1, t.lpv)
      : t.spend / Math.max(1, c.platform === 'tiktok' ? t.v6 : t.thru);
    // Some goals met comfortably, some just, some missed
    const pick = hash(`${c.name}|goal`);
    const goal = actual * (pick < 0.45 ? 1.18 : pick < 0.7 ? 1.03 : 0.84);
    rows.push(['', 'Brightleaf', MARKET_NAME[c.market], PLATFORM_NAME[c.platform], c.name, '', model, fmtDate(start), fmtDate(end),
      `${SYMBOL[c.fx] || 'S$'}${goal.toFixed(goal < 1 ? 3 : 2)}`,
      c.fx === 3.3 ? 'MYR' : 'SGD', c.status === 'ended' ? 'Ended' : 'Live']);
  }
  return rows;
}

const FX_TAB = [['FOREX'], ['Currency', 'Exchange Rate (SGD per unit)'], ['SGD', '1'], ['MYR', '0.30'], ['JPY', '0.0088']];

// Sheet tabs for the demo client: goals, pacing (Brand / Ecomm), FX
export function demoSheet(gid) {
  if (gid === 'demo-goals') return goalsTab();
  if (gid === 'demo-pacing-brand') return pacingTab(false);
  if (gid === 'demo-pacing-ecomm') return pacingTab(true);
  return FX_TAB;
}

// Market of a demo campaign: its name prefix
export const demoMarket = name => (/^(SG|MY|JP)_/i.exec(String(name || '')) || [])[1]?.toLowerCase() || 'sg';
