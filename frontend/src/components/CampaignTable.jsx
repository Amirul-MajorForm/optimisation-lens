import { useState, Fragment } from 'react';
import { CHART, fmt } from '../theme.js';

// Known acronyms that stay all-caps
const ACRONYMS = new Set(['ym', 'cta', 'fb', 'ig', 'sg', 'hk', 'my', 'au', 'lpv', 'cpm', 'cpc', 'cpl', 'cpa', 'roas', 'lal', 'wca', 'tof', 'mof', 'bof', 'dsa', 'abo', 'cbo', 'usp']);

function titleCase(str) {
  return str.replace(/\b([a-z]+)\b/gi, w =>
    ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}


function prettifyCampaign(name) {
  let s = name;
  // Strip leading market/platform prefix tokens (iterative to handle chained e.g. SG_META_YM_)
  let prev;
  do {
    prev = s;
    s = s.replace(/^(SG|HK|MY|AU|YM|META|GOOGLE|FB|IG|YMTT)[_\s]+/i, '');
  } while (s !== prev);
  // Strip brand name
  s = s.replace(/YOGA[\s_]+MOVEMENT[_\s]*/gi, ' ');
  // Strip year tokens and buy-type abbreviations (whole words only)
  s = s.replace(/\b(20[0-9]{2}|ABO|CBO)\b[_\s]*/gi, ' ');
  // Replace remaining underscores with spaces
  s = s.replace(/_+/g, ' ');
  // Strip leading/trailing punctuation/dashes
  s = s.replace(/^[\s\-–]+/, '').replace(/[\s\-–]+$/, '');
  // Collapse whitespace
  s = s.replace(/\s{2,}/g, ' ').trim();
  return titleCase(s.toLowerCase()) || name;
}

const AD_FORMAT_RE = /^(static_single_image|static_carousel|static_story|video_story|video_reel|static|video|carousel|reel|story|dynamic|collection|dsa)_/i;
const DATE_PREFIX_RE = /^\d{4}[_\s]/; // MMDD_ or similar 4-digit date prefix

function prettifyAdPart(str) {
  if (!str) return '—';
  let s = str;
  s = s.replace(AD_FORMAT_RE, '');
  s = s.replace(DATE_PREFIX_RE, '');
  // Split on underscores, title-case each segment, join with " - "
  const parts = s.split('_').map(p => titleCase(p.trim().toLowerCase())).filter(Boolean);
  return parts.join(' - ') || str;
}

const COLS = [
  { key: 'name',        label: 'Campaign / Ad',  sortKey: 'name',        align: 'left' },
  { key: 'platform',    label: 'Platform',        sortKey: 'platform',    align: 'left' },
  { key: 'spend',       label: 'Spend',           sortKey: 'spend',       align: 'right', format: 'currency' },
  { key: 'impressions', label: 'Impressions',     sortKey: 'impressions', align: 'right', format: 'number' },
  { key: 'clicks',      label: 'Clicks',          sortKey: 'clicks',      align: 'right', format: 'number' },
  { key: 'lpv',         label: 'LPV',             sortKey: 'lpv',         align: 'right', format: 'number' },
  { key: 'leads',       label: 'Leads',           sortKey: 'leads',       align: 'right', format: 'number' },
  { key: 'ctr',         label: 'CTR',             sortKey: 'ctr',         align: 'right', format: 'percent' },
  { key: 'cpl',         label: 'CPL',             sortKey: 'cpl',         align: 'right', format: 'currency' },
];

function PlatformBadge({ platform }) {
  const color = platform === 'Meta' ? CHART.meta : CHART.google;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600,
      background: color + '20',
      color,
    }}>
      {platform}
    </span>
  );
}

function SortIcon({ dir }) {
  return (
    <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>
      {dir === 'asc' ? '▲' : '▼'}
    </span>
  );
}

