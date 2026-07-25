import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART, METRIC_META, fmt } from '../theme.js';

// Build sorted date array covering the full period
function buildDateArray(days) {
  const arr = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    arr.push(d.toISOString().slice(0, 10));
  }
  return arr;
}

function dateLabel(dateStr, granularity) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  if (granularity === 'daily') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (granularity === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  // weekly — show Mon date of the week
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupWeekly(points) {
  const map = new Map();
  for (const p of points) {
    const [y, mo, d] = p.date.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const dow = dt.getDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow; // shift to Monday
    const mon = new Date(dt);
    mon.setDate(dt.getDate() + diff);
    const key = mon.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { date: key, metaSpend: 0, metaClicks: 0, metaImpressions: 0, metaLeads: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0 });
    const w = map.get(key);
    w.metaSpend += p.metaSpend;
    w.metaClicks += p.metaClicks;
    w.metaImpressions += p.metaImpressions;
    w.metaLeads += p.metaLeads;
    w.googleSpend += p.googleSpend;
    w.googleClicks += p.googleClicks;
    w.googleImpressions += p.googleImpressions;
    w.googleConversions += p.googleConversions;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function groupMonthly(points) {
  const map = new Map();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    if (!map.has(key)) map.set(key, { date: key + '-01', metaSpend: 0, metaClicks: 0, metaImpressions: 0, metaLeads: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0 });
    const w = map.get(key);
    w.metaSpend += p.metaSpend;
    w.metaClicks += p.metaClicks;
    w.metaImpressions += p.metaImpressions;
    w.metaLeads += p.metaLeads;
    w.googleSpend += p.googleSpend;
    w.googleClicks += p.googleClicks;
    w.googleImpressions += p.googleImpressions;
    w.googleConversions += p.googleConversions;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function metricValue(point, metric, platform) {
  if (platform === 'meta' || platform === 'both') {
    if (metric === 'spend') return point.metaSpend;
    if (metric === 'cpl') return point.metaLeads > 0 ? point.metaSpend / point.metaLeads : null;
    if (metric === 'ctr') return point.metaImpressions > 0 ? (point.metaClicks / point.metaImpressions) * 100 : null;
  }
  return null;
}

function googleMetricValue(point, metric) {
  if (metric === 'spend') return point.googleSpend;
  if (metric === 'cpl') return point.googleConversions > 0 ? point.googleSpend / point.googleConversions : null;
  if (metric === 'ctr') return point.googleImpressions > 0 ? (point.googleClicks / point.googleImpressions) * 100 : null;
  return null;
}

const CustomTooltip = ({ active, payload, label, metric, granularity }) => {
  if (!active || !payload?.length) return null;
  const m = METRIC_META[metric];
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 10,
      padding: '10px 14px',
      fontSize: 13,
      color: '#f1f5f9',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#94a3b8' }}>{dateLabel(label, granularity)}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#94a3b8' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value, m.format)}</span>
        </div>
      ))}
    </div>
  );
};

const TabButton = ({ active, onClick, children, theme }) => (
  <button
    onClick={onClick}
    style={{
      padding: '6px 14px',
      borderRadius: 7,
      border: 'none',
      cursor: 'pointer',
      fontSize: 13,
      fontWeight: 500,
      fontFamily: "'DM Sans', sans-serif",
      background: active ? theme.accent : theme.surfaceAlt,
      color: active ? '#fff' : theme.textSecondary,
      transition: 'background 0.15s, color 0.15s',
    }}
  >
    {children}
  </button>
);

export default function PerformanceChart({ theme, metaByDate, googleByDate, showGoogle, dateRange, loading }) {
  const [metric, setMetric] = useState('spend');
  const [platform, setPlatform] = useState('both');
  const [granularity, setGranularity] = useState('daily');

  const chartData = useMemo(() => {
    const dates = buildDateArray(dateRange || 7);
    let daily = dates.map(date => ({
      date,
      metaSpend: metaByDate?.[date]?.spend ?? 0,
      metaClicks: metaByDate?.[date]?.clicks ?? 0,
      metaImpressions: metaByDate?.[date]?.impressions ?? 0,
      metaLeads: metaByDate?.[date]?.leads ?? 0,
      googleSpend: googleByDate?.[date]?.spend ?? 0,
      googleClicks: googleByDate?.[date]?.clicks ?? 0,
      googleImpressions: googleByDate?.[date]?.impressions ?? 0,
      googleConversions: googleByDate?.[date]?.conversions ?? 0,
    }));

    if (granularity === 'weekly') daily = groupWeekly(daily);
    if (granularity === 'monthly') daily = groupMonthly(daily);
    return daily;
  }, [metaByDate, googleByDate, dateRange, granularity]);

  // Guard: if showGoogle is off and user had selected 'google', treat as 'both'
  const effectivePlatform = (!showGoogle && platform === 'google') ? 'both' : platform;
  const showMeta = effectivePlatform === 'meta' || effectivePlatform === 'both';
  const showGoogleLine = showGoogle && (effectivePlatform === 'google' || effectivePlatform === 'both');

  const m = METRIC_META[metric];

  const tickFormatter = (v) => {
    if (v == null) return '';
    if (metric === 'spend' || metric === 'cpl') {
      return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
    }
    return `${v.toFixed(1)}%`;
  };

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      transition: 'background 0.25s',
    }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: theme.textPrimary, marginRight: 4 }}>
          Performance
        </span>

        {/* Metric selector */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {Object.entries(METRIC_META).map(([key, meta]) => (
            <TabButton key={key} active={metric === key} onClick={() => setMetric(key)} theme={theme}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, display: 'inline-block', marginRight: 5 }} />
              {meta.label}
            </TabButton>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: theme.border }} />

        {/* Platform */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['both', 'meta', ...(showGoogle ? ['google'] : [])].map(p => (
            <TabButton key={p} active={platform === p} onClick={() => setPlatform(p)} theme={theme}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </TabButton>
          ))}
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: theme.border }} />

        {/* Granularity */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['daily', 'weekly', 'monthly'].map(g => (
            <TabButton key={g} active={granularity === g} onClick={() => setGranularity(g)} theme={theme}>
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </TabButton>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: theme.textMuted, fontSize: 14 }}>
          Loading chart data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={theme.border}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={d => dateLabel(d, granularity)}
              tick={{ fill: theme.textMuted, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}
              axisLine={{ stroke: theme.border }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={tickFormatter}
              tick={{ fill: theme.textMuted, fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              content={<CustomTooltip metric={metric} granularity={granularity} />}
              cursor={{ stroke: theme.borderStrong, strokeWidth: 1 }}
            />
            {(showMeta || showGoogleLine) && (
              <Legend
                wrapperStyle={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", paddingTop: 12 }}
              />
            )}
            {showMeta && (
              <Line
                type="monotone"
                dataKey={p => metricValue(p, metric, 'meta')}
                name="Meta"
                stroke={CHART.meta}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            )}
            {showGoogleLine && (
              <Line
                type="monotone"
                dataKey={p => googleMetricValue(p, metric)}
                name="Google"
                stroke={CHART.google}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
