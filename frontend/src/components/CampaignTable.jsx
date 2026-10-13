import { useState, useEffect, useRef, Fragment } from 'react';
import { CHART, fmt } from '../theme.js';

// Known acronyms that stay all-caps
const ACRONYMS = new Set(['ym', 'cta', 'fb', 'ig', 'sg', 'hk', 'my', 'au', 'lpv', 'cpm', 'cpc', 'cpl', 'cpa', 'roas', 'lal', 'wca', 'tof', 'mof', 'bof', 'dsa', 'abo', 'cbo', 'usp']);

function titleCase(str) {
  return str.replace(/\b([a-z]+)\b/gi, w =>
    ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}


function campaignType(name) {
  const n = name.toLowerCase();
  if (/\blead/i.test(n)) return 'Leads';
  if (/\btraffic\b/i.test(n)) return 'Traffic';
  if (/\bsale|purchase|conversion/i.test(n)) return 'Sales';
  if (/\bawareness|brand\b/i.test(n)) return 'Awareness';
  if (/\bretarget|remarketing/i.test(n)) return 'Retargeting';
  if (/\bvideo.view|video.view|vv\b/i.test(n)) return 'Video Views';
  if (/\bengage/i.test(n)) return 'Engagement';
  if (/\breach\b/i.test(n)) return 'Reach';
  return null;
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

const FIXED_COLS = [
  { key: 'name',     label: 'Campaign',  sortKey: 'name',     align: 'left' },
  { key: 'platform', label: 'Platform',  sortKey: 'platform', align: 'left' },
];

const METRIC_COLS = [
  { key: 'spend',       label: 'Spend',       sortKey: 'spend',       align: 'right', format: 'currency' },
  { key: 'impressions', label: 'Impressions', sortKey: 'impressions', align: 'right', format: 'number'   },
  { key: 'clicks',      label: 'Clicks',      sortKey: 'clicks',      align: 'right', format: 'number'   },
  { key: 'lpv',         label: 'LPV',         sortKey: 'lpv',         align: 'right', format: 'number'   },
  { key: 'leads',       label: 'Leads',       sortKey: 'leads',       align: 'right', format: 'number'   },
  { key: 'ctr',         label: 'CTR',         sortKey: 'ctr',         align: 'right', format: 'percent'  },
  { key: 'cpl',         label: 'CPL',         sortKey: 'cpl',         align: 'right', format: 'currency' },
];

const LS_KEY = 'campaign-table-metrics';
const DEFAULT_METRICS = new Set(['spend', 'clicks', 'leads', 'ctr', 'cpl']);

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

function AdRow({ ad, theme, visibleMetrics }) {
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
      {METRIC_COLS.filter(c => visibleMetrics.has(c.key)).map(col => (
        <td key={col.key} style={{
          padding: '8px 16px', textAlign: 'right',
          borderBottom: `1px solid ${theme.border}`,
          fontSize: 12, color: theme.textSecondary,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {fmt(ad[col.key], col.format)}
        </td>
      ))}
    </tr>
  );
}

const TYPE_COLORS = {
  Leads:       { bg: '#dbeafe', text: '#1d4ed8' },
  Traffic:     { bg: '#d1fae5', text: '#065f46' },
  Sales:       { bg: '#fef3c7', text: '#92400e' },
  Awareness:   { bg: '#ede9fe', text: '#5b21b6' },
  Retargeting: { bg: '#fee2e2', text: '#991b1b' },
  'Video Views': { bg: '#e0f2fe', text: '#0369a1' },
  Engagement:  { bg: '#fce7f3', text: '#9d174d' },
  Reach:       { bg: '#f0fdf4', text: '#166534' },
};

function TypeBadge({ type, theme }) {
  const colors = TYPE_COLORS[type] || { bg: theme.surfaceAlt, text: theme.textMuted };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px', borderRadius: 20,
      fontSize: 12, fontWeight: 600,
      background: colors.bg, color: colors.text,
      whiteSpace: 'nowrap',
    }}>
      {type}
    </span>
  );
}

