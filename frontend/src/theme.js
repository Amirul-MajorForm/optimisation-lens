export const LIGHT = {
  bg: '#edf2f7',
  surface: '#ffffff',
  surfaceHover: '#f8fafc',
  surfaceAlt: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  accent: '#2563eb',
  accentLight: '#dbeafe',
  dragHandle: '#cbd5e1',
};

export const DARK = {
  bg: '#080d1a',
  surface: '#111827',
  surfaceHover: '#1a2235',
  surfaceAlt: '#162032',
  border: '#1f2d45',
  borderStrong: '#2d3f5a',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#3b82f6',
  accentLight: '#1e3a5f',
  dragHandle: '#334155',
};

// Validated categorical palette: blue / amber / emerald
// Well-separated across deuteranopia / protanopia on the blue-yellow axis
export const CHART = {
  spend: '#2563eb',   // blue-600
  cpl: '#d97706',     // amber-600
  ctr: '#059669',     // emerald-600
  meta: '#1877F2',    // Meta brand blue
  google: '#EA4335',  // Google brand red
};

export const METRIC_META = {
  spend: { label: 'Spend', color: CHART.spend, format: 'currency' },
  cpl:   { label: 'CPL',   color: CHART.cpl,   format: 'currency' },
  ctr:   { label: 'CTR',   color: CHART.ctr,   format: 'percent' },
};

// Currencies with no minor unit in practice: show whole numbers
const ZERO_DECIMAL = new Set(['VND', 'IDR']);

export function fmt(value, type, currency) {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '—';
  switch (type) {
    case 'currency': {
      const dp = ZERO_DECIMAL.has(currency) ? 0 : 2;
      const num = Number(value).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
      return currency ? `${currency} ${num}` : `$${num}`;
    }
    case 'compact-currency':
      return value >= 1000
        ? `$${(value / 1000).toFixed(1)}k`
        : `$${value.toFixed(2)}`;
    case 'number':
      return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toFixed(2)}%`;
    case 'seconds':
      return `${Number(value).toFixed(1)}s`;
    case 'roas':
      return `${Number(value).toFixed(2)}x`;
    case 'compact': {
      const n = Number(value);
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    default:
      return String(value);
  }
}
