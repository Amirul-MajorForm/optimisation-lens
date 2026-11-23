// Clients the dashboard serves. Each request carries ?client=<id> (default
// OATSIDE); the server runs the whole request "inside" that client, so the
// account lists, markets and sheet tabs that the rest of the code reads
// (MARKETS, ACCOUNTS, ... in tmr.js) are the selected client's, and cache keys
// are prefixed with the client so two clients' data never mix.

import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------- OATSIDE
// Account currency per platform, as reported by each ad account in TMR.
// TMR returns spend/CPM/CPC in the account's own currency (no conversion).
// All TikTok and Google accounts bill in SGD; Meta bills in local currency.
const OATSIDE = {
  id: 'oatside',
  name: 'OATSIDE',
  markets: {
    sg: { name: 'OATSIDE SG', currency: { tiktok: 'SGD', meta: 'SGD', google: 'SGD', amazon: 'SGD' } },
    my: { name: 'OATSIDE MY', currency: { tiktok: 'SGD', meta: 'MYR', google: 'SGD' } },
    ph: { name: 'OATSIDE PH', currency: { tiktok: 'SGD', meta: 'PHP', google: 'SGD' } },
    vn: { name: 'OATSIDE VN', currency: { tiktok: 'SGD', meta: 'VND', google: 'SGD' } },
    id: { name: 'OATSIDE ID', currency: { tiktok: 'SGD', meta: 'IDR', google: 'SGD' } },
    th: { name: 'OATSIDE TH', currency: { tiktok: 'SGD', meta: 'THB', google: 'SGD' } },
    // Japan: Amazon only (Commerce Lens)
    jp: { name: 'OATSIDE JP', currency: { tiktok: 'SGD', meta: 'SGD', google: 'SGD', amazon: 'JPY' } },
  },
  // Brand (non-CPAS) accounts per platform and market
  accounts: {
    tiktok: {
      sg: 'ttads_7216573742091091970',
      my: 'ttads_7421836044171132944',
      ph: 'ttads_7337602518762930178',
      vn: 'ttads_7539818342035931137',
      id: 'ttads_7558728389196365825',
      th: 'ttads_7601715326036017169',
    },
    meta: {
      sg: 'fads_act_764971328270854',
      my: 'fads_act_480865091512259',
      ph: 'fads_act_1073423930376728',
      vn: 'fads_act_2540917533074538',
      id: 'fads_act_360540913050861',
      th: 'fads_act_392347893765489',
    },
    google: {
      sg: 'gadw_3685435931',
      vn: 'gadw_8618833919',
    },
  },
  // Accounts queried in the bulk platform requests but not tied to one market
  extraAccounts: {},
  // Amazon Ads (Commerce Lens) marketplace profiles. Queried together; each
  // campaign's market comes from its name (JP_..., SG_...) like other platforms,
  // and its currency from markets[market].currency.amazon.
  amazon: [
    'amazonads_1325552030347508-JP', // Amazon Japan (JPY)
    'amazonads_1916425481164095-SG', // Amazon Singapore (SGD)
  ],
  // Every Meta account with "CPAS" in its name, shown under Commerce Lens.
  // Grouped by billing currency so every row in one TMR request shares a currency:
  //   local: billed in the market's own Meta currency (see markets[x].currency.meta)
  //   SGD:   billed in SGD even though the market is outside Singapore
  // SG Redmart and PH Lazada have never had data in TMR, so their currency is
  // unconfirmed; they are assumed to bill in local currency (SGD / PHP).
  cpas: {
    local: [
      'fads_act_1925389034916546', // SG Shopee (SGD)
      'fads_act_674743694682068',  // SG Shopee - DNU (SGD, historical)
      'fads_act_335142002450041',  // SG Redmart (assumed SGD, no data yet)
      'fads_act_1001057058029561', // MY Shopee (MYR)
      'fads_act_1324603498206088', // PH Shopee (PHP)
      'fads_act_2011132199258393', // PH Lazada (assumed PHP, no data yet)
      'fads_act_1196047278954896', // VN Shopee (VND)
      'fads_act_343672155283730',  // ID Lazada (IDR)
      'fads_act_1437746287146983', // ID Shopee (IDR)
      'fads_act_292204293382312',  // ID Tokopedia (IDR)
    ],
    SGD: [
      'fads_act_730983682111075',  // ID Tokopedia (SGD)
      'fads_act_271434125229951',  // ID Tokopedia (SGD)
      'fads_act_186600104319744',  // TH Lazada (SGD)
      'fads_act_742104760960709',  // TH Lazada (SGD)
      'fads_act_3517635831788796', // TH Shopee (SGD)
    ],
  },
  // Market of each CPAS account (used to query only the right accounts for a chart)
  cpasMarket: {
    fads_act_1925389034916546: 'sg', fads_act_674743694682068: 'sg', fads_act_335142002450041: 'sg',
    fads_act_1001057058029561: 'my',
    fads_act_1324603498206088: 'ph', fads_act_2011132199258393: 'ph',
    fads_act_1196047278954896: 'vn',
    fads_act_343672155283730: 'id', fads_act_1437746287146983: 'id', fads_act_292204293382312: 'id',
    fads_act_730983682111075: 'id', fads_act_271434125229951: 'id',
    fads_act_186600104319744: 'th', fads_act_742104760960709: 'th', fads_act_3517635831788796: 'th',
  },
  // MajorPace sheet: goals tab, pacing tabs (and the rows to keep)
  goalsTab: process.env.GOALS_BRAND_GID || '116061889', // "Pacing - OS Brand"
  pacingTabs: {
    Brand: process.env.PACING_BRAND_GID || '116061889', // "Pacing - OS Brand"
    Ecomm: process.env.PACING_ECOMM_GID || '46516630',  // "Pacing - OS Ecomm"
  },
  pacingRow: null, // every row of those tabs
  // Market from a campaign name: the first "XX_" that is a market code (SG_, MY_ ...)
  detectMarket: null,
};

