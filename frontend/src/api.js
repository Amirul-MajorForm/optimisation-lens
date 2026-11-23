// Every request is for the selected client (see clients.js); the server
// defaults to OATSIDE when no client is given.
let currentClient = 'oatside';
export const setApiClient = id => { currentClient = id; };
const withClient = url => `${url}${url.includes('?') ? '&' : '?'}client=${encodeURIComponent(currentClient)}`;

// A 401 means the session ended (logged out elsewhere, or removed): back to login
let onUnauthorized = null;
export const setOnUnauthorized = fn => { onUnauthorized = fn; };
async function apiFetch(url, opts) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts });
  if (res.status === 401) onUnauthorized?.();
  return res;
}

// Login: { user, authRequired }. authRequired false = login is switched off.
export async function fetchMe() {
  const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (res.status === 401) return { user: null, authRequired: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
export const logout = () => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});

// Welcome page: top pacing flags / performance flags across every client
export async function fetchFlags(signal, kind = 'pacing') {
  const res = await apiFetch(kind === 'performance' ? '/api/flags/performance' : '/api/flags', { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function getJSON(path, { dateRange, startDate, endDate }, signal, extra = {}) {
  const params = new URLSearchParams({ dateRange: String(dateRange), ...extra });
  if (startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  const res = await apiFetch(withClient(`${path}?${params}`), { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Brand Lens: non-CPAS accounts (plus _Sales_ / _Conversion_ campaigns split out for Commerce Lens)
export const fetchDashboard = (params, signal) => getJSON('/api/dashboard', params, signal);

// Brand Lens goal tracking: goals from the MajorPace sheet scored for this range
export const fetchGoals = (params, signal, { trend = false } = {}) =>
  getJSON('/api/goals', params, signal, trend ? { trend: '1' } : {});

// Drill-down: a campaign's ad sets, or (with adset) an ad set's ads
export const fetchDrill = (params, { platform, lens, campaign, adset, scope }, signal) =>
  getJSON('/api/drill', params, signal, { platform, lens, campaign, ...(adset ? { adset } : {}), ...(scope ? { scope } : {}) });

// Campaign status (ended / paused / removed) per platform, for greying out rows
export const fetchStatus = (params, signal) => getJSON('/api/status', params, signal);

// Search Lens: Google keywords / search terms + Amazon search terms (all markets)
export const fetchSearch = (params, signal) => getJSON('/api/search', params, signal);

// Pacing Lens: MajorPace sheet rows; platform links load separately (slower)
export async function fetchPacing(signal, fresh = false) {
  const res = await apiFetch(withClient(`/api/pacing${fresh ? '?fresh=1' : ''}`), { signal });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
  return res.json();
}
export async function fetchPacingLinks(signal) {
  const res = await apiFetch(withClient('/api/pacing/links'), { signal });
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `HTTP ${res.status}`); }
  return res.json();
}

// Campaign trend chart: daily data for one campaign, requested only when opened
export const fetchTrend = (params, { campaign, platform, lens, lpv = false, rev = false }, signal) =>
  getJSON('/api/trend', params, signal, { campaign, platform, lens, ...(lpv ? { lpv: '1' } : {}), ...(rev ? { rev: '1' } : {}) });

// Commerce Lens header chart: monthly totals since the start of the year,
// independent of the date filter
export async function fetchCommerceMonthly(signal) {
  const res = await apiFetch(withClient('/api/commerce/monthly'), { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Sales Lens: mega-sale periods for one market (Meta CPAS), since start of year
export async function fetchSales(market, signal) {
  const res = await apiFetch(withClient(`/api/sales?market=${encodeURIComponent(market)}`), { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Top ads drawer: ad-level results with thumbnails, loaded when opened
export const fetchTopAds = (params, { market, lens }, signal) =>
  getJSON('/api/top-ads', params, signal, { market, lens });

// Commerce Lens: Meta CPAS accounts, only requested when the tab is opened
export const fetchCommerce = (params, signal) => getJSON('/api/commerce', params, signal);
