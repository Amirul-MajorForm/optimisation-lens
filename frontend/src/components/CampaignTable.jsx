import { useState, useEffect, useRef, Fragment } from 'react';
import { CHART, fmt } from '../theme.js';

const ACRONYMS = new Set(['ym', 'cta', 'fb', 'ig', 'sg', 'hk', 'my', 'au', 'lpv', 'cpm', 'cpc', 'cpl', 'cpa', 'roas', 'lal', 'wca', 'tof', 'mof', 'bof', 'dsa', 'abo', 'cbo', 'usp', 'ntb']);

function titleCase(str) {
  return str.replace(/\b([a-z]+)\b/gi, w =>
    ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  );
}

function normName(name) {
  return (name || '').toLowerCase().replace(/_/g, ' ');
}

function campaignType(name) {
  const n = normName(name);
  if (/\blead/.test(n)) return 'Leads';
  if (/\btraffic\b/.test(n)) return 'Traffic';
  if (/\bsale|\bpurchase|\bconversion/.test(n)) return 'Sales';
  if (/\bawareness/.test(n)) return 'Awareness';
  if (/\bretarget|remarketing/.test(n)) return 'Retargeting';
  if (/video.view|vv\b/.test(n)) return 'Video Views';
  if (/\bengage/.test(n)) return 'Engagement';
  if (/\breach\b/.test(n)) return 'Reach';
  return null;
}

function googleSubtype(name) {
  const n = normName(name);
  if (/non.brand/.test(n)) return 'Non-Brand';
  if (/\bbrand\b/.test(n)) return 'Brand';
  if (/\blocation\b|\bloc\b/.test(n)) return 'Location';
  if (/\bcompetitor\b/.test(n)) return 'Competitor';
  if (/\bgeneric\b/.test(n)) return 'Generic';
  if (/\bdynamic\b|\bdsa\b/.test(n)) return 'DSA';
  if (/\bshopping\b/.test(n)) return 'Shopping';
  return null;
}

function simplifyAdset(name) {
  if (!name) return '—';
  const n = normName(name);
  if (/ntb|new.to.brand/.test(n)) return 'New to Brand';
  if (/\blal\b|lookalike/.test(n)) return 'LAL';
  if (/retarget|remarketing/.test(n)) return 'Retargeting';
  if (/\bwca\b/.test(n)) return 'WCA';
  if (/\bbroad\b/.test(n)) return 'Broad';
  if (/\binterest\b/.test(n)) return 'Interest';
  if (/\bengage/.test(n)) return 'Engagement';
  if (/\bprospect/.test(n)) return 'Prospecting';
  // fallback: strip ad format prefix + date prefix, title-case
  const AD_FORMAT_RE = /^(static_single_image|static_carousel|static_story|video_story|video_reel|static|video|carousel|reel|story|dynamic|collection|dsa)_/i;
  let s = name.replace(AD_FORMAT_RE, '').replace(/^\d{4}[_\s]/, '');
  const parts = s.split('_').map(p => titleCase(p.trim().toLowerCase())).filter(Boolean);
  s = parts.join(' ');
  return s.length > 40 ? s.slice(0, 37) + '…' : s || name;
}

function prettifyAdName(str) {
  if (!str) return '—';
  const AD_FORMAT_RE = /^(static_single_image|static_carousel|static_story|video_story|video_reel|static|video|carousel|reel|story|dynamic|collection|dsa)_/i;
  let s = str.replace(AD_FORMAT_RE, '').replace(/^\d{4}[_\s]/, '');
  const parts = s.split('_').map(p => titleCase(p.trim().toLowerCase())).filter(Boolean);
  return parts.join(' - ') || str;
}

function groupAdsByAdset(ads) {
  const map = new Map();
  for (const ad of (ads || [])) {
    const key = ad.adset || '';
    if (!map.has(key)) {
      map.set(key, { adset: key, ads: [], spend: 0, impressions: 0, clicks: 0, lpv: 0, leads: 0 });
    }
    const g = map.get(key);
    g.ads.push(ad);
    g.spend += ad.spend || 0;
    g.impressions += ad.impressions || 0;
    g.clicks += ad.clicks || 0;
    g.lpv += ad.lpv || 0;
    g.leads += ad.leads || 0;
  }
  return Array.from(map.values()).map(g => ({
    ...g,
    ctr: g.impressions > 0 ? (g.clicks / g.impressions) * 100 : 0,
    cpl: g.leads > 0 ? g.spend / g.leads : 0,
    cplv: g.lpv > 0 ? g.spend / g.lpv : 0,
    cpa: g.leads > 0 ? g.spend / g.leads : 0,
    conversions: g.leads,
  }));
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
  { key: 'conversions', label: 'Conv.',       sortKey: 'conversions', align: 'right', format: 'number'   },
  { key: 'ctr',         label: 'CTR',         sortKey: 'ctr',         align: 'right', format: 'percent'  },
  { key: 'cpl',         label: 'CPL',         sortKey: 'cpl',         align: 'right', format: 'currency' },
  { key: 'cpa',         label: 'CPA',         sortKey: 'cpa',         align: 'right', format: 'currency' },
  { key: 'cplv',        label: 'CPLV',        sortKey: 'cplv',        align: 'right', format: 'currency' },
];

