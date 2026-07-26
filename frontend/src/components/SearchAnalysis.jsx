import { useState, useEffect, useCallback } from 'react';
import { fmt } from '../theme.js';
import { fetchSearchDeepdive } from '../api.js';

function SortIcon({ dir }) {
  return <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{dir === 'asc' ? '▲' : '▼'}</span>;
}

function KPICard({ theme, label, value, format, sub }) {
  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: '16px 20px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: theme.textMuted, fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif", marginTop: 6 }}>
        {fmt(value, format)}
      </div>
      {sub && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const QUERY_COLS = [
  { key: 'query',       label: 'Search Term',  align: 'left',  format: null },
  { key: 'impressions', label: 'Impressions',  align: 'right', format: 'number' },
  { key: 'clicks',      label: 'Clicks',       align: 'right', format: 'number' },
  { key: 'ctr',         label: 'CTR',          align: 'right', format: 'percent' },
  { key: 'cpc',         label: 'Avg CPC',      align: 'right', format: 'currency' },
  { key: 'spend',       label: 'Spend',        align: 'right', format: 'currency' },
  { key: 'conversions', label: 'Conversions',  align: 'right', format: 'number' },
  { key: 'convRate',    label: 'Conv. Rate',   align: 'right', format: 'percent' },
];

const CAMP_COLS = [
  { key: 'campaign',       label: 'Campaign',        align: 'left',  format: null },
  { key: 'impressions',    label: 'Impressions',     align: 'right', format: 'number' },
  { key: 'clicks',         label: 'Clicks',          align: 'right', format: 'number' },
  { key: 'ctr',            label: 'CTR',             align: 'right', format: 'percent' },
  { key: 'cpc',            label: 'Avg CPC',         align: 'right', format: 'currency' },
  { key: 'spend',          label: 'Spend',           align: 'right', format: 'currency' },
  { key: 'conversions',    label: 'Conversions',     align: 'right', format: 'number' },
  { key: 'impressionShare',label: 'Impr. Share',     align: 'right', format: 'percent' },
];

function SortableTable({ theme, cols, rows, defaultSort, emptyMsg }) {
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortDir, setSortDir] = useState('desc');

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const thStyle = (col) => ({
    padding: '10px 14px',
    textAlign: col.align,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: theme.textMuted,
    borderBottom: `1px solid ${theme.border}`,
    background: theme.surfaceAlt,
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    fontFamily: "'Space Grotesk', sans-serif",
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)} style={thStyle(col)}>
                {col.label}
                {sortKey === col.key && <SortIcon dir={sortDir} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={cols.length} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
                {emptyMsg}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={i}
                style={{ background: theme.surface }}
                onMouseEnter={e => { e.currentTarget.style.background = theme.surfaceAlt; }}
                onMouseLeave={e => { e.currentTarget.style.background = theme.surface; }}
              >
                {cols.map(col => (
                  <td key={col.key} style={{
                    padding: '10px 14px',
                    textAlign: col.align,
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: 13,
                    color: col.align === 'left' ? theme.textPrimary : theme.textSecondary,
                    fontFamily: col.align === 'right' ? "'Space Grotesk', sans-serif" : "'DM Sans', sans-serif",
                    maxWidth: col.align === 'left' ? 300 : undefined,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: col.align === 'left' ? 'nowrap' : undefined,
                  }}
                    title={col.align === 'left' ? String(row[col.key] ?? '') : undefined}
                  >
                    {col.format ? fmt(row[col.key], col.format) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function SearchAnalysis({ theme, client, fetchParams }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTable, setActiveTable] = useState('queries');

  const load = useCallback(async () => {
    if (!['ym-sg', 'ym-hk'].includes(client)) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSearchDeepdive({ client, ...fetchParams });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [client, fetchParams]);

  useEffect(() => { load(); }, [load]);

  if (!['ym-sg', 'ym-hk'].includes(client)) {
    return (
      <div style={{ padding: '60px 0', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
        Search Analysis is only available for Yoga Movement SG and HK.
      </div>
    );
  }

  const tabBtn = (id, label) => (
    <button
      onClick={() => setActiveTable(id)}
      style={{
        padding: '6px 14px',
        borderRadius: 6,
        border: `1px solid ${activeTable === id ? theme.accent : theme.border}`,
        background: activeTable === id ? theme.accentLight : 'transparent',
        color: activeTable === id ? theme.accent : theme.textSecondary,
        fontSize: 13,
        fontWeight: activeTable === id ? 600 : 400,
        fontFamily: "'DM Sans', sans-serif",
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && (
        <div style={{
          background: theme.bg === '#080d1a' ? '#2d1515' : '#fef2f2',
          color: theme.bg === '#080d1a' ? '#fca5a5' : '#991b1b',
          padding: '12px 16px', borderRadius: 10, fontSize: 14,
        }}>
          Failed to load search data: {error}
        </div>
      )}

      {/* KPI Summary */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 12, padding: '16px 20px', height: 80, animation: 'kpi-pulse 1.6s infinite' }} />
          ))}
        </div>
      ) : data?.summary ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <KPICard theme={theme} label="Impressions" value={data.summary.impressions} format="number" />
          <KPICard theme={theme} label="Clicks" value={data.summary.clicks} format="number" sub={`CTR ${data.summary.ctr.toFixed(2)}%`} />
          <KPICard theme={theme} label="Avg CPC" value={data.summary.cpc} format="currency" />
          <KPICard theme={theme} label="Spend" value={data.summary.spend} format="currency" />
          <KPICard theme={theme} label="Conversions" value={data.summary.conversions} format="number" />
          <KPICard theme={theme} label="Unique Terms" value={data.queries?.length ?? 0} format="number" />
        </div>
      ) : null}

      {/* Tables */}
      <div style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>
              Search Performance
            </div>
            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              {loading ? 'Loading…' : `${data?.queries?.length ?? 0} search terms · ${data?.campaigns?.length ?? 0} campaigns`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {tabBtn('queries', 'Search Terms')}
            {tabBtn('campaigns', 'Campaigns')}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
            Loading search data…
          </div>
        ) : activeTable === 'queries' ? (
          <SortableTable
            theme={theme}
            cols={QUERY_COLS}
            rows={data?.queries ?? []}
            defaultSort="impressions"
            emptyMsg="No search terms in this period"
          />
        ) : (
          <SortableTable
            theme={theme}
            cols={data?.hasImpressionShare ? CAMP_COLS : CAMP_COLS.filter(c => c.key !== 'impressionShare')}
            rows={data?.campaigns ?? []}
            defaultSort="impressions"
            emptyMsg="No campaigns in this period"
          />
        )}
      </div>
    </div>
  );
}