// ---------------------------------------------------------------- MoveRepeat
// Yoga Movement (Singapore, Hong Kong) and Strong Pilates (Singapore). Every
// account bills in SGD. "Markets" here are brand + country, so the market
// switcher reads YM SG / YM HK / Strong SG.
const SGD_ALL = { tiktok: 'SGD', meta: 'SGD', google: 'SGD', amazon: 'SGD' };
const MOVEREPEAT = {
  id: 'moverepeat',
  name: 'MoveRepeat',
  markets: {
    'ym-sg':     { name: 'Yoga Movement SG', currency: SGD_ALL },
    'ym-hk':     { name: 'Yoga Movement HK', currency: SGD_ALL },
    'strong-sg': { name: 'Strong Pilates SG', currency: SGD_ALL },
  },
  accounts: {
    tiktok: {},
    meta: {
      'ym-sg': 'fads_act_60873128',            // Yoga Movement Singapore
      'ym-hk': 'fads_act_666018586240602',     // Yoga Movement Hong Kong
      'strong-sg': 'fads_act_1297936051774061', // Strong Pilates Singapore
    },
    google: {
      'ym-sg': 'gadw_1964271419', // Yoga Movement Singapore
      'ym-hk': 'gadw_2139410672', // Yoga Movement Hong Kong
    },
  },
  // Strong has a second Meta account ("STRONG Pilates Singapore"): queried too
  extraAccounts: { meta: ['fads_act_1560783511490229'] },
  amazon: [],
  cpas: { local: [], SGD: [] },
  cpasMarket: {},
  // Google: count only the "Purchase (www.yogamovement.com/classes/purchase-success)"
  // conversion action. Google's primary "Conversions" also include
  // "Purchase (/classes/purchase)", a purchase page view (~90% of the total).
  googleConversionAction: /purchase-success/i,
  goalsTab: null, // no goals yet: the "Pacing" tab has no Goal / Model columns
  pacingTabs: { MoveRepeat: process.env.MOVEREPEAT_PACING_GID || '0' }, // "Pacing" (shared with other clients)
  // Keep only MoveRepeat's rows of the shared "Pacing" tab
  pacingRow: r => /yoga movement|strong/i.test(`${r.brand} ${r.campaign}`),
  // Brand + country from a campaign name, e.g. SG_Meta_STRONG_..., HK_Meta_Yoga Movement_...
  detectMarket: name => {
    const s = String(name || '');
    const country = /(^|[^a-z])hk[_\s]/i.test(s) || /hong kong/i.test(s) ? 'hk' : 'sg';
    if (/strong/i.test(s)) return 'strong-sg';
    return country === 'hk' ? 'ym-hk' : 'ym-sg';
  },
};

export const CLIENTS = { oatside: OATSIDE, moverepeat: MOVEREPEAT };
export const DEFAULT_CLIENT = 'oatside';

// ---------------------------------------------------------------- request context
const store = new AsyncLocalStorage();
export const currentClient = () => store.getStore() || CLIENTS[DEFAULT_CLIENT];
export const runWithClient = (id, fn) => store.run(CLIENTS[id] || CLIENTS[DEFAULT_CLIENT], fn);

// A live view of a value that depends on the current client. Reads (including
// spreading, Object.entries and JSON.stringify for arrays) see the selected
// client's value at the time of the read.
export function live(get, isArray = false) {
  return new Proxy(isArray ? [] : {}, {
    get: (_, k) => Reflect.get(get(), k),
    has: (_, k) => k in get(),
    ownKeys: () => [...new Set([...Reflect.ownKeys(get()), ...(isArray ? ['length'] : [])])],
    getOwnPropertyDescriptor: (_, k) => {
      if (isArray && k === 'length') return { value: get().length, writable: true, enumerable: false, configurable: false };
      const d = Reflect.getOwnPropertyDescriptor(get(), k);
      if (d) d.configurable = true;
      return d;
    },
  });
}