const LS_KEY = 'campaign-table-metrics';
const DEFAULT_METRICS = new Set(['spend', 'clicks', 'leads', 'ctr', 'cpl']);

const TYPE_COLORS = {
  Leads:        { bg: '#dbeafe', text: '#1d4ed8' },
  Traffic:      { bg: '#d1fae5', text: '#065f46' },
  Sales:        { bg: '#fef3c7', text: '#92400e' },
  Awareness:    { bg: '#ede9fe', text: '#5b21b6' },
  Retargeting:  { bg: '#fee2e2', text: '#991b1b' },
  'Video Views':{ bg: '#e0f2fe', text: '#0369a1' },
  Engagement:   { bg: '#fce7f3', text: '#9d174d' },
  Reach:        { bg: '#f0fdf4', text: '#166534' },
};

function TypeBadge({ type, theme }) {
  const colors = TYPE_COLORS[type] || { bg: theme.surfaceAlt, text: theme.textMuted };
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: colors.bg, color: colors.text, whiteSpace: 'nowrap' }}>
      {type}
    </span>
  );
}

function SubtypeBadge({ label, theme }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: theme.surfaceAlt, color: theme.textSecondary, whiteSpace: 'nowrap', border: `1px solid ${theme.border}` }}>
      {label}
    </span>
  );
}

function PlatformBadge({ platform }) {
  const color = platform === 'Meta' ? CHART.meta : CHART.google;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: color + '20', color }}>
      {platform}
    </span>
  );
}

function SortIcon({ dir }) {
  return <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 3 }}>{dir === 'asc' ? '▲' : '▼'}</span>;
}

function metricCellStyle(theme, borderBottom) {
  return { padding: '10px 16px', textAlign: 'right', borderBottom, fontSize: 13, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500 };
}

