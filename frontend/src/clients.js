// Clients in MajorView. OATSIDE is the default; the choice is kept in the page
// address (?client=moverepeat, so a shared link opens the same client) and in
// this browser for next time.

export const CLIENTS = {
  oatside: {
    id: 'oatside',
    name: 'OATSIDE',
    lenses: ['brand', 'commerce', 'sales', 'search', 'pacing'],
    lensLabels: {},
    // Market switcher; "optional" markets only show when they have data
    markets: [
      { value: 'sg', label: 'SG' },
      { value: 'my', label: 'MY' },
      { value: 'ph', label: 'PH' },
      { value: 'vn', label: 'VN' },
      { value: 'id', label: 'ID', optional: true },
      { value: 'th', label: 'TH', optional: true },
      { value: 'jp', label: 'JP', optional: true },
    ],
    commerceVariant: 'commerce', // Commerce Lens columns: revenue / ROAS / orders
    topAdsOnCommerce: true,      // Top ads on Commerce Lens (Meta CPAS ads)
  },
  moverepeat: {
    id: 'moverepeat',
    name: 'MoveRepeat',
    lenses: ['brand', 'commerce', 'search', 'pacing'],
    // Its conversion campaigns are leads / class purchases, not marketplace sales
    lensLabels: { commerce: 'Performance Lens' },
    markets: [
      { value: 'ym-sg', label: 'YM SG' },
      { value: 'ym-hk', label: 'YM HK' },
      { value: 'strong-sg', label: 'Strong SG' },
    ],
    commerceVariant: 'performance', // leads / CPL / conversions / CPA
    topAdsOnCommerce: false,
  },
};
export const DEFAULT_CLIENT = 'oatside';
export const CLIENT_LIST = Object.values(CLIENTS);

const STORAGE_KEY = 'majorview.client';
export function initialClient() {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('client');
    if (fromUrl && CLIENTS[fromUrl]) return fromUrl;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && CLIENTS[saved]) return saved;
  } catch { /* storage unavailable: default */ }
  return DEFAULT_CLIENT;
}
export function rememberClient(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
    const url = new URL(window.location.href);
    if (id === DEFAULT_CLIENT) url.searchParams.delete('client'); else url.searchParams.set('client', id);
    window.history.replaceState(null, '', url);
  } catch { /* ignore */ }
}
