export const LIGHT = {
  bg: '#f8f8f6',
  surface: '#ffffff',
  surfaceHover: '#fafafa',
  surfaceAlt: '#f4f4f2',
  border: '#e6e5e2',
  borderStrong: '#d0cec9',
  textPrimary: '#0f0f0e',
  textSecondary: '#4d4b48',
  textMuted: '#9a9793',
  accent: '#1e2f4d',
  accentLight: '#e8ecf3',
  dragHandle: '#ccc9c4',
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

export function fmt(value, type) {
  if (value == null || (typeof value === 'number' && !isFinite(value))) return '—';
  switch (type) {
    case 'currency':
      return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'compact-currency':
      return value >= 1000
        ? `$${(value / 1000).toFixed(1)}k`
        : `$${value.toFixed(2)}`;
    case 'number':
      return Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toFixed(2)}%`;
    default:
      return String(value);
  }
}