function AdRow({ ad, theme, visibleMetrics, totalCols }) {
  const derived = {
    ctr: (ad.impressions || 0) > 0 ? ((ad.clicks || 0) / (ad.impressions || 0)) * 100 : 0,
    cpl: (ad.leads || 0) > 0 ? (ad.spend || 0) / (ad.leads || 0) : 0,
    cpa: (ad.leads || 0) > 0 ? (ad.spend || 0) / (ad.leads || 0) : 0,
    cplv: (ad.lpv || 0) > 0 ? (ad.spend || 0) / (ad.lpv || 0) : 0,
    conversions: ad.leads || 0,
    ...ad,
  };
  const border = `1px solid ${theme.border}`;
  return (
    <tr style={{ background: theme.bg }}>
      <td style={{ padding: '8px 16px 8px 64px', borderBottom: border }}>
        <span title={ad.ad || ''} style={{ fontSize: 12, color: theme.textSecondary, userSelect: 'text' }}>
          {prettifyAdName(ad.ad)}
        </span>
      </td>
      <td style={{ padding: '8px 16px', borderBottom: border }} />
      {METRIC_COLS.filter(c => visibleMetrics.has(c.key)).map(col => (
        <td key={col.key} style={{ padding: '8px 16px', textAlign: 'right', borderBottom: border, fontSize: 12, color: theme.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>
          {fmt(derived[col.key], col.format)}
        </td>
      ))}
    </tr>
  );
}

function AdsetRow({ adsetGroup, campName, theme, visibleMetrics, expandedAdsets, toggleAdset }) {
  const key = `${campName}||${adsetGroup.adset}`;
  const isOpen = expandedAdsets.has(key);
  const hasAds = adsetGroup.ads?.length > 0;
  const label = simplifyAdset(adsetGroup.adset);
  const border = `1px solid ${theme.border}`;

  return (
    <Fragment>
      <tr style={{ background: theme.surfaceAlt }}>
        <td style={{ padding: '9px 16px 9px 32px', borderBottom: isOpen ? 'none' : border }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasAds ? (
              <span onClick={() => toggleAdset(key)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 10, flexShrink: 0, padding: '2px 3px' }}>
                {isOpen ? '▼' : '▶'}
              </span>
            ) : <span style={{ width: 14, flexShrink: 0 }} />}
            <span title={adsetGroup.adset} style={{ fontSize: 12, color: theme.textSecondary, fontWeight: 500, userSelect: 'text' }}>
              {label}
            </span>
          </div>
        </td>
        <td style={{ padding: '9px 16px', borderBottom: isOpen ? 'none' : border }} />
        {METRIC_COLS.filter(c => visibleMetrics.has(c.key)).map(col => (
          <td key={col.key} style={{ padding: '9px 16px', textAlign: 'right', borderBottom: isOpen ? 'none' : border, fontSize: 12, color: theme.textSecondary, fontFamily: "'Space Grotesk', sans-serif" }}>
            {fmt(adsetGroup[col.key], col.format)}
          </td>
        ))}
      </tr>
      {isOpen && hasAds && adsetGroup.ads.map((ad, ai) => (
        <AdRow key={`${key}-ad-${ai}`} ad={ad} theme={theme} visibleMetrics={visibleMetrics} />
      ))}
      {isOpen && <tr><td colSpan={100} style={{ borderBottom: border }} /></tr>}
    </Fragment>
  );
}

export default function CampaignTable({ theme, metaCampaigns, googleCampaigns, loading }) {
  const [expanded, setExpanded] = useState(new Set());
  const [expandedAdsets, setExpandedAdsets] = useState(new Set());
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

  const toggleExpand = (name) => setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const toggleAdset = (key) => setExpandedAdsets(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const allCampaigns = [
    ...(metaCampaigns || []).map(c => ({
      ...c, platform: 'Meta',
      leads: c.leads ?? 0, lpv: c.lpv ?? 0,
      conversions: c.leads ?? 0,
      cplv: (c.lpv ?? 0) > 0 ? (c.spend ?? 0) / (c.lpv ?? 0) : 0,
      cpa: (c.leads ?? 0) > 0 ? (c.spend ?? 0) / (c.leads ?? 0) : 0,
    })),
    ...(googleCampaigns || []).map(c => ({
      ...c, platform: 'Google',
      leads: c.conversions ?? 0, lpv: 0,
      conversions: c.conversions ?? 0,
      cplv: 0,
      cpa: (c.conversions ?? 0) > 0 ? (c.spend ?? 0) / (c.conversions ?? 0) : 0,
    })),
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
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{allCampaigns.length} campaigns · expand to see ad sets & ads</div>
        </div>
        <div style={{ marginLeft: 'auto', position: 'relative' }} ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(o => !o)}
            style={{ background: pickerOpen ? theme.accent : theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: pickerOpen ? '#fff' : theme.textSecondary, fontSize: 12, fontWeight: 500, fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 5, transition: 'background 0.15s, color 0.15s' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
              <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
            </svg>
            Columns
          </button>
          {pickerOpen && (
            <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 6, background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '10px 0', zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 160 }}>
              {METRIC_COLS.map(col => (
                <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', cursor: 'pointer', fontSize: 13, color: theme.textPrimary, fontFamily: "'DM Sans', sans-serif" }}>
                  <input type="checkbox" checked={visibleMetrics.has(col.key)} onChange={() => toggleMetric(col.key)} style={{ accentColor: theme.accent, width: 14, height: 14 }} />
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
                const subtype = camp.platform === 'Google' ? googleSubtype(camp.name) : null;
                const adsetGroups = hasAds ? groupAdsByAdset(camp.ads) : [];
                const border = `1px solid ${theme.border}`;
                return (
                  <Fragment key={camp.name}>
                    <tr style={{ background: isOpen ? theme.surfaceAlt : theme.surface, transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = theme.surfaceHover; }}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = theme.surface; }}
                    >
                      {/* Name cell — text selectable, expand via arrow icon */}
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : border, maxWidth: 300 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {hasAds ? (
                            <span onClick={() => toggleExpand(camp.name)} style={{ cursor: 'pointer', color: theme.textMuted, fontSize: 10, flexShrink: 0, padding: '2px 4px' }}>
                              {isOpen ? '▼' : '▶'}
                            </span>
                          ) : <span style={{ width: 14, flexShrink: 0 }} />}
                          <div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                              {type && <TypeBadge type={type} theme={theme} />}
                              {subtype && <SubtypeBadge label={subtype} theme={theme} />}
                            </div>
                            <div title={camp.name} style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, userSelect: 'text', cursor: 'text', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {camp.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: isOpen ? 'none' : border }}>
                        <PlatformBadge platform={camp.platform} />
                      </td>
                      {METRIC_COLS.filter(c => visibleMetrics.has(c.key)).map(col => (
                        <td key={col.key} style={metricCellStyle(theme, isOpen ? 'none' : border)}>
                          {fmt(camp[col.key], col.format)}
                        </td>
                      ))}
                    </tr>
                    {isOpen && adsetGroups.map((ag, gi) => (
                      <AdsetRow
                        key={`${camp.name}||${ag.adset}||${gi}`}
                        adsetGroup={ag}
                        campName={camp.name}
                        theme={theme}
                        visibleMetrics={visibleMetrics}
                        expandedAdsets={expandedAdsets}
                        toggleAdset={toggleAdset}
                      />
                    ))}
                    {isOpen && <tr><td colSpan={totalCols} style={{ borderBottom: border }} /></tr>}
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
