import { CHART, fmt } from '../theme.js';

function MetricRow({ label, value, format, theme }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '9px 0',
      borderBottom: `1px solid ${theme.border}`,
    }}>
      <span style={{ fontSize: 13, color: theme.textSecondary }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>
        {fmt(value, format)}
      </span>
    </div>
  );
}

const SKELETON_ROWS = [1, 2, 3, 4, 5, 6];

export default function PlatformTile({ theme, platform, data, loading }) {
  const isMeta = platform === 'Meta';
  const color = isMeta ? CHART.meta : CHART.google;

  const metaMetrics = [
    { label: 'Spend', value: data?.spend, format: 'currency' },
    { label: 'Impressions', value: data?.impressions, format: 'number' },
    { label: 'Clicks', value: data?.clicks, format: 'number' },
    { label: 'CTR', value: data?.ctr, format: 'percent' },
    { label: 'Leads', value: data?.leads, format: 'number' },
    { label: 'CPL', value: data?.cpl, format: 'currency' },
    { label: 'CPM', value: data?.cpm, format: 'currency' },
    { label: 'Link Page Views', value: data?.lpv, format: 'number' },
  ];

  const googleMetrics = [
    { label: 'Spend', value: data?.spend, format: 'currency' },
    { label: 'Impressions', value: data?.impressions, format: 'number' },
    { label: 'Clicks', value: data?.clicks, format: 'number' },
    { label: 'CTR', value: data?.ctr, format: 'percent' },
    { label: 'Conversions', value: data?.conversions, format: 'number' },
    { label: 'CPL', value: data?.cpl, format: 'currency' },
  ];

  const metrics = isMeta ? metaMetrics : googleMetrics;

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      transition: 'background 0.25s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: color + '20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isMeta ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill={color}>
              <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5c-3.9 0-7 3.1-7 7s3.1 7 7 7c3.3 0 6.1-2.3 6.8-5.4H12V9.6h7.4c.1.5.2.9.2 1.4 0 5-3.6 8.4-8.2 8.4-4.8 0-8.6-3.8-8.6-8.4S7.2 2.6 12 2.6c2.3 0 4.3.8 5.8 2.2l-2.3 2.3C14.5 6 13.3 5.6 12 5z" fill={color}/>
            </svg>
          )}
        </div>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>
            {platform}
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {isMeta ? 'Paid Social' : 'Search'}
          </div>
        </div>
        <div style={{
          marginLeft: 'auto',
          width: 8, height: 8, borderRadius: '50%',
          background: loading ? theme.textMuted : '#22c55e',
        }} />
      </div>

      {loading ? (
        SKELETON_ROWS.map(i => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', padding: '9px 0',
            borderBottom: `1px solid ${theme.border}`,
          }}>
            <div style={{ width: 80, height: 14, background: theme.border, borderRadius: 4, animation: 'kpi-pulse 1.6s infinite' }} />
            <div style={{ width: 60, height: 14, background: theme.border, borderRadius: 4, animation: 'kpi-pulse 1.6s infinite' }} />
          </div>
        ))
      ) : (
        metrics.map(m => (
          <MetricRow key={m.label} theme={theme} label={m.label} value={m.value} format={m.format} />
        ))
      )}
    </div>
  );
}