function AdRow({ ad, theme, colCount }) {
  return (
    <tr style={{ background: theme.surfaceAlt }}>
      <td style={{ padding: '8px 16px 8px 40px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 12, color: theme.textSecondary }}>
          {ad.adset && (
            <span style={{ color: theme.textMuted, marginRight: 6 }} title={ad.adset}>
              {prettifyAdPart(ad.adset)}
            </span>
          )}
          <span title={ad.ad || ''}>{prettifyAdPart(ad.ad)}</span>
        </div>
      </td>
      <td style={{ padding: '8px 16px', borderBottom: `1px solid ${theme.border}` }} />
      {['spend', 'impressions', 'clicks', 'lpv', 'leads', 'ctr', 'cpl'].map(key => {
        const col = COLS.find(c => c.key === key);
        return (
          <td key={key} style={{
            padding: '8px 16px', textAlign: 'right',
            borderBottom: `1px solid ${theme.border}`,
            fontSize: 12, color: theme.textSecondary,
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
            {fmt(ad[key], col.format)}
          </td>
        );
      })}
    </tr>
  );
}

export default function CampaignTable({ theme, metaCampaigns, googleCampaigns, loading, client }) {
  const [expanded, setExpanded] = useState(new Set());
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  const allCampaigns = [
    ...(metaCampaigns || []).map(c => ({ ...c, platform: 'Meta', leads: c.leads ?? 0, lpv: c.lpv ?? 0 })),
    ...(googleCampaigns || []).map(c => ({ ...c, platform: 'Google', leads: c.conversions ?? 0, lpv: 0 })),
  ].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const thStyle = (col) => ({
    padding: '10px 16px',
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
    <div style={{
      background: theme.surface,
      border: `1px solid ${theme.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      transition: 'background 0.25s',
    }}>
      <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>
          Campaign Breakdown
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
          {allCampaigns.length} campaigns · click to expand ads
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead>
            <tr>
              {COLS.map(col => (
                <th key={col.key} onClick={() => handleSort(col.sortKey)} style={thStyle(col)}>
                  {col.label}
                  {sortKey === col.sortKey && <SortIcon dir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {COLS.map(col => (
                    <td key={col.key} style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ height: 14, background: theme.border, borderRadius: 4, width: col.align === 'right' ? 60 : '80%', marginLeft: col.align === 'right' ? 'auto' : 0, animation: 'kpi-pulse 1.6s infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : allCampaigns.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
                  No campaigns in this period
                </td>
              </tr>
            ) : (
              allCampaigns.map(camp => {
                const isOpen = expanded.has(camp.name);
                const hasAds = camp.platform === 'Meta' && camp.ads?.length > 0;
                return (
                  <Fragment key={camp.name}>
                    <tr
                      onClick={() => hasAds && toggleExpand(camp.name)}
                      style={{
                        cursor: hasAds ? 'pointer' : 'default',
                        background: isOpen ? theme.surfaceAlt : theme.surface,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = theme.surfaceHover; }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = theme.surface; }}
                    >
                      {/* Name */}
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : `1px solid ${theme.border}`, maxWidth: 280 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasAds ? (
                            <span style={{ color: theme.textMuted, fontSize: 11, flexShrink: 0 }}>
                              {isOpen ? '▼' : '▶'}
                            </span>
                          ) : (
                            <span style={{ width: 14, flexShrink: 0 }} />
                          )}
                          <span
                            title={camp.name}
                            style={{
                              fontSize: 13, color: theme.textPrimary, fontWeight: 500,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {prettifyCampaign(camp.name)}
                          </span>
                        </div>
                      </td>
                      {/* Platform */}
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : `1px solid ${theme.border}` }}>
                        <PlatformBadge platform={camp.platform} />
                      </td>
                      {/* Numeric cols */}
                      {['spend', 'impressions', 'clicks', 'lpv', 'leads', 'ctr', 'cpl'].map(key => {
                        const col = COLS.find(c => c.key === key);
                        return (
                          <td key={key} style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            borderBottom: isOpen ? 'none' : `1px solid ${theme.border}`,
                            fontSize: 13,
                            color: theme.textPrimary,
                            fontFamily: "'Space Grotesk', sans-serif",
                            fontWeight: 500,
                          }}>
                            {fmt(camp[key], col.format)}
                          </td>
                        );
                      })}
                    </tr>
                    {isOpen && hasAds && camp.ads.map((ad, ai) => (
                      <AdRow key={`${camp.name}-ad-${ai}`} ad={ad} theme={theme} colCount={COLS.length} />
                    ))}
                    {isOpen && (
                      <tr>
                        <td colSpan={COLS.length} style={{ borderBottom: `1px solid ${theme.border}` }} />
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
