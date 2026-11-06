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

// Campaign trend chart: daily data for one campaign, requested only when opened
export const fetchTrend = (params, { campaign, platform, lens }, signal) =>
  getJSON('/api/trend', params, signal, { campaign, platform, lens });

// Commerce Lens: Meta CPAS accounts, only requested when the tab is opened
export const fetchCommerce = (params, signal) => getJSON('/api/commerce', params, signal);
