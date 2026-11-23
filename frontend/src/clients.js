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
    // Sidebar colours, so it is obvious which client is open: navy
    sidebar: { bg: '#0d1f35', hover: '#152a42', active: '#1d3659', border: '#1a3050', text: '#7099be', label: '#3d6080', accent: '#3b82f6' },
    // Accent for the logo, highlights, market buttons and charts (light / dark mode)
    accent: {
      light: { accent: '#2563eb', accentLight: '#dbeafe', grad: ['#2563eb', '#7c3aed'], chart: '#2563eb' },
      dark:  { accent: '#3b82f6', accentLight: '#1e3a5f', grad: ['#2563eb', '#7c3aed'], chart: '#60a5fa' },
    },
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
    // Top charts in Performance Lens: Strong runs lead campaigns (Leads + CPL);
    // Yoga Movement counts conversions (Google: purchase success) + CPA
    performanceTopline: { 'strong-sg': 'leads' },
    topAdsOnCommerce: false,
    // plum
    sidebar: { bg: '#23123a', hover: '#2e1a4b', active: '#3c2461', border: '#33204e', text: '#b39ad6', label: '#7a5ea3', accent: '#a78bfa' },
    accent: {
      light: { accent: '#7c3aed', accentLight: '#ede9fe', grad: ['#7c3aed', '#c026d3'], chart: '#7c3aed' },
      dark:  { accent: '#a78bfa', accentLight: '#3b2a5c', grad: ['#7c3aed', '#c026d3'], chart: '#a78bfa' },
    },
  },
  blackmores: {
    id: 'blackmores',
    name: 'Blackmores',
    // TikTok GMV Max only: Commerce (GMV campaigns), Sales (mega-sale days), Pacing
    lenses: ['commerce', 'sales', 'pacing'],
    lensLabels: {},
    markets: [{ value: 'sg', label: 'SG' }],
    commerceVariant: 'commerce',
    topAdsOnCommerce: false,
    // deep green
    sidebar: { bg: '#0f2618', hover: '#163423', active: '#1f4630', border: '#1b3a27', text: '#86b89a', label: '#4b7d5e', accent: '#34d399' },
    accent: {
      light: { accent: '#059669', accentLight: '#d1fae5', grad: ['#059669', '#0d9488'], chart: '#059669' },
      dark:  { accent: '#34d399', accentLight: '#164032', grad: ['#059669', '#0d9488'], chart: '#34d399' },
    },
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
