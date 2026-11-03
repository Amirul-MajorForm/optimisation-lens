export async function fetchDashboard({ dateRange, startDate, endDate }, signal) {
  const params = new URLSearchParams({ dateRange: String(dateRange) });
  if (dateRange === 'custom' && startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  const res = await fetch(`/api/dashboard?${params}`, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}
