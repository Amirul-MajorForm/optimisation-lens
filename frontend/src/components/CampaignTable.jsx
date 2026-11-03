import { useState } from 'react';
import { fmt } from '../theme.js';

// One shared column set so TikTok, Meta and Google tables line up exactly.
// Metrics a platform does not report render as "—".
const COLUMNS = [
  { key: 'campaign_name', label: 'Campaign',    align: 'left',  grow: true, format: null },
  { key: 'spend',         label: 'Spend',       align: 'right', format: 'currency', width: 150 },
  { key: 'impressions',   label: 'Impr.',       align: 'right', format: 'compact' },
  { key: 'reach',         label: 'Reach',       align: 'right', format: 'compact' },
  { key: 'video_views',   label: 'Video Views', align: 'right', format: 'compact' },
  { key: 'clicks',        label: 'Clicks',      align: 'right', format: 'compact' },
  { key: 'ctr',           label: 'CTR',         align: 'right', format: 'percent' },
  { key: 'cpm',           label: 'CPM',         align: 'right', format: 'currency' },
  { key: 'cpc',           label: 'CPC',         align: 'right', format: 'currency' },
];
const METRIC_COL_WIDTH = 112;
const CAMPAIGN_COL_MIN = 240;
const colWidth = col => col.width ?? METRIC_COL_WIDTH;
const TABLE_MIN_WIDTH = CAMPAIGN_COL_MIN + COLUMNS.filter(c => !c.grow).reduce((s, c) => s + colWidth(c), 0);

// TikTok reports video views as video_play_actions
function cellValue(row, key) {
  if (key === 'video_views') return row.video_views ?? row.video_play_actions;
  return row[key];
}

const PLATFORM_CONFIG = {
  tiktok: {
    label: 'TikTok',
    color: '#010101',
    badge: { bg: '#f0f0f0', text: '#010101' },
    kpis: [
      { key: 'spend',              label: 'Spend',        format: 'currency' },
      { key: 'impressions',        label: 'Impressions',  format: 'compact' },
      { key: 'video_play_actions', label: 'Video Views',  format: 'compact' },
      { key: 'reach',              label: 'Reach',        format: 'compact' },
      { key: 'ctr',                label: 'CTR',          format: 'percent' },
      { key: 'cpm',                label: 'CPM',          format: 'currency' },
    ],
  },
  meta: {
    label: 'Meta',
    color: '#1877F2',
    badge: { bg: '#e8f0fe', text: '#1877F2' },
    kpis: [
      { key: 'spend',       label: 'Spend',       format: 'currency' },
      { key: 'impressions', label: 'Impressions', format: 'compact' },
      { key: 'reach',       label: 'Reach',       format: 'compact' },
      { key: 'clicks',      label: 'Clicks',      format: 'compact' },
      { key: 'ctr',         label: 'CTR',         format: 'percent' },
      { key: 'cpm',         label: 'CPM',         format: 'currency' },
    ],
  },
  google: {
    label: 'Google',
    color: '#EA4335',
    badge: { bg: '#fce8e6', text: '#EA4335' },
    kpis: [
      { key: 'spend',       label: 'Spend',       format: 'currency' },
      { key: 'impressions', label: 'Impressions', format: 'compact' },
      { key: 'clicks',      label: 'Clicks',      format: 'compact' },
      { key: 'ctr',         label: 'CTR',         format: 'percent' },
      { key: 'cpm',         label: 'CPM',         format: 'currency' },
      { key: 'cpc',         label: 'CPC',         format: 'currency' },
    ],
  },
};

function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '10px 14px' }}>
          <div style={{ height: 14, background: '#e2e8f0', borderRadius: 4, width: i === 0 ? '70%' : '60%', animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

function KPIRow({ kpis, total, theme, currency }) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 24,
      padding: '16px 20px',
      background: theme.surfaceAlt,
      borderBottom: `1px solid ${theme.border}`,
    }}>
      {kpis.map(({ key, label, format }) => {
        const val = total?.[key];
        const hasVal = val != null && val !== '' && !(typeof val === 'number' && isNaN(val));
        return (
          <div key={key} style={{ minWidth: 100 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: theme.textMuted, marginBottom: 3, fontFamily: "'Space Grotesk', sans-serif" }}>
              {label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.01em' }}>
              {hasVal ? fmt(val, format, currency) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PlatformSection({ platform, label, data, theme, loading }) {
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(true);

  const config = PLATFORM_CONFIG[platform];
  const columns = COLUMNS;
  if (!config) return null;

  const { campaigns = [], total = {}, currency = 'SGD' } = data || {};

  const sorted = [...campaigns].sort((a, b) => {
    const av = cellValue(a, sortKey) ?? 0;
    const bv = cellValue(b, sortKey) ?? 0;
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (Number(av) - Number(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      {/* Platform header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 20px',
          cursor: 'pointer',
          borderBottom: expanded ? `1px solid ${theme.border}` : 'none',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
          background: config.badge.bg, color: config.badge.text,
          padding: '3px 10px', borderRadius: 6,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {label ?? config.label}
        </span>
        <span style={{ fontSize: 13, color: theme.textMuted }}>
          {loading ? '…' : `${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''} · ${currency}`}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.textMuted} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ marginLeft: 'auto', transition: 'transform 0.2s', transform: expanded ? 'none' : 'rotate(-90deg)' }}
        >
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>

      {expanded && (
        <>
          <KPIRow kpis={config.kpis} total={total} theme={theme} currency={currency} />

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: TABLE_MIN_WIDTH, tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
              <colgroup>
                {columns.map(col => (
                  <col key={col.key} style={col.grow ? undefined : { width: colWidth(col) }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: theme.surfaceAlt }}>
                  {columns.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      style={{
                        padding: '8px 14px',
                        textAlign: col.align,
                        fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: sortKey === col.key ? theme.accent : theme.textMuted,
                        fontFamily: "'Space Grotesk', sans-serif",
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        borderBottom: `1px solid ${theme.border}`,
                        userSelect: 'none',
                      }}
                    >
                      {col.label}
                      {sortKey === col.key && (
                        <span style={{ marginLeft: 4, opacity: 0.7 }}>
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={columns.length} />)
                  : sorted.length === 0
                    ? (
                      <tr>
                        <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: 13 }}>
                          No campaign data for this period
                        </td>
                      </tr>
                    )
                    : sorted.map((row, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: `1px solid ${theme.border}` }}
                        onMouseEnter={e => { e.currentTarget.style.background = theme.surfaceHover; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {columns.map(col => {
                          const val = cellValue(row, col.key);
                          const display = col.format == null
                            ? (val || '—')
                            : (val == null || val === '' ? '—' : fmt(val, col.format, currency));
                          return (
                            <td
                              key={col.key}
                              title={col.key === 'campaign_name' ? (val || '') : undefined}
                              style={{
                                padding: '10px 14px',
                                textAlign: col.align,
                                color: col.key === 'campaign_name' ? theme.textPrimary : theme.textSecondary,
                                fontWeight: col.key === 'campaign_name' ? 500 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function CampaignTable({ theme, data, loading }) {
  return (
    <div>
      <PlatformSection platform="tiktok" data={data?.tiktok} theme={theme} loading={loading} />
      <PlatformSection platform="meta"   data={data?.meta}   theme={theme} loading={loading} />
      <PlatformSection platform="google" data={data?.google} theme={theme} loading={loading} />
    </div>
  );
}
