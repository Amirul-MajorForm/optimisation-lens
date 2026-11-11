import { useEffect, useMemo, useState } from 'react';
import { BreakableName } from '../campaignName.jsx';

// Top ads drawer: ad-level results with creative thumbnails for the current
// market, date range and lens. Loaded only when opened.

const PLATFORM_BADGE = {
  meta:   { light: ['#e8f0fe', '#1877F2'], dark: ['#1e3a5f', '#93c5fd'] },
  tiktok: { light: ['#f0f0f0', '#010101'], dark: ['#1f2937', '#f1f5f9'] },
};

const money = (v, cur) => (v == null ? '—' : `${cur} ${v.toLocaleString('en-US', { minimumFractionDigits: v >= 1000 ? 0 : 2, maximumFractionDigits: v >= 1000 ? 0 : 2 })}`);
const compact = v => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : Math.round(v).toLocaleString('en-US'));

// Sort options. "min" keeps tiny ads from topping rate-based rankings.
const SORTS = {
  spend: { label: 'Spend', value: a => a.spendSgd ?? a.spend, desc: true },
  ctr:   { label: 'CTR', value: a => a.ctr, desc: true, min: a => a.impressions >= 1000, note: 'ads with 1,000+ impressions' },
  cpm:   { label: 'Lowest CPM', value: a => (a.cpm != null && a.spendSgd != null ? (a.spendSgd / a.spend) * a.cpm : a.cpm), desc: false, min: a => a.impressions >= 1000, note: 'ads with 1,000+ impressions, compared in SGD' },
  roas:  { label: 'ROAS', value: a => a.roas, desc: true, commerceOnly: true, min: a => a.spendSgd == null || a.spendSgd >= 20, note: 'ads with SGD 20+ spend' },
};

export default function TopAdsPanel({ state, lens, marketName, dateLabel, theme, darkMode, onClose }) {
  const [sort, setSort] = useState(lens === 'commerce' ? 'roas' : 'spend');
  const [platform, setPlatform] = useState('all');
  useEffect(() => { setSort(lens === 'commerce' ? 'roas' : 'spend'); setPlatform('all'); }, [lens]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ads = state?.data?.ads || [];
  const platforms = [...new Set(ads.map(a => a.platform))];
  const sortDef = SORTS[sort];
  const list = useMemo(() => ads
    .filter(a => platform === 'all' || a.platform === platform)
    .filter(a => sortDef.value(a) != null && (!sortDef.min || sortDef.min(a)))
    .sort((a, b) => (sortDef.desc ? sortDef.value(b) - sortDef.value(a) : sortDef.value(a) - sortDef.value(b)))
    .slice(0, 10), [ads, platform, sort]);

  const chip = on => ({
    padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    border: `1px solid ${on ? theme.accent : theme.border}`,
    background: on ? theme.accentLight : theme.surface,
    color: on ? theme.accent : theme.textSecondary,
  });

  return (
    <aside role="complementary" aria-label="Top ads" style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(400px, 100vw)', zIndex: 150,
      background: theme.surface, borderLeft: `1px solid ${theme.border}`,
      boxShadow: '-12px 0 32px rgba(8,13,26,0.18)', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '16px 18px 12px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.textPrimary, fontFamily: "'Space Grotesk', sans-serif" }}>Top ads</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>
              {marketName} · {lens === 'commerce' ? 'Meta CPAS' : 'Meta + TikTok brand ads'} · {dateLabel}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close top ads" style={{ border: 'none', background: theme.surfaceAlt, color: theme.textSecondary, width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div role="group" aria-label="Sort top ads" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {Object.entries(SORTS).filter(([, d]) => !d.commerceOnly || lens === 'commerce').map(([k, d]) => (
            <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)} style={chip(sort === k)}>{d.label}</button>
          ))}
        </div>
        {platforms.length > 1 && (
          <div role="group" aria-label="Filter top ads by platform" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            {['all', ...platforms].map(k => (
              <button key={k} aria-pressed={platform === k} onClick={() => setPlatform(k)} style={chip(platform === k)}>
                {k === 'all' ? 'All' : ads.find(a => a.platform === k)?.platformLabel}
              </button>
            ))}
          </div>
        )}
        {sortDef.note && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 6 }}>Ranked among {sortDef.note}.</div>}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 20px' }}>
        {state?.loading && !ads.length && [0, 1, 2, 3].map(i => (
          <div key={i} style={{ height: 92, borderRadius: 10, background: theme.surfaceAlt, marginBottom: 8, animation: 'kpi-pulse 1.6s ease-in-out infinite' }} />
        ))}
        {state?.error && <div style={{ fontSize: 13, color: darkMode ? '#fca5a5' : '#991b1b', padding: 8 }}>Could not load top ads: {state.error}</div>}
        {!state?.loading && !state?.error && list.length === 0 && (
          <div style={{ fontSize: 13, color: theme.textMuted, padding: 8 }}>No ads with spend for this selection.</div>
        )}
        {list.map((a, i) => {
          const [bg, fg] = (darkMode ? PLATFORM_BADGE[a.platform]?.dark : PLATFORM_BADGE[a.platform]?.light) || [theme.surfaceAlt, theme.textSecondary];
          const thumb = a.thumbnail ? (
            <img src={a.thumbnail} alt="" referrerPolicy="no-referrer" loading="lazy"
              style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block', background: theme.surfaceAlt }}
              onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
          ) : <div style={{ width: 72, height: 72, borderRadius: 8, background: theme.surfaceAlt }} />;
          return (
            <div key={`${a.platform}-${a.campaign}-${a.ad}`} style={{ display: 'flex', gap: 10, padding: '10px 6px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted, width: 16, paddingTop: 2, textAlign: 'right' }}>{i + 1}</div>
              <div style={{ flexShrink: 0, position: 'relative' }}>
                {a.previewUrl
                  ? <a href={a.previewUrl} target="_blank" rel="noopener noreferrer" title="Open the ad" aria-label={`Open ad ${a.ad}`}>{thumb}</a>
                  : thumb}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', background: bg, color: fg, padding: '1px 6px', borderRadius: 4 }}>{a.platformLabel}</span>
                  {a.previewUrl && <a href={a.previewUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: theme.accent }}>View ad ↗</a>}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.textPrimary, overflowWrap: 'anywhere', lineHeight: 1.35 }}><BreakableName name={a.ad} /></div>
                <div style={{ fontSize: 11, color: theme.textMuted, overflowWrap: 'anywhere', lineHeight: 1.35 }}><BreakableName name={a.campaign} /></div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4, fontSize: 11.5, color: theme.textSecondary }}>
                  <span><b style={{ color: theme.textPrimary }}>{money(a.spend, a.currency)}</b></span>
                  {lens === 'commerce'
                    ? <>
                        <span>ROAS <b style={{ color: theme.textPrimary }}>{a.roas != null ? `${a.roas.toFixed(2)}x` : '—'}</b></span>
                        <span>{compact(a.orders)} orders</span>
                      </>
                    : <>
                        <span>CTR <b style={{ color: theme.textPrimary }}>{a.ctr != null ? `${a.ctr.toFixed(2)}%` : '—'}</b></span>
                        <span>CPM {money(a.cpm, a.currency)}</span>
                        <span>{compact(a.impressions)} impr.</span>
                      </>}
                </div>
              </div>
            </div>
          );
        })}
        {state?.data?.notes?.length > 0 && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 8 }}>{state.data.notes.join(' · ')}</div>}
      </div>
    </aside>
  );
}
