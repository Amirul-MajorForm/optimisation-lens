import { useState, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART, METRIC_META, fmt } from '../theme.js';

function buildDateArray(days, startDate, endDate) {
  if (startDate && endDate) {
    const arr = [];
    const end = new Date(endDate + 'T00:00:00');
    for (let d = new Date(startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  }
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
  if (granularity === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupWeekly(points) {
  const map = new Map();
  for (const p of points) {
    const [y, mo, d] = p.date.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const dow = dt.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(dt);
    mon.setDate(dt.getDate() + diff);
    const key = mon.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { date: key, metaSpend: 0, metaClicks: 0, metaImpressions: 0, metaLeads: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0 });
    const w = map.get(key);
    w.metaSpend += p.metaSpend; w.metaClicks += p.metaClicks; w.metaImpressions += p.metaImpressions; w.metaLeads += p.metaLeads;
    w.googleSpend += p.googleSpend; w.googleClicks += p.googleClicks; w.googleImpressions += p.googleImpressions; w.googleConversions += p.googleConversions;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function groupMonthly(points) {
  const map = new Map();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    if (!map.has(key)) map.set(key, { date: key + '-01', metaSpend: 0, metaClicks: 0, metaImpressions: 0, metaLeads: 0, googleSpend: 0, googleClicks: 0, googleImpressions: 0, googleConversions: 0 });
    const w = map.get(key);
    w.metaSpend += p.metaSpend; w.metaClicks += p.metaClicks; w.metaImpressions += p.metaImpressions; w.metaLeads += p.metaLeads;
    w.googleSpend += p.googleSpend; w.googleClicks += p.googleClicks; w.googleImpressions += p.googleImpressions; w.googleConversions += p.googleConversions;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function getRawMetricValue(p, platform, metric) {
  if (platform === 'meta') {
    if (metric === 'spend') return p.metaSpend;
    if (metric === 'cpl') return p.metaLeads > 0 ? p.metaSpend / p.metaLeads : null;
    if (metric === 'ctr') return p.metaImpressions > 0 ? (p.metaClicks / p.metaImpressions) * 100 : null;
  }
  if (platform === 'google') {
    if (metric === 'spend') return p.googleSpend;
    if (metric === 'cpl') return p.googleConversions > 0 ? p.googleSpend / p.googleConversions : null;
    if (metric === 'ctr') return p.googleImpressions > 0 ? (p.googleClicks / p.googleImpressions) * 100 : null;
  }
  return null;
}

const CustomTooltip = ({ active, payload, label, granularity, isMulti, lineMetaMap }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#1e293b', border: '1px solid #334155',
      borderRadius: 10, padding: '10px 14px',
      fontSize: 13, color: '#f1f5f9',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#94a3b8' }}>{dateLabel(label, granularity)}</div>
      {payload.map(p => {
        const meta = lineMetaMap[p.name];
        const formatted = isMulti
          ? (p.value != null ? p.value.toFixed(1) : '—')
          : fmt(p.value, meta?.format);
        return (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
            <span style={{ color: '#94a3b8' }}>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{formatted}</span>
          </div>
        );
      })}
      {isMulti && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Index: 100 = period start</div>}
    </div>
  );
};

const TabButton = ({ active, onClick, children, theme }) => (
  <button onClick={onClick} style={{
    padding: '6px 14px', borderRadius: 7, border: 'none',
    cursor: 'pointer', fontSize: 13, fontWeight: 500,
    fontFamily: "'DM Sans', sans-serif",
    background: active ? theme.accent : theme.surfaceAlt,
    color: active ? '#fff' : theme.textSecondary,
    transition: 'background 0.15s, color 0.15s',
  }}>
    {children}
  </button>
);

export default function PerformanceChart({ theme, metaByDate, googleByDate, showGoogle, dateRange, startDate, endDate, loading }) {
  const [metrics, setMetrics] = useState(new Set(['spend']));
  const [platform, setPlatform] = useState('both');
  const [granularity, setGranularity] = useState('daily');

  const toggleMetric = useCallback((key) => {
    setMetrics(prev => {
      if (prev.has(key) && prev.size === 1) return prev;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const activeMetrics = useMemo(() => [...metrics].sort(), [metrics]);
  const isMulti = activeMetrics.length > 1;

  const effectivePlatform = (!showGoogle && platform === 'google') ? 'both' : platform;
  const showMeta = effectivePlatform === 'meta' || effectivePlatform === 'both';
  const showGoogleLine = showGoogle && (effectivePlatform === 'google' || effectivePlatform === 'both');

  const rawChartData = useMemo(() => {
    const dates = buildDateArray(dateRange || 7, startDate, endDate);
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
  }, [metaByDate, googleByDate, dateRange, startDate, endDate, granularity]);

  // Line definitions: color by metric in multi mode, by platform in single mode
  const lineDefs = useMemo(() => {
    const platforms = [
      ...(showMeta ? ['meta'] : []),
      ...(showGoogleLine ? ['google'] : []),
    ];
    const lines = [];
    if (!isMulti) {
      const metric = activeMetrics[0] || 'spend';
      for (const plat of platforms) {
        lines.push({
          key: `${plat}_${metric}`,
          name: plat === 'meta' ? 'Meta' : 'Google',
          color: plat === 'meta' ? CHART.meta : CHART.google,
          dasharray: plat === 'google' ? '5 3' : undefined,
          format: METRIC_META[metric]?.format,
        });
      }
    } else {
      const multiPlatform = platforms.length > 1;
      for (const metric of activeMetrics) {
        for (const plat of platforms) {
          const platformSuffix = multiPlatform ? ` (${plat === 'meta' ? 'Meta' : 'Google'})` : '';
          lines.push({
            key: `${plat}_${metric}`,
            name: `${METRIC_META[metric].label}${platformSuffix}`,
            color: METRIC_META[metric].color,
            dasharray: plat === 'google' ? '5 3' : undefined,
            format: METRIC_META[metric]?.format,
          });
        }
      }
    }
    return lines;
  }, [isMulti, activeMetrics, showMeta, showGoogleLine]);

  // Chart data with pre-computed values per metric-platform key; normalized if isMulti
  const chartData = useMemo(() => {
    const withVals = rawChartData.map(p => {
      const vals = { date: p.date };
      for (const metric of Object.keys(METRIC_META)) {
        vals[`meta_${metric}`] = getRawMetricValue(p, 'meta', metric);
        vals[`google_${metric}`] = getRawMetricValue(p, 'google', metric);
      }
      return { ...p, ...vals };
    });

    if (!isMulti) return withVals;

    // Normalize each active line to index 100 at its first non-zero point
    const baselines = {};
    for (const line of lineDefs) {
      const first = withVals.find(p => p[line.key] != null && p[line.key] > 0);
      baselines[line.key] = first?.[line.key] ?? null;
    }

    return withVals.map(p => {
      const norm = { date: p.date };
      for (const line of lineDefs) {
        const bl = baselines[line.key];
        norm[line.key] = (bl != null && p[line.key] != null) ? (p[line.key] / bl) * 100 : null;
      }
      return norm;
    });
  }, [rawChartData, isMulti, lineDefs]);

  const lineMetaMap = useMemo(() => {
    const map = {};
    for (const line of lineDefs) map[line.name] = { format: line.format };
    return map;
  }, [lineDefs]);

  const tickFormatter = useCallback((v) => {
    if (v == null) return '';
    if (isMulti) return v.toFixed(0);
    const metric = activeMetrics[0] || 'spend';
    if (metric === 'spend' || metric === 'cpl') {
      return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
    }
    return `${v.toFixed(1)}%`;
  }, [isMulti, activeMetrics]);

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      padding: '20px 24px',
      transition: 'background 0.25s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 15, color: theme.textPrimary, marginRight: 4 }}>
          Performance{isMulti ? ' (Indexed)' : ''}
        </span>

        {/* Metric toggles — multi-select */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {Object.entries(METRIC_META).map(([key, meta]) => (
            <TabButton key={key} active={metrics.has(key)} onClick={() => toggleMetric(key)} theme={theme}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color, display: 'inline-block', marginRight: 5 }} />
              {meta.label}
            </TabButton>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: theme.border }} />

        {/* Platform */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['both', 'meta', ...(showGoogle ? ['google'] : [])].map(p => (
            <TabButton key={p} active={platform === p} onClick={() => setPlatform(p)} theme={theme}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </TabButton>
          ))}
        </div>

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
            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
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
              content={<CustomTooltip granularity={granularity} isMulti={isMulti} lineMetaMap={lineMetaMap} />}
              cursor={{ stroke: theme.borderStrong, strokeWidth: 1 }}
            />
            {lineDefs.length > 0 && (
              <Legend wrapperStyle={{ fontSize: 13, fontFamily: "'DM Sans', sans-serif", paddingTop: 12 }} />
            )}
            {lineDefs.map(line => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={2}
                strokeDasharray={line.dasharray}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