export default function CampaignTable({ theme, metaCampaigns, googleCampaigns, loading }) {
  const [expanded, setExpanded] = useState(new Set());
  const [sortKey, setSortKey] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  const [visibleMetrics, setVisibleMetrics] = useState(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return DEFAULT_METRICS;
  });

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify([...visibleMetrics])); } catch {}
  }, [visibleMetrics]);

  useEffect(() => {
    const handler = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false); };
    if (pickerOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const toggleMetric = (key) => {
    setVisibleMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key) && next.size === 1) return prev;
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allCampaigns = [
    ...(metaCampaigns || []).map(c => ({ ...c, platform: 'Meta', leads: c.leads ?? 0, lpv: c.lpv ?? 0 })),
    ...(googleCampaigns || []).map(c => ({ ...c, platform: 'Google', leads: c.conversions ?? 0, lpv: 0 })),
  ].sort((a, b) => {
    const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const visibleCols = [...FIXED_COLS, ...METRIC_COLS.filter(c => visibleMetrics.has(c.key))];
  const totalCols = visibleCols.length;

  const thStyle = (col) => ({
    padding: '10px 16px', textAlign: col.align,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: theme.textMuted,
    borderBottom: `1px solid ${theme.border}`, background: theme.surfaceAlt,
    cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
    fontFamily: "'Space Grotesk', sans-serif",
  });

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, overflow: 'hidden', transition: 'background 0.25s' }}>
      <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: theme.textPrimary }}>Campaign Breakdown</div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{allCampaigns.length} campaigns · click to expand ads</div>
        </div>
        {/* Metric picker */}
        <div style={{ marginLeft: 'auto', position: 'relative' }} ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            title="Select columns"
            style={{
              background: pickerOpen ? theme.accent : theme.surfaceAlt,
              border: `1px solid ${theme.border}`,
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              color: pickerOpen ? '#fff' : theme.textSecondary,
              fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
              display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s, color 0.15s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
            Columns
          </button>
          {pickerOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 6,
              background: theme.surface, border: `1px solid ${theme.border}`,
              borderRadius: 10, padding: '10px 0', zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160,
            }}>
              {METRIC_COLS.map(col => (
                <label key={col.key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px', cursor: 'pointer',
                  fontSize: 13, color: theme.textPrimary,
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <input
                    type="checkbox"
                    checked={visibleMetrics.has(col.key)}
                    onChange={() => toggleMetric(col.key)}
                    style={{ accentColor: theme.accent, width: 14, height: 14 }}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              {visibleCols.map(col => (
                <th key={col.key} onClick={() => handleSort(col.sortKey)} style={thStyle(col)}>
                  {col.label}{sortKey === col.sortKey && <SortIcon dir={sortDir} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {visibleCols.map(col => (
                    <td key={col.key} style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ height: 14, background: theme.border, borderRadius: 4, width: col.align === 'right' ? 60 : '80%', marginLeft: col.align === 'right' ? 'auto' : 0, animation: 'kpi-pulse 1.6s infinite' }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : allCampaigns.length === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>No campaigns in this period</td>
              </tr>
            ) : (
              allCampaigns.map(camp => {
                const isOpen = expanded.has(camp.name);
                const hasAds = camp.platform === 'Meta' && camp.ads?.length > 0;
                const type = campaignType(camp.name);
                return (
                  <Fragment key={camp.name}>
                    <tr
                      onClick={() => hasAds && setExpanded(prev => { const n = new Set(prev); n.has(camp.name) ? n.delete(camp.name) : n.add(camp.name); return n; })}
                      style={{ cursor: hasAds ? 'pointer' : 'default', background: isOpen ? theme.surfaceAlt : theme.surface, transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = theme.surfaceHover; }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = theme.surface; }}
                    >
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : `1px solid ${theme.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasAds ? <span style={{ color: theme.textMuted, fontSize: 11, flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span> : <span style={{ width: 14, flexShrink: 0 }} />}
                          {type
                            ? <TypeBadge type={type} theme={theme} />
                            : <span title={camp.name} style={{ fontSize: 13, color: theme.textPrimary, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{camp.name}</span>
                          }
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : `1px solid ${theme.border}` }}>
                        <PlatformBadge platform={camp.platform} />
                      </td>
                      {METRIC_COLS.filter(c => visibleMetrics.has(c.key)).map(col => (
                        <td key={col.key} style={{ padding: '12px 16px', textAlign: 'right', borderBottom: isOpen ? 'none' : `1px solid ${theme.border}`, fontSize: 13, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 }}>
                          {fmt(camp[col.key], col.format)}
                        </td>
                      ))}
                    </tr>
                    {isOpen && hasAds && camp.ads.map((ad, ai) => (
                      <AdRow key={`${camp.name}-ad-${ai}`} ad={ad} theme={theme} visibleMetrics={visibleMetrics} />
                    ))}
                    {isOpen && <tr><td colSpan={totalCols} style={{ borderBottom: `1px solid ${theme.border}` }} /></tr>}
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
