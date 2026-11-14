async function getJSON(path, { dateRange, startDate, endDate }, signal, extra = {}) {
  const params = new URLSearchParams({ dateRange: String(dateRange), ...extra });
  if (startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  const res = await fetch(`${path}?${params}`, { signal });
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

// Campaign trend chart: daily data for one campaign, requested only when opened
export const fetchTrend = (params, { campaign, platform, lens, lpv = false, rev = false }, signal) =>
  getJSON('/api/trend', params, signal, { campaign, platform, lens, ...(lpv ? { lpv: '1' } : {}), ...(rev ? { rev: '1' } : {}) });

// Commerce Lens header chart: monthly totals since the start of the year,
// independent of the date filter
export async function fetchCommerceMonthly(signal) {
  const res = await fetch('/api/commerce/monthly', { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Sales Lens: mega-sale periods for one market (Meta CPAS), since start of year
export async function fetchSales(market, signal) {
  const res = await fetch(`/api/sales?market=${encodeURIComponent(market)}`, { signal });
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
