async function getJSON(path, { dateRange, startDate, endDate }, signal) {
  const params = new URLSearchParams({ dateRange: String(dateRange) });
  if (dateRange === 'custom' && startDate && endDate) {
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

// Brand Lens: non-CPAS accounts (plus "Sales" campaigns split out for Commerce Lens)
export const fetchDashboard = (params, signal) => getJSON('/api/dashboard', params, signal);

// Commerce Lens: Meta CPAS accounts, only requested when the tab is opened
export const fetchCommerce = (params, signal) => getJSON('/api/commerce', params, signal);
